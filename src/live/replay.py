"""
src/live/replay.py — Reproduce un juego terminado como si estuviera ocurriendo.

LIDOM juega de octubre a enero. El resto del año no hay un solo juego en vivo
contra el cual desarrollar el marcador, y esperar a octubre para descubrir que
la pantalla tiene un bug sería absurdo.

La API conserva una instantánea del estado por cada actualización de la
transmisión, así que un juego terminado se puede volver a caminar de principio
a fin. ReplayClient hace exactamente eso, imitando la interfaz de MLBAPIClient:
el poller no distingue una cosa de la otra y no necesita ningún modo especial.
Lo mismo vale para el frontend, que recibe por SSE eventos idénticos a los que
recibirá en temporada.

Dos ajustes para que un juego de tres horas sea demostrable:

  - `step`: cuántas marcas reales avanza por sondeo. Con 360 marcas y step=4,
    un juego entero son unos 90 sondeos.
  - `interval`: se inyecta en metaData.wait, que es de donde el poller saca su
    ritmo. Con 2 segundos, el juego completo corre en unos tres minutos.

El segundo ajuste se aplica también a los parches, añadiendo una operación
extra: si no, el primer parche restauraría el wait real de 10 segundos y la
repetición se arrastraría.

USO desde la API:
    set LIDOM_LIVE_POLLER=1
    set LIDOM_LIVE_REPLAY=826343
    python -m uvicorn api.main:app --reload
"""

from __future__ import annotations

from datetime import date as date_cls
from typing import Any, Optional

from src.clients.mlb_api import MLBAPIClient
from src.constants import LIDOM_TEAMS
from src.utils.logger import logger

DEFAULT_STEP = 4
DEFAULT_INTERVAL = 2


class ReplayClient:
    """
    Imita a MLBAPIClient sirviendo un juego terminado, marca por marca.

    Solo implementa los tres métodos que el poller usa. Cualquier otro atributo
    se delega al cliente real, por si el poller crece.
    """

    def __init__(
        self,
        game_pk: int,
        client: Optional[MLBAPIClient] = None,
        step: int = DEFAULT_STEP,
        interval: int = DEFAULT_INTERVAL,
        game_date: Optional[str] = None,
    ):
        self._client = client or MLBAPIClient()
        self._owns_client = client is None
        self.game_pk = game_pk
        self.step = max(1, step)
        self.interval = max(1, interval)
        # La fecha con que se presenta el juego al calendario. Por defecto hoy,
        # para que discover() lo encuentre sin más configuración.
        self.game_date = game_date or date_cls.today().isoformat()

        self.stamps: list[str] = self._client.get_live_timestamps(game_pk)
        if not self.stamps:
            raise ValueError(f"El juego {game_pk} no tiene marcas de tiempo")
        self.pos = 0

        # Una lectura al arrancar para saber quiénes juegan; el calendario
        # sintético la necesita y de paso valida que el gamePk exista.
        head = self._client.get_live_feed(game_pk, timecode=self.stamps[0])
        teams = head.get("gameData", {}).get("teams", {})
        # OJO: en /schedule los equipos vienen anidados (teams.home.team.id)
        # pero en el feed en vivo están directos (gameData.teams.home.id).
        # Copiar la anidación del calendario aquí deja home_id en None, el
        # juego no pasa el filtro de LIDOM y discover() no encuentra nada.
        self.home_id = teams.get("home", {}).get("id")
        self.away_id = teams.get("away", {}).get("id")
        if self.home_id not in LIDOM_TEAMS or self.away_id not in LIDOM_TEAMS:
            raise ValueError(
                f"El juego {game_pk} no es de LIDOM "
                f"(equipos {self.away_id} @ {self.home_id})"
            )
        self.game_number = head.get("gameData", {}).get("game", {}).get("gameNumber") or 1

        dur = len(self.stamps) / self.step * self.interval
        logger.info(
            f"🎬 Repetición del juego {game_pk}: {len(self.stamps)} marcas, "
            f"step={self.step}, cada {self.interval}s → ~{dur / 60:.1f} min"
        )

    # ── Interfaz que consume el poller ────────────────────────────────────────

    def get_schedule(self, season: str, game_type: Optional[str] = None) -> dict:
        """Calendario sintético: este juego, hoy, para que discover() lo tome."""
        return {"dates": [{
            "date": self.game_date,
            "games": [{
                "gamePk": self.game_pk,
                "officialDate": self.game_date,
                "gameNumber": self.game_number,
                "teams": {
                    "home": {"team": {"id": self.home_id}},
                    "away": {"team": {"id": self.away_id}},
                },
            }],
        }]}

    def get_live_feed(self, game_pk: int, timecode: Optional[str] = None) -> dict:
        """El feed completo en la posición actual de la repetición."""
        doc = self._client.get_live_feed(game_pk, timecode=self.stamps[self.pos])
        doc.setdefault("metaData", {})["wait"] = self.interval
        return doc

    def get_live_diff(
        self, game_pk: int, start_timecode: str, end_timecode: Optional[str] = None
    ) -> Any:
        """
        Avanza la repetición y devuelve los parches reales entre ambas marcas.

        Se piden los parches de verdad a la API, no unos inventados: así la
        repetición ejercita el mismo camino que correrá en temporada, incluidos
        los casos en que la API decide devolver el feed completo.
        """
        if self.finished:
            # Al llegar al final ya no hay nada que avanzar. Devolver una lista
            # vacía deja el estado como está, y como la última marca es la del
            # juego terminado, el poller ya lo habrá marcado como final.
            return []

        previous = self.stamps[self.pos]
        self.pos = min(self.pos + self.step, len(self.stamps) - 1)
        payload = self._client.get_live_diff(
            game_pk, start_timecode=previous, end_timecode=self.stamps[self.pos]
        )

        # Sin esto, el primer parche devolvería metaData.wait a los 10 segundos
        # reales y la repetición se arrastraría.
        if isinstance(payload, list):
            for element in payload:
                if isinstance(element, dict) and isinstance(element.get("diff"), list):
                    element["diff"].append({
                        "op": "replace",
                        "path": "/metaData/wait",
                        "value": self.interval,
                    })
        elif isinstance(payload, dict) and "gameData" in payload:
            payload.setdefault("metaData", {})["wait"] = self.interval

        return payload

    # ── Estado de la repetición ───────────────────────────────────────────────

    @property
    def finished(self) -> bool:
        return self.pos >= len(self.stamps) - 1

    @property
    def progress(self) -> float:
        return round(self.pos / max(1, len(self.stamps) - 1), 3)

    def restart(self) -> None:
        self.pos = 0

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __getattr__(self, name: str):
        """Cualquier método no implementado se delega al cliente real."""
        return getattr(self._client, name)


def build_replay_poller(game_pk: int, store=None, step: int = DEFAULT_STEP,
                        interval: int = DEFAULT_INTERVAL, on_final=None):
    """Un LivePoller ya cableado a una repetición, listo para .start()."""
    from src.live.poller import LivePoller
    from src.live.store import store as default_store

    client = ReplayClient(game_pk, step=step, interval=interval)
    return LivePoller(
        store=store or default_store,
        client=client,
        on_final=on_final,
        game_date=client.game_date,
    )


__all__ = ["ReplayClient", "build_replay_poller", "DEFAULT_STEP", "DEFAULT_INTERVAL"]
