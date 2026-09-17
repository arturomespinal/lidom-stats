"""
src/pipeline/boxscore_ingestor.py — MLB Stats API → esquema de granularidad de juego.

A diferencia de MLBIngestor (que puebla las tablas planas desde /stats con
agregados ya calculados por la API), este ingestor puebla el esquema canónico:

    /schedule                   → seasons, teams, games
    /game/{gamePk}/boxscore     → batting_lines, pitching_lines
    /people?personIds=...       → players (batch, no 1 request por jugador)

Regla 3 del proyecto: en batting_lines y pitching_lines NO se guarda ningún
agregado (AVG, ERA, WHIP). Solo conteos atómicos. Los promedios salen de las
vistas v_batting_season / v_pitching_season.

Idempotencia:
    - game_id es un slug determinístico: "2025-10-15-TOR-EST-1"
    - PK compuesta (game_id, player_id) en ambas tablas de líneas
    - session.merge() en todo: re-ejecutar actualiza, nunca duplica
    - Checkpoint: los juegos que ya tienen líneas se saltan salvo refresh=True

Nota sobre el etiquetado de temporada:
    La MLB API nombra la temporada invernal por el año en que EMPIEZA.
    season="2025" → juegos de oct-2025 a ene-2026 → season_id "2025-26".
"""

from __future__ import annotations

import math
import re
import unicodedata
from datetime import date, datetime
from typing import Any, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.clients.mlb_api import MLBAPIClient
from src.constants import DEFAULT_DB_URL, LIDOM_TEAMS
from src.models.database import (
    BattingLine,
    Game,
    PitchingLine,
    Player,
    Season,
    Team,
    get_engine,
)
from src.utils.logger import logger


# ─────────────────────────────────────────────────────────────────────────────
# Mappings de dominio
# ─────────────────────────────────────────────────────────────────────────────

# gameType de la MLB API → nuestra columna games.stage
GAME_TYPE_TO_STAGE: dict[str, str] = {
    "R": "regular",
    "P": "round_robin",
    "D": "semifinal",
    "L": "final",
    "W": "serie_caribe",
}

# status.codedGameState → nuestra columna games.status
CODED_STATE_TO_STATUS: dict[str, str] = {
    "F": "final",
    "O": "final",       # "Game Over" — final pero aún sin cerrar oficialmente
    "I": "live",
    "M": "live",         # Manager challenge / review en vivo
    "P": "scheduled",
    "S": "scheduled",
    "D": "postponed",
    "C": "cancelled",
    "U": "suspended",
    "T": "suspended",
}

# birthCountry de la MLB API → código de 3 letras (columna players.nationality)
COUNTRY_TO_CODE: dict[str, str] = {
    "Dominican Republic": "DOM",
    "USA": "USA",
    "Venezuela": "VEN",
    "Puerto Rico": "PUR",
    "Cuba": "CUB",
    "Mexico": "MEX",
    "Colombia": "COL",
    "Panama": "PAN",
    "Curacao": "CUW",
    "Aruba": "ABW",
    "Nicaragua": "NIC",
    "Canada": "CAN",
    "Japan": "JPN",
    "South Korea": "KOR",
    "Brazil": "BRA",
    "Bahamas": "BHS",
    "Honduras": "HND",
}

# Cuántos personIds pedimos por request a /people (la URL tiene límite práctico)
PEOPLE_BATCH_SIZE = 100

# Cuántos juegos procesamos antes de hacer commit (checkpoint incremental)
GAME_CHUNK_SIZE = 25


# ─────────────────────────────────────────────────────────────────────────────
# Helpers puros
# ─────────────────────────────────────────────────────────────────────────────


def _safe_int(val: Any, default: Optional[int] = 0) -> Optional[int]:
    """Convierte a int tolerando None, '', '-' y strings no numéricos."""
    if val is None or val in ("", "-", "--", ".---"):
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def slugify(text: str) -> str:
    """
    'José Manuel Fernández' → 'jose-manuel-fernandez'

    Quita acentos vía normalización NFKD para que el mismo jugador produzca
    siempre el mismo slug, escriba la API su nombre con tilde o sin ella.
    """
    normalized = unicodedata.normalize("NFKD", text)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_only).strip("-").lower()
    return cleaned or "sin-nombre"


def build_player_id(full_name: str, birth_date: Optional[str], mlb_id: int) -> str:
    """
    Slug determinístico según la convención del esquema: nombre + fecha de
    nacimiento ("juan-soto-1998-10-25"). La fecha desambigua homónimos, que en
    béisbol dominicano abundan.

    Sin birth_date caemos al mlb_id, que siempre es único.
    """
    base = slugify(full_name)
    suffix = birth_date if birth_date else f"mlb{mlb_id}"
    return f"{base}-{suffix}"[:80]


def build_game_id(
    game_date: str, away_code: str, home_code: str, game_number: int
) -> str:
    """'2025-10-15-TOR-EST-1' — fecha local + visitante + local + nro de juego."""
    return f"{game_date}-{away_code}-{home_code}-{game_number}"


def parse_height_cm(height: Optional[str]) -> Optional[int]:
    """La MLB API devuelve altura como \"6' 1\\\"\" — la pasamos a centímetros."""
    if not height:
        return None
    match = re.search(r"(\d+)\D+(\d+)", height)
    if not match:
        return None
    feet, inches = int(match.group(1)), int(match.group(2))
    return round((feet * 12 + inches) * 2.54)


def parse_weight_kg(weight: Any) -> Optional[int]:
    """Libras → kilogramos."""
    lbs = _safe_int(weight, default=None)
    return round(lbs * 0.453592) if lbs else None


def mlb_season_to_season_id(season: str) -> str:
    """
    '2025' → '2025-26'

    La temporada invernal cruza el cambio de año y la MLB API la etiqueta por
    el año de inicio. Confirmado contra /schedule: season=2025 arranca el
    2025-10-15, season=2024 el 2024-10-16.
    """
    start_year = int(season)
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def _chunks(items: list, size: int) -> Iterable[list]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


# ─────────────────────────────────────────────────────────────────────────────
# Ingestor
# ─────────────────────────────────────────────────────────────────────────────


class BoxscoreIngestor:
    def __init__(self, db_url: str = DEFAULT_DB_URL):
        self.engine = get_engine(db_url)

    # ── Entry point ───────────────────────────────────────────────────────────

    def ingest(
        self,
        season: str = "2025",
        game_type: str = "R",
        refresh: bool = False,
        max_games: Optional[int] = None,
    ) -> dict:
        """
        Puebla seasons, teams, games, players, batting_lines y pitching_lines.

        Args:
            season: temporada MLB ("2025" = campaña invernal 2025-26)
            game_type: "R" regular, "P" round robin, "L" final, "W" Serie Caribe
            refresh: si True re-procesa juegos que ya tienen líneas
            max_games: corta tras N juegos (para pruebas rápidas)

        Returns:
            dict con el resumen de filas afectadas por tabla.
        """
        season_id = mlb_season_to_season_id(season)
        summary = {
            "season_id": season_id,
            "teams": 0,
            "games": 0,
            "games_skipped": 0,
            "players": 0,
            "batting_lines": 0,
            "pitching_lines": 0,
        }

        with MLBAPIClient() as client:
            # 1. Catálogo de equipos — sin esto los FK de games fallan.
            summary["teams"] = self._upsert_teams()

            # 2. Calendario → games + metadata de la temporada.
            schedule_games = self._fetch_schedule(client, season, game_type)
            if not schedule_games:
                logger.warning(f"⚠️ /schedule no devolvió juegos para {season}")
                return summary

            self._upsert_season(season_id, schedule_games)
            summary["games"] = self._upsert_games(season_id, schedule_games)

            # 3. Boxscores de los juegos finalizados.
            playable = [g for g in schedule_games if g["status"] == "final"]
            pending = self._filter_pending(playable, refresh=refresh)
            summary["games_skipped"] = len(playable) - len(pending)

            if max_games is not None:
                pending = pending[:max_games]

            logger.info(
                f"  boxscores por procesar: {len(pending)} "
                f"(finalizados: {len(playable)}, ya ingestados: {summary['games_skipped']})"
            )

            # Set y no contador: un jugador aparece en muchos chunks y sumarlos
            # daría un total inflado que no corresponde a ninguna fila real.
            seen_players: set[int] = set()

            for chunk_index, chunk in enumerate(_chunks(pending, GAME_CHUNK_SIZE), 1):
                counts = self._ingest_game_chunk(client, chunk)
                seen_players |= counts["player_ids"]
                summary["players"] = len(seen_players)
                summary["batting_lines"] += counts["batting_lines"]
                summary["pitching_lines"] += counts["pitching_lines"]
                logger.info(
                    f"  chunk {chunk_index}: {len(chunk)} juegos → "
                    f"{counts['batting_lines']} líneas de bateo, "
                    f"{counts['pitching_lines']} de pitcheo"
                )

        logger.success(f"✅ Ingesta de boxscores completa para {season_id}: {summary}")
        return summary

    # ── Paso 1: equipos ───────────────────────────────────────────────────────

    def _upsert_teams(self) -> int:
        """
        Catálogo de los seis equipos desde LIDOM_TEAMS. Es la fuente canónica:
        preferimos nuestros nombres con tildes sobre los de la API, que a veces
        devuelve "Aguilas Cibaenas".
        """
        with Session(self.engine) as session:
            for mlb_id, info in LIDOM_TEAMS.items():
                session.merge(Team(
                    team_code=info["team_code"],
                    full_name=info["full_name"],
                    short_name=info.get("short_name"),
                    city=info.get("city"),
                    founded_year=_safe_int(info.get("founded_year"), default=None),
                    primary_color=info.get("primary_color"),
                    is_active=True,
                ))
            session.commit()
        return len(LIDOM_TEAMS)

    # ── Paso 2: calendario ────────────────────────────────────────────────────

    def _fetch_schedule(
        self, client: MLBAPIClient, season: str, game_type: str
    ) -> list[dict]:
        """
        Aplana /schedule a una lista de dicts normalizados.

        Descarta cualquier juego donde alguno de los dos equipos no esté en
        LIDOM_TEAMS — misma validación defensiva que MLBIngestor.
        """
        raw = client.get_schedule(season=season, game_type=game_type)
        games: list[dict] = []

        for date_entry in raw.get("dates", []):
            for g in date_entry.get("games", []):
                teams = g.get("teams", {})
                home_id = teams.get("home", {}).get("team", {}).get("id")
                away_id = teams.get("away", {}).get("team", {}).get("id")

                if home_id not in LIDOM_TEAMS or away_id not in LIDOM_TEAMS:
                    continue

                home_code = LIDOM_TEAMS[home_id]["team_code"]
                away_code = LIDOM_TEAMS[away_id]["team_code"]

                # officialDate es la fecha LOCAL del juego; gameDate viene en UTC
                # y un juego nocturno cruzaría de día si usáramos ese.
                official = g.get("officialDate") or g.get("gameDate", "")[:10]
                game_number = _safe_int(g.get("gameNumber"), default=1) or 1
                coded = g.get("status", {}).get("codedGameState", "")

                games.append({
                    "game_pk": g.get("gamePk"),
                    "game_id": build_game_id(official, away_code, home_code, game_number),
                    "game_date": official,
                    "game_datetime_utc": g.get("gameDate"),
                    "home_team_code": home_code,
                    "away_team_code": away_code,
                    "home_score": _safe_int(
                        teams.get("home", {}).get("score"), default=None
                    ),
                    "away_score": _safe_int(
                        teams.get("away", {}).get("score"), default=None
                    ),
                    "stage": GAME_TYPE_TO_STAGE.get(g.get("gameType", "R"), "regular"),
                    "status": CODED_STATE_TO_STATUS.get(coded, "scheduled"),
                    "venue": g.get("venue", {}).get("name"),
                    "scheduled_innings": _safe_int(g.get("scheduledInnings"), default=9),
                })

        deduped = self._resolve_duplicates(games)
        logger.info(
            f"  /schedule: {len(deduped)} juegos LIDOM en {season} ({game_type})"
            + (f" — {len(games) - len(deduped)} entradas duplicadas resueltas"
               if len(deduped) != len(games) else "")
        )
        return deduped

    @staticmethod
    def _resolve_duplicates(games: list[dict]) -> list[dict]:
        """
        Varias entradas de /schedule pueden caer en el mismo game_id: la MLB API
        lista un juego pospuesto junto a su reposición, con la misma fecha y los
        mismos equipos.

        Sin esto ganaba el último en procesarse, que es un orden que no
        controlamos. Un juego pospuesto llegando después del jugado le
        sobreescribiría el marcador con NULL y el estado con 'postponed'; y como
        el checkpoint se salta los boxscores ya cargados, el dato no se
        recuperaría en la siguiente corrida.

        Precedencia: juego final > juego con marcador > gamePk más alto.
        """
        best: dict[str, dict] = {}
        collisions: dict[str, list[int]] = {}

        def rank(g: dict) -> tuple[int, int, int]:
            return (
                1 if g["status"] == "final" else 0,
                1 if g["home_score"] is not None else 0,
                g["game_pk"] or 0,
            )

        for g in games:
            gid = g["game_id"]
            if gid in best:
                collisions.setdefault(gid, [best[gid]["game_pk"]]).append(g["game_pk"])
                if rank(g) > rank(best[gid]):
                    best[gid] = g
            else:
                best[gid] = g

        for gid, pks in collisions.items():
            logger.debug(
                f"  game_id duplicado {gid}: gamePks {pks} → se conserva "
                f"{best[gid]['game_pk']} ({best[gid]['status']})"
            )

        return list(best.values())

    def _upsert_season(self, season_id: str, games: list[dict]) -> None:
        """Metadata de la temporada, con fechas reales tomadas del calendario."""
        dates = sorted(g["game_date"] for g in games if g["game_date"])
        regular = [g for g in games if g["stage"] == "regular"]

        with Session(self.engine) as session:
            session.merge(Season(
                season_id=season_id,
                short_label=season_id,
                start_date=date.fromisoformat(dates[0]) if dates else None,
                end_date=date.fromisoformat(dates[-1]) if dates else None,
                # Juegos por equipo = juegos regulares * 2 / 6 equipos
                regular_season_games=(
                    round(len(regular) * 2 / len(LIDOM_TEAMS)) if regular else None
                ),
                teams_count=len(LIDOM_TEAMS),
            ))
            session.commit()

    def _upsert_games(self, season_id: str, games: list[dict]) -> int:
        with Session(self.engine) as session:
            # innings_played lo calcula la pasada de boxscores con los outs
            # reales. Aquí solo sembramos scheduledInnings para los juegos
            # nuevos: si pisáramos el valor ya calculado, cada re-ejecución
            # devolvería a 9 los juegos de entradas extra cuyo boxscore el
            # checkpoint se salta.
            existing_innings = {
                row[0]: row[1]
                for row in session.execute(select(Game.game_id, Game.innings_played))
            }

            for g in games:
                session.merge(Game(
                    game_id=g["game_id"],
                    season_id=season_id,
                    game_date=date.fromisoformat(g["game_date"]),
                    game_datetime_utc=self._parse_utc(g["game_datetime_utc"]),
                    home_team_code=g["home_team_code"],
                    away_team_code=g["away_team_code"],
                    home_score=g["home_score"],
                    away_score=g["away_score"],
                    innings_played=existing_innings.get(
                        g["game_id"]
                    ) or g["scheduled_innings"],
                    stage=g["stage"],
                    status=g["status"],
                    venue=g["venue"],
                    source="mlb_api",
                    source_url=f"https://statsapi.mlb.com/api/v1/game/{g['game_pk']}/boxscore",
                ))
            session.commit()
        return len(games)

    @staticmethod
    def _parse_utc(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(
                tzinfo=None
            )
        except ValueError:
            return None

    # ── Checkpoint ────────────────────────────────────────────────────────────

    def _filter_pending(self, games: list[dict], refresh: bool) -> list[dict]:
        """
        Devuelve los juegos que todavía no tienen líneas de bateo cargadas.
        Reanudar una corrida interrumpida no rehace ~150 requests.
        """
        if refresh:
            return games

        with Session(self.engine) as session:
            already = {
                row[0]
                for row in session.execute(select(BattingLine.game_id).distinct())
            }
        return [g for g in games if g["game_id"] not in already]

    # ── Paso 3: boxscores ─────────────────────────────────────────────────────

    def _ingest_game_chunk(self, client: MLBAPIClient, chunk: list[dict]) -> dict:
        """
        Procesa un bloque de juegos: baja boxscores, resuelve los jugadores
        nuevos en batch contra /people, y escribe las líneas.

        El orden importa: players debe existir antes que las líneas, porque
        get_engine() activa PRAGMA foreign_keys=ON.
        """
        batting_rows: list[dict] = []
        pitching_rows: list[dict] = []
        innings_by_game: dict[str, int] = {}
        person_ids: set[int] = set()

        for g in chunk:
            try:
                box = client.get_boxscore(g["game_pk"])
            except Exception as exc:
                logger.error(f"  ✗ boxscore {g['game_pk']} ({g['game_id']}): {exc}")
                continue

            bats, pitches, outs_by_side = self._parse_boxscore(box, g)
            batting_rows.extend(bats)
            pitching_rows.extend(pitches)
            person_ids.update(r["mlb_id"] for r in bats)
            person_ids.update(r["mlb_id"] for r in pitches)

            # Innings reales: los outs que registró el pitcheo de un lado son
            # los outs que hizo el bateo del otro. El máximo de ambos lados,
            # redondeado hacia arriba, da las entradas jugadas — así los juegos
            # de entradas extra no quedan clavados en 9.
            if outs_by_side:
                innings_by_game[g["game_id"]] = max(
                    1, math.ceil(max(outs_by_side.values()) / 3)
                )

        player_ids = self._upsert_players(client, person_ids)

        with Session(self.engine) as session:
            written_bat = 0
            for row in batting_rows:
                pid = player_ids.get(row["mlb_id"])
                if not pid:
                    continue
                session.merge(BattingLine(
                    game_id=row["game_id"],
                    player_id=pid,
                    team_code=row["team_code"],
                    batting_order=row["batting_order"],
                    position=row["position"],
                    plate_appearances=row["plate_appearances"],
                    at_bats=row["at_bats"],
                    runs=row["runs"],
                    hits=row["hits"],
                    doubles=row["doubles"],
                    triples=row["triples"],
                    home_runs=row["home_runs"],
                    rbi=row["rbi"],
                    walks=row["walks"],
                    intentional_walks=row["intentional_walks"],
                    strikeouts=row["strikeouts"],
                    hit_by_pitch=row["hit_by_pitch"],
                    sacrifice_flies=row["sacrifice_flies"],
                    sacrifice_bunts=row["sacrifice_bunts"],
                    stolen_bases=row["stolen_bases"],
                    caught_stealing=row["caught_stealing"],
                    grounded_into_dp=row["grounded_into_dp"],
                    left_on_base=row["left_on_base"],
                ))
                written_bat += 1

            written_pit = 0
            for row in pitching_rows:
                pid = player_ids.get(row["mlb_id"])
                if not pid:
                    continue
                session.merge(PitchingLine(
                    game_id=row["game_id"],
                    player_id=pid,
                    team_code=row["team_code"],
                    is_starter=row["is_starter"],
                    pitching_order=row["pitching_order"],
                    decision=row["decision"],
                    outs_recorded=row["outs_recorded"],
                    batters_faced=row["batters_faced"],
                    pitches_thrown=row["pitches_thrown"],
                    strikes=row["strikes"],
                    hits_allowed=row["hits_allowed"],
                    runs_allowed=row["runs_allowed"],
                    earned_runs=row["earned_runs"],
                    home_runs_allowed=row["home_runs_allowed"],
                    walks_allowed=row["walks_allowed"],
                    intentional_walks_allowed=row["intentional_walks_allowed"],
                    strikeouts=row["strikeouts"],
                    hit_batters=row["hit_batters"],
                    wild_pitches=row["wild_pitches"],
                    balks=row["balks"],
                ))
                written_pit += 1

            # Corrección de entradas jugadas con el dato real del boxscore.
            for game_id, innings in innings_by_game.items():
                game = session.get(Game, game_id)
                if game:
                    game.innings_played = innings

            session.commit()

        return {
            "player_ids": set(player_ids),
            "batting_lines": written_bat,
            "pitching_lines": written_pit,
        }

    def _parse_boxscore(
        self, box: dict, game: dict
    ) -> tuple[list[dict], list[dict], dict[str, int]]:
        """
        Extrae las líneas individuales de un boxscore.

        Estructura: box['teams']['home'|'away']['players']['ID123'] con
        'stats.batting' y 'stats.pitching' del JUEGO (seasonStats tiene los
        acumulados de temporada — no los usamos aquí).
        """
        batting: list[dict] = []
        pitching: list[dict] = []
        outs_by_side: dict[str, int] = {}

        for side in ("home", "away"):
            side_data = box.get("teams", {}).get(side, {})
            team_code = game[f"{side}_team_code"]

            # El orden de aparición en 'pitchers' define quién abrió y quién
            # entró después: el índice 0 es el abridor.
            pitcher_order = {
                pid: idx + 1
                for idx, pid in enumerate(side_data.get("pitchers", []))
            }
            side_outs = 0

            for player in side_data.get("players", {}).values():
                person = player.get("person", {})
                mlb_id = person.get("id")
                if not mlb_id:
                    continue

                stats = player.get("stats", {})

                bat = stats.get("batting") or {}
                if bat:
                    batting.append({
                        "game_id": game["game_id"],
                        "mlb_id": mlb_id,
                        "team_code": team_code,
                        "batting_order": _safe_int(
                            player.get("battingOrder"), default=None
                        ),
                        "position": player.get("position", {}).get("abbreviation"),
                        "plate_appearances": _safe_int(bat.get("plateAppearances")),
                        "at_bats": _safe_int(bat.get("atBats")),
                        "runs": _safe_int(bat.get("runs")),
                        "hits": _safe_int(bat.get("hits")),
                        "doubles": _safe_int(bat.get("doubles")),
                        "triples": _safe_int(bat.get("triples")),
                        "home_runs": _safe_int(bat.get("homeRuns")),
                        "rbi": _safe_int(bat.get("rbi")),
                        "walks": _safe_int(bat.get("baseOnBalls")),
                        "intentional_walks": _safe_int(bat.get("intentionalWalks")),
                        "strikeouts": _safe_int(bat.get("strikeOuts")),
                        "hit_by_pitch": _safe_int(bat.get("hitByPitch")),
                        "sacrifice_flies": _safe_int(bat.get("sacFlies")),
                        "sacrifice_bunts": _safe_int(bat.get("sacBunts")),
                        "stolen_bases": _safe_int(bat.get("stolenBases")),
                        "caught_stealing": _safe_int(bat.get("caughtStealing")),
                        "grounded_into_dp": _safe_int(bat.get("groundIntoDoublePlay")),
                        "left_on_base": _safe_int(bat.get("leftOnBase")),
                    })

                pit = stats.get("pitching") or {}
                if pit:
                    outs = _safe_int(pit.get("outs"))
                    side_outs += outs or 0
                    pitching.append({
                        "game_id": game["game_id"],
                        "mlb_id": mlb_id,
                        "team_code": team_code,
                        "is_starter": _safe_int(pit.get("gamesStarted")) == 1,
                        "pitching_order": pitcher_order.get(mlb_id),
                        "decision": self._decision_from(pit),
                        "outs_recorded": outs,
                        "batters_faced": _safe_int(pit.get("battersFaced")),
                        "pitches_thrown": _safe_int(
                            pit.get("pitchesThrown") or pit.get("numberOfPitches"),
                            default=None,
                        ),
                        "strikes": _safe_int(pit.get("strikes"), default=None),
                        "hits_allowed": _safe_int(pit.get("hits")),
                        "runs_allowed": _safe_int(pit.get("runs")),
                        "earned_runs": _safe_int(pit.get("earnedRuns")),
                        "home_runs_allowed": _safe_int(pit.get("homeRuns")),
                        "walks_allowed": _safe_int(pit.get("baseOnBalls")),
                        "intentional_walks_allowed": _safe_int(
                            pit.get("intentionalWalks")
                        ),
                        "strikeouts": _safe_int(pit.get("strikeOuts")),
                        "hit_batters": _safe_int(pit.get("hitBatsmen")),
                        "wild_pitches": _safe_int(pit.get("wildPitches")),
                        "balks": _safe_int(pit.get("balks")),
                    })

            outs_by_side[side] = side_outs

        return batting, pitching, outs_by_side

    @staticmethod
    def _decision_from(pit: dict) -> Optional[str]:
        """
        La decisión del lanzador en ESTE juego.

        En el boxscore, stats.pitching trae el juego (0 ó 1), mientras que
        seasonStats.pitching trae el acumulado. Por eso leemos de stats y no
        parseamos el string 'note', que no siempre viene.
        """
        if _safe_int(pit.get("wins")) == 1:
            return "W"
        if _safe_int(pit.get("losses")) == 1:
            return "L"
        if _safe_int(pit.get("saves")) == 1:
            return "SV"
        if _safe_int(pit.get("holds")):
            return "HLD"
        if _safe_int(pit.get("blownSaves")):
            return "BS"
        return None

    # ── Jugadores ─────────────────────────────────────────────────────────────

    def _upsert_players(
        self, client: MLBAPIClient, person_ids: set[int]
    ) -> dict[int, str]:
        """
        Resuelve mlb_id → player_id, creando los jugadores que falten.

        Dos cuidados:
          1. Si el jugador ya existe (por mlb_id, que es UNIQUE), reusamos su
             player_id. Si la API cambiara la grafía de su nombre entre
             temporadas, el slug nuevo chocaría contra el mlb_id existente.
          2. Pedimos /people en lotes, no uno por uno: son ~450 jugadores por
             temporada y serían ~450 requests innecesarios.
        """
        if not person_ids:
            return {}

        resolved: dict[int, str] = {}

        with Session(self.engine) as session:
            existing = session.execute(
                select(Player.mlb_id, Player.player_id).where(
                    Player.mlb_id.in_(person_ids)
                )
            ).all()
            resolved = {mlb_id: pid for mlb_id, pid in existing}

        missing = sorted(person_ids - set(resolved))
        if not missing:
            return resolved

        for batch in _chunks(missing, PEOPLE_BATCH_SIZE):
            try:
                people = client.get_people(batch).get("people", [])
            except Exception as exc:
                logger.error(f"  ✗ /people batch de {len(batch)}: {exc}")
                continue

            with Session(self.engine) as session:
                for person in people:
                    mlb_id = person.get("id")
                    if not mlb_id:
                        continue

                    full_name = person.get("fullName", "")
                    birth_date = person.get("birthDate")
                    player_id = build_player_id(full_name, birth_date, mlb_id)

                    session.merge(Player(
                        player_id=player_id,
                        full_name=full_name,
                        birth_date=(
                            date.fromisoformat(birth_date) if birth_date else None
                        ),
                        bats=person.get("batSide", {}).get("code"),
                        throws=person.get("pitchHand", {}).get("code"),
                        nationality=COUNTRY_TO_CODE.get(
                            person.get("birthCountry", ""), "DOM"
                        ),
                        height_cm=parse_height_cm(person.get("height")),
                        weight_kg=parse_weight_kg(person.get("weight")),
                        mlb_id=mlb_id,
                    ))
                    resolved[mlb_id] = player_id
                session.commit()

        faltantes = person_ids - set(resolved)
        if faltantes:
            logger.warning(
                f"  ⚠️ {len(faltantes)} jugadores sin resolver en /people; "
                f"sus líneas se omiten"
            )

        return resolved


__all__ = ["BoxscoreIngestor"]
