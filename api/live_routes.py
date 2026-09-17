"""
api/live_routes.py — Estado en vivo por HTTP y por SSE.

El poller corre en un hilo aparte y deja el estado en la caché volátil; estos
manejadores solo leen de ahí. Ningún endpoint de aquí toca la red ni la base:
en el peor caso devuelven lo último que se supo, con su antigüedad.

Sobre el SSE: el generador consulta la caché una vez por segundo y emite solo
cuando cambia la marca de tiempo del estado. Se podría notificar desde el hilo
del poller con colas, pero eso obliga a cruzar hilos y asyncio, que es donde
viven los bloqueos raros. Leer un diccionario en memoria una vez por segundo no
cuesta nada y el marcador se actualiza cada diez, así que la latencia añadida
es irrelevante frente a la complejidad que evita.

El poller NO arranca solo. Se enciende con:

    set LIDOM_LIVE_POLLER=1     (Windows)
    export LIDOM_LIVE_POLLER=1  (Linux/macOS)

Así levantar la API para trabajar en los endpoints históricos no dispara
tráfico contra la MLB API sin que uno lo pida.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import AsyncIterator, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from src.live.poller import LivePoller
from src.live.store import store
from src.utils.logger import logger

router = APIRouter(prefix="/live", tags=["En vivo"])

# Cada cuánto mira el generador SSE si cambió el estado.
SSE_CHECK_SECONDS = 1.0

# Latido para que proxies y balanceadores no corten una conexión inactiva.
SSE_HEARTBEAT_SECONDS = 20.0

_poller: Optional[LivePoller] = None


def get_poller() -> Optional[LivePoller]:
    return _poller


def start_poller(game_date: Optional[str] = None) -> LivePoller:
    """Arranca el poller. Idempotente: si ya corre, devuelve el que hay."""
    global _poller
    if _poller is None:
        _poller = LivePoller(store=store, on_final=_ingest_finished_game,
                             game_date=game_date)
        _poller.start()
    return _poller


def stop_poller() -> None:
    global _poller
    if _poller:
        _poller.stop()
        _poller = None


def _ingest_finished_game(game_pk: int, state) -> None:
    """
    Al terminar un juego, su boxscore ya es definitivo: se ingesta a la base
    canónica y deja de ser estado volátil.

    El import va aquí dentro y no arriba porque el ingestor abre la base, y no
    queremos esa dependencia solo por importar las rutas.
    """
    try:
        from src.pipeline.boxscore_ingestor import BoxscoreIngestor
        season = state.season or ""
        if not season:
            return
        summary = BoxscoreIngestor().ingest(season=season, max_games=None)
        logger.info(f"  boxscore de {game_pk} ingestado tras el final: {summary}")
    except Exception as exc:
        logger.error(f"  no pude ingestar el boxscore de {game_pk}: {exc}")


# ─────────────────────────────────────────────────────────────────────────────


@router.get("/status")
def live_status():
    """Qué está siguiendo el poller y cuánto ha ahorrado con los parches."""
    stats = store.stats()
    total = stats["full_fetches"] + stats["patch_applications"]
    stats["patch_ratio"] = (
        round(stats["patch_applications"] / total, 3) if total else None
    )
    return {
        "poller_running": _poller is not None,
        "game_date": _poller.game_date if _poller else None,
        "tracked_game_pks": store.tracked(),
        **stats,
    }


@router.get("/games")
def live_games(only_live: bool = Query(False, description="Solo los que están en curso")):
    """Marcador de todos los juegos que el poller tiene en seguimiento."""
    states = store.states(only_live=only_live)
    return {
        "count": len(states),
        "data": [s.model_dump(mode="json") for s in states],
    }


@router.get("/games/{game_pk}")
def live_game(game_pk: int):
    entry = store.get(game_pk)
    if not entry or not entry.state:
        raise HTTPException(404, f"El juego {game_pk} no está en seguimiento")
    return {
        "age_seconds": round(entry.age_seconds, 1),
        "polls": entry.poll_count,
        "full_fetches": entry.full_fetches,
        "patch_applications": entry.patch_applications,
        "data": entry.state.model_dump(mode="json"),
    }


@router.get("/games/{game_pk}/stream")
async def live_stream(game_pk: int):
    """
    Flujo SSE con el marcador de un juego.

    Emite un evento al conectar con el estado actual, después uno por cada
    cambio, y un comentario de latido cada 20 segundos para que la conexión no
    se caiga por inactividad. Cierra solo cuando el juego llega a final.

    Desde el navegador:
        const es = new EventSource('/live/games/826343/stream');
        es.onmessage = e => pintar(JSON.parse(e.data));
    """
    if not store.get(game_pk):
        raise HTTPException(404, f"El juego {game_pk} no está en seguimiento")

    async def events() -> AsyncIterator[str]:
        last_timecode: Optional[str] = None
        since_heartbeat = 0.0

        while True:
            state = store.get_state(game_pk)

            if state and state.timestamp != last_timecode:
                last_timecode = state.timestamp
                since_heartbeat = 0.0
                payload = json.dumps(state.model_dump(mode="json"), ensure_ascii=False)
                yield f"event: state\ndata: {payload}\n\n"

                if state.is_final:
                    yield "event: final\ndata: {}\n\n"
                    return

            await asyncio.sleep(SSE_CHECK_SECONDS)
            since_heartbeat += SSE_CHECK_SECONDS

            if since_heartbeat >= SSE_HEARTBEAT_SECONDS:
                since_heartbeat = 0.0
                yield ": latido\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Sin esto, nginx acumula el flujo y el SSE deja de ser en vivo.
            "X-Accel-Buffering": "no",
        },
    )


def start_replay(game_pk: int, step: int, interval: int) -> LivePoller:
    """
    Arranca el poller contra un juego terminado, reproducido como si ocurriera.

    Fuera de temporada es la única forma de ver la pantalla en movimiento. El
    frontend no se entera: recibe por SSE exactamente los mismos eventos.
    """
    global _poller
    if _poller is None:
        from src.live.replay import build_replay_poller
        _poller = build_replay_poller(game_pk, store=store, step=step,
                                      interval=interval, on_final=None)
        _poller.start()
    return _poller


def maybe_start_poller() -> None:
    """Arranca el poller solo si LIDOM_LIVE_POLLER está activado."""
    if os.environ.get("LIDOM_LIVE_POLLER", "").lower() not in ("1", "true", "yes"):
        return

    replay = os.environ.get("LIDOM_LIVE_REPLAY")
    if replay:
        start_replay(
            int(replay),
            step=int(os.environ.get("LIDOM_REPLAY_STEP", 4)),
            interval=int(os.environ.get("LIDOM_REPLAY_INTERVAL", 2)),
        )
        logger.info(f"Modo repetición del juego {replay}")
    else:
        start_poller(game_date=os.environ.get("LIDOM_LIVE_DATE") or None)
        logger.info("Poller en vivo activado por LIDOM_LIVE_POLLER")


__all__ = ["router", "start_poller", "stop_poller", "get_poller", "maybe_start_poller"]
