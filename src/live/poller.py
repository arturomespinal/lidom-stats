"""
src/live/poller.py — Motor de sondeo del feed en vivo.

Cómo funciona un ciclo:

    1. /schedule dice qué juegos hay hoy. Solo se siguen los que no terminaron.
    2. La primera vez de cada juego se baja el feed COMPLETO (~1 MB) y se
       guarda crudo en la caché.
    3. A partir de ahí solo se piden PARCHES desde la última marca de tiempo,
       que se aplican sobre el crudo guardado. Medido sobre doce sondeos
       reales: 7,9 MB por feed completo contra 0,75 MB por parches, 10,5 veces
       menos. Y el estado que sale de los parches es idéntico al del feed
       completo — verificado contra instantáneas reales.
    4. Cuando un juego pasa a final se dispara on_final (para ingestar su
       boxscore) y se suelta el documento crudo, que ya no sirve para nada.

El intervalo lo dicta la API: metaData.wait, que en LIDOM viene en 10 segundos.
Preferimos ese valor a uno fijo nuestro.

Corre en su propio hilo para no bloquear a FastAPI. La caché es el único punto
de contacto entre ambos.
"""

from __future__ import annotations

import threading
import time
from datetime import date as date_cls
from typing import Callable, Optional

import jsonpatch

from src.clients.mlb_api import MLBAPIClient
from src.constants import LIDOM_TEAMS
from src.live.gumbo import parse_live_feed
from src.live.store import LiveStore, store as default_store
from src.utils.logger import logger

# Cada cuánto se vuelve a preguntar al calendario qué juegos hay.
SCHEDULE_REFRESH_SECONDS = 600

# Si la API no recomienda intervalo, este es el nuestro.
DEFAULT_POLL_SECONDS = 10

# Cuando no hay ningún juego activo, el ciclo duerme esto en vez de martillar
# el calendario.
IDLE_SLEEP_SECONDS = 60


class LivePoller:
    """
    Sigue los juegos de una fecha y mantiene la caché al día.

    Uso:
        poller = LivePoller(on_final=lambda pk, st: ingest(pk))
        poller.start()          # hilo de fondo
        ...
        poller.stop()

    Para desarrollo y pruebas se le puede pasar otro cliente y otra caché.
    """

    def __init__(
        self,
        store: Optional[LiveStore] = None,
        client: Optional[MLBAPIClient] = None,
        on_final: Optional[Callable[[int, object], None]] = None,
        game_date: Optional[str] = None,
    ):
        self.store = store or default_store
        self._client = client
        self._owns_client = client is None
        self.on_final = on_final
        # None = el día de hoy, recalculado en cada refresco del calendario.
        self.game_date = game_date

        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._tracking: dict[int, Optional[str]] = {}   # game_pk → game_id
        self._finalized: set[int] = set()
        self._schedule_checked_at = 0.0

    # ── Ciclo de vida ─────────────────────────────────────────────────────────

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            logger.warning("El poller ya está corriendo")
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="live-poller", daemon=True)
        self._thread.start()
        logger.info("▶️  Poller en vivo iniciado")

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=timeout)
        if self._owns_client and self._client:
            self._client.close()
            self._client = None
        logger.info("⏹️  Poller en vivo detenido")

    @property
    def client(self) -> MLBAPIClient:
        if self._client is None:
            self._client = MLBAPIClient()
        return self._client

    # ── El ciclo ──────────────────────────────────────────────────────────────

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                wait = self.tick()
            except Exception as exc:
                # Un fallo de red no puede matar el hilo: el marcador quedaría
                # congelado sin que nadie se entere.
                logger.error(f"Poller: ciclo falló ({exc}); reintenta en 30s")
                wait = 30
            self._stop.wait(wait)

    def tick(self) -> float:
        """
        Un ciclo completo. Devuelve cuántos segundos esperar hasta el siguiente.

        Público a propósito: así se puede ejercitar paso a paso desde una prueba
        sin arrancar el hilo.
        """
        self._refresh_schedule_if_due()

        active = [pk for pk in self._tracking if pk not in self._finalized]
        if not active:
            return IDLE_SLEEP_SECONDS

        waits = []
        for game_pk in active:
            if self._stop.is_set():
                break
            try:
                waits.append(self._poll_game(game_pk))
            except Exception as exc:
                logger.error(f"Poller: juego {game_pk} falló ({exc})")
                waits.append(DEFAULT_POLL_SECONDS)

        return min(waits) if waits else IDLE_SLEEP_SECONDS

    # ── Calendario ────────────────────────────────────────────────────────────

    def _refresh_schedule_if_due(self) -> None:
        if time.time() - self._schedule_checked_at < SCHEDULE_REFRESH_SECONDS:
            return
        self._schedule_checked_at = time.time()
        self.discover()

    def discover(self) -> list[int]:
        """
        Pregunta al calendario qué juegos hay y empieza a seguir los que faltan.

        Filtra por LIDOM igual que el ingestor: solo juegos donde ambos equipos
        están en LIDOM_TEAMS.
        """
        target = self.game_date or date_cls.today().isoformat()
        season = str(int(target[:4]) if int(target[5:7]) >= 9 else int(target[:4]) - 1)

        raw = self.client.get_schedule(season=season, game_type=None)
        found: list[int] = []

        for date_entry in raw.get("dates", []):
            if date_entry.get("date") != target:
                continue
            for g in date_entry.get("games", []):
                teams = g.get("teams", {})
                home = teams.get("home", {}).get("team", {}).get("id")
                away = teams.get("away", {}).get("team", {}).get("id")
                if home not in LIDOM_TEAMS or away not in LIDOM_TEAMS:
                    continue

                game_pk = g.get("gamePk")
                found.append(game_pk)
                if game_pk not in self._tracking:
                    self._tracking[game_pk] = self._game_id_for(g)
                    logger.info(
                        f"  siguiendo {LIDOM_TEAMS[away]['team_code']} @ "
                        f"{LIDOM_TEAMS[home]['team_code']} (gamePk {game_pk})"
                    )

        if not found:
            logger.debug(f"Poller: no hay juegos LIDOM el {target}")
        return found

    @staticmethod
    def _game_id_for(g: dict) -> Optional[str]:
        """El mismo slug que usa el esquema, para cruzar con la tabla games."""
        try:
            from src.pipeline.boxscore_ingestor import build_game_id
            teams = g.get("teams", {})
            home = LIDOM_TEAMS[teams["home"]["team"]["id"]]["team_code"]
            away = LIDOM_TEAMS[teams["away"]["team"]["id"]]["team_code"]
            official = g.get("officialDate") or g.get("gameDate", "")[:10]
            return build_game_id(official, away, home, g.get("gameNumber") or 1)
        except Exception:
            return None

    # ── Sondeo de un juego ────────────────────────────────────────────────────

    def _poll_game(self, game_pk: int) -> float:
        entry = self.store.entry(game_pk, self._tracking.get(game_pk))
        entry.poll_count += 1

        if entry.raw is None or entry.timecode is None:
            raw = self._fetch_full(entry)
        else:
            raw = self._fetch_patched(entry)

        state = parse_live_feed(raw, game_id=entry.game_id)
        self.store.update(game_pk, raw, state)

        if state.is_final and game_pk not in self._finalized:
            self._finalized.add(game_pk)
            # El crudo ya no hace falta: sin más parches por aplicar, es un
            # megabyte de memoria sin uso.
            self.store.drop(game_pk)
            logger.info(f"🏁 Juego {game_pk} final: {state.score_line}")
            if self.on_final:
                try:
                    self.on_final(game_pk, state)
                except Exception as exc:
                    logger.error(f"Poller: on_final de {game_pk} falló ({exc})")

        return float(state.poll_wait_seconds or DEFAULT_POLL_SECONDS)

    def _fetch_full(self, entry) -> dict:
        entry.full_fetches += 1
        return self.client.get_live_feed(entry.game_pk)

    def _fetch_patched(self, entry) -> dict:
        """
        Pide solo los cambios desde la última marca y los aplica sobre el crudo.

        La respuesta esperada es [{"diff": [...operaciones RFC 6902...]}], pero
        la API devuelve el feed completo cuando no puede calcular el diff —por
        ejemplo si la marca quedó demasiado atrás—, así que hay que distinguir
        las dos formas. Si algo no encaja, se cae a bajar el feed entero: es
        más caro pero nunca deja el estado corrupto.
        """
        try:
            payload = self.client.get_live_diff(entry.game_pk, entry.timecode)
        except Exception as exc:
            logger.warning(f"  diff de {entry.game_pk} falló ({exc}); bajo el feed completo")
            return self._fetch_full(entry)

        # Forma de feed completo: un objeto con gameData.
        if isinstance(payload, dict):
            if "gameData" in payload:
                entry.full_fetches += 1
                return payload
            logger.warning(f"  diff de {entry.game_pk} con forma inesperada; feed completo")
            return self._fetch_full(entry)

        if not isinstance(payload, list):
            return self._fetch_full(entry)

        if not payload:
            # Sin cambios desde la última marca: el estado sigue siendo válido.
            return entry.raw

        doc = entry.raw
        try:
            for element in payload:
                if not isinstance(element, dict) or "diff" not in element:
                    raise ValueError(f"elemento sin 'diff': {list(element)[:3]}")
                doc = jsonpatch.apply_patch(doc, element["diff"])
        except Exception as exc:
            logger.warning(
                f"  no pude aplicar los parches de {entry.game_pk} ({exc}); "
                f"bajo el feed completo"
            )
            return self._fetch_full(entry)

        entry.patch_applications += 1
        return doc


__all__ = ["LivePoller", "SCHEDULE_REFRESH_SECONDS", "DEFAULT_POLL_SECONDS"]
