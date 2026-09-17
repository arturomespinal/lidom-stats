"""
src/pipeline/mlb_ingestor.py — MLB Stats API → flat DB tables.

Flujo:
    standings  → GET /standings?leagueId=131    → tabla standings
    batting    → GET /stats?group=hitting       → tabla batting_stats
    pitching   → GET /stats?group=pitching      → tabla pitching_stats

Idempotencia garantizada:
    session.merge() hace INSERT si (season, team_id/mlb_player_id) no existe
    y UPDATE si ya existe. Re-ejecutar nunca duplica.

Validación defensiva:
    Solo ingresan equipos cuyo MLB team_id está en LIDOM_TEAMS (667–672).
    Cualquier equipo fuera de ese rango es descartado silenciosamente.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from src.clients.mlb_api import MLBAPIClient
from src.constants import DEFAULT_DB_URL, LIDOM_TEAMS
from src.models.database import get_engine
from src.models.flat_models import BattingStats, PitchingStats, Standing
from src.utils.logger import logger


def _safe_float(val) -> float | None:
    if val is None or val in ("", "-.--", ".---", "-.-", "-."):
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _safe_int(val) -> int | None:
    try:
        return int(val) if val not in (None, "", "--") else None
    except (ValueError, TypeError):
        return None


def _parse_innings(ip_str: str | None) -> float | None:
    """
    Convierte IP en formato béisbol ("33.1" = 33⅓ innings) a decimal (33.333).
    La MLB API devuelve IPs con este formato no-decimal.
    """
    if ip_str is None or ip_str == "":
        return None
    try:
        parts = str(ip_str).split(".")
        whole = int(parts[0])
        thirds = int(parts[1]) if len(parts) > 1 else 0
        return round(whole + thirds / 3.0, 2)
    except (ValueError, IndexError):
        return None


class MLBIngestor:
    def __init__(self, db_url: str = DEFAULT_DB_URL):
        self.engine = get_engine(db_url)

    def ingest(self, season: str = "2025") -> dict:
        summary: dict[str, int] = {}
        with MLBAPIClient() as client:
            summary["standings"] = self._ingest_standings(client, season)
            summary["batting"] = self._ingest_batting(client, season)
            summary["pitching"] = self._ingest_pitching(client, season)
        logger.success(f"✅ Ingestión completa para temporada {season}: {summary}")
        return summary

    # ── Standings ──────────────────────────────────────────────────────────────

    def _ingest_standings(self, client: MLBAPIClient, season: str) -> int:
        raw = client.get_standings(season=season)
        rows: list[Standing] = []

        for record in raw.get("records", []):
            for team_rec in record.get("teamRecords", []):
                team_id = team_rec.get("team", {}).get("id")
                if team_id not in LIDOM_TEAMS:
                    continue

                info = LIDOM_TEAMS[team_id]
                lr = team_rec.get("leagueRecord", {})

                rows.append(Standing(
                    season=season,
                    team_id=info["team_code"],
                    team_name=info["full_name"],
                    wins=_safe_int(team_rec.get("wins") or lr.get("wins")),
                    losses=_safe_int(team_rec.get("losses") or lr.get("losses")),
                    games_played=_safe_int(team_rec.get("gamesPlayed")),
                    win_loss_pct=_safe_float(
                        team_rec.get("winningPercentage") or lr.get("pct")
                    ),
                    games_back=str(team_rec.get("gamesBack", "-")),
                    runs_scored=_safe_int(team_rec.get("runsScored")),
                    runs_allowed=_safe_int(team_rec.get("runsAllowed")),
                    run_differential=_safe_int(team_rec.get("runDifferential")),
                    team_url=team_rec.get("team", {}).get("link", ""),
                    source="mlb_api",
                ))

        self._upsert(rows)
        logger.info(f"  standings: {len(rows)} equipos")
        return len(rows)

    # ── Batting ────────────────────────────────────────────────────────────────

    def _ingest_batting(self, client: MLBAPIClient, season: str) -> int:
        response = client.get_hitting_stats(season=season)
        rows: list[BattingStats] = []

        for split in response.all_splits():
            if split.team.id not in LIDOM_TEAMS:
                continue

            info = LIDOM_TEAMS[split.team.id]
            s = split.stat

            rows.append(BattingStats(
                season=season,
                mlb_player_id=split.player.id,
                player=split.player.fullName,
                player_url=split.player.link or "",
                team_id=info["team_code"],
                games=s.gamesPlayed,
                plate_appearances=s.plateAppearances,
                at_bats=s.atBats,
                runs=s.runs,
                hits=s.hits,
                doubles=s.doubles,
                triples=s.triples,
                home_runs=s.homeRuns,
                rbi=s.rbi,
                stolen_bases=s.stolenBases,
                caught_stealing=s.caughtStealing,
                walks=s.baseOnBalls,
                strikeouts=s.strikeOuts,
                batting_avg=s.avg,
                on_base_pct=s.obp,
                slugging_pct=s.slg,
                ops=s.ops,
                source="mlb_api",
            ))

        self._upsert(rows)
        logger.info(f"  batting: {len(rows)} jugadores")
        return len(rows)

    # ── Pitching ───────────────────────────────────────────────────────────────

    def _ingest_pitching(self, client: MLBAPIClient, season: str) -> int:
        raw = client.get_pitching_stats(season=season)
        rows: list[PitchingStats] = []

        for block in raw.get("stats", []):
            for split in block.get("splits", []):
                team_id = split.get("team", {}).get("id")
                if team_id not in LIDOM_TEAMS:
                    continue

                info = LIDOM_TEAMS[team_id]
                player = split.get("player", {})
                s = split.get("stat", {})

                rows.append(PitchingStats(
                    season=season,
                    mlb_player_id=player.get("id"),
                    player=player.get("fullName", ""),
                    player_url=player.get("link", ""),
                    team_id=info["team_code"],
                    wins=_safe_int(s.get("wins")),
                    losses=_safe_int(s.get("losses")),
                    era=_safe_float(s.get("era")),
                    games=_safe_int(s.get("gamesPlayed")),
                    games_started=_safe_int(s.get("gamesStarted")),
                    saves=_safe_int(s.get("saves")),
                    innings_pitched=_parse_innings(s.get("inningsPitched")),
                    hits=_safe_int(s.get("hits")),
                    runs=_safe_int(s.get("runs")),
                    earned_runs=_safe_int(s.get("earnedRuns")),
                    home_runs=_safe_int(s.get("homeRuns")),
                    walks=_safe_int(s.get("baseOnBalls")),
                    strikeouts=_safe_int(s.get("strikeOuts")),
                    whip=_safe_float(s.get("whip")),
                    strikeouts_per_nine=_safe_float(s.get("strikeoutsPer9Inn")),
                    walks_per_nine=_safe_float(s.get("walksPer9Inn")),
                    hits_per_nine=_safe_float(s.get("hitsPer9Inn")),
                    source="mlb_api",
                ))

        self._upsert(rows)
        logger.info(f"  pitching: {len(rows)} lanzadores")
        return len(rows)

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _upsert(self, rows: list) -> None:
        with Session(self.engine) as session:
            for row in rows:
                session.merge(row)
            session.commit()


__all__ = ["MLBIngestor"]
