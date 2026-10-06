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

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from src.fichas import anotar_fichas
from src.live.poller import LivePoller
from src.live.store import store, titular_recorrido
from src.utils.logger import logger

router = APIRouter(prefix="/live", tags=["En vivo"])

# Cada cuánto mira el generador SSE si cambió el estado.
SSE_CHECK_SECONDS = 1.0

# Latido para que proxies y balanceadores no corten una conexión inactiva.
SSE_HEARTBEAT_SECONDS = 20.0

_poller: Optional[LivePoller] = None


def get_poller() -> Optional[LivePoller]:
    return _poller


def start_poller(game_date: Optional[str] = None, liga: str = "lidom") -> LivePoller:
    """Arranca el poller. Idempotente: si ya corre, devuelve el que hay.

    Con `liga="mlb"` sigue los juegos de Grandes Ligas, solo para probar; el
    poller ignora `on_final` en ese modo y nada se ingesta.
    """
    global _poller
    if _poller is None:
        _poller = LivePoller(store=store, on_final=_ingest_finished_game,
                             game_date=game_date, liga=liga)
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

    Solo ESE juego (`ingest_game`): antes se corría la ingesta de la temporada
    entera, que además pedía solo temporada regular y dejaba sin ingestar los
    juegos del round robin y la final. La temporada va del estado en vivo si
    la trae; si no, la saca el propio calendario del juego.

    El import va aquí dentro y no arriba porque el ingestor abre la base, y no
    queremos esa dependencia solo por importar las rutas.
    """
    try:
        from src.pipeline.boxscore_ingestor import BoxscoreIngestor
        summary = BoxscoreIngestor().ingest_game(game_pk, season=state.season or None)
        logger.info(f"  boxscore de {game_pk} ingestado tras el final: {summary}")
    except Exception as exc:
        logger.error(f"  no pude ingestar el boxscore de {game_pk}: {exc}")
        return

    # Las tablas planas (Posiciones, Bateo, Pitcheo) no se llenan solas: sin
    # esto, en plena temporada seguirían con los números del día en que alguien
    # corrió `python main.py ingest` a mano. Son tres peticiones (/standings y
    # los dos /stats) por juego terminado. Un fallo aquí no deshace lo de
    # arriba: el juego ya quedó en la base.
    temporada = summary.get("season") or state.season
    if not summary.get("ingested") or not temporada:
        return
    try:
        from src.pipeline.mlb_ingestor import MLBIngestor
        planas = MLBIngestor().ingest(season=temporada)
        logger.info(f"  tablas planas de {temporada} al día tras {game_pk}: {planas}")
    except Exception as exc:
        logger.error(f"  no pude refrescar las tablas planas tras {game_pk}: {exc}")


# ─────────────────────────────────────────────────────────────────────────────


@router.get("/status")
def live_status(request: Request):
    """Qué está siguiendo el poller y cuánto ha ahorrado con los parches.

    Es diagnóstico interno: en producción, sin la clave, solo dice si el
    poller corre (ver api/seguridad.py).
    """
    from api.seguridad import config as config_seguridad, diagnostico_autorizado
    if not diagnostico_autorizado(config_seguridad(), request.headers):
        return {"poller_running": _poller is not None}
    stats = store.stats()
    total = stats["full_fetches"] + stats["patch_applications"]
    stats["patch_ratio"] = (
        round(stats["patch_applications"] / total, 3) if total else None
    )
    return {
        "poller_running": _poller is not None,
        "game_date": _poller.game_date if _poller else None,
        "league": getattr(_poller, "liga", None),
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


def _situacion(state) -> Optional[dict]:
    """Lo que está pasando ahora mismo: bases, outs, cuenta, quién batea y
    quién lanza. Sale del estado de la tarjeta, que ya lo tiene; el detalle
    no lo trae. Solo con el juego en curso: en la previa y al final no hay
    situación que mostrar."""
    if state is None or not state.is_live:
        return None
    return {
        "outs": state.outs,
        "balls": state.balls,
        "strikes": state.strikes,
        "runners": state.runners.model_dump(),
        "batter": state.batter,
        "on_deck": state.on_deck,
        "pitcher": state.pitcher,
        "is_top_inning": state.is_top_inning,
    }


@router.get("/games/{game_pk}/detail")
def live_game_detail(
    game_pk: int,
    plays: int = Query(
        25, ge=0, le=500,
        description="Jugadas más recientes a devolver; 0 las omite todas",
    ),
):
    """
    Todo lo que la pantalla de un juego necesita, en una respuesta.

    Se proyecta del GUMBO que la caché YA tiene, así que abrir un juego no
    dispara ni una petición contra la MLB API por muchas veces que se pida.

    El relato viene del más reciente al más viejo y recortado, porque un juego
    completo son 71 jugadas y 42 KB, contra 19 KB con las 25 últimas — que es
    lo que cabe en pantalla. `plays_total` siempre dice cuántas hay.
    """
    entry = store.get(game_pk)
    if not entry:
        raise HTTPException(404, f"El juego {game_pk} no está en seguimiento")

    detail = store.get_detail(game_pk, plays_limit=plays)
    if detail is None:
        # En seguimiento pero sin documento: el primer sondeo todavía no ha
        # vuelto. Es un estado transitorio, no un juego inexistente.
        raise HTTPException(
            503, f"Todavía no hay datos del juego {game_pk}; reintenta en unos segundos"
        )

    return {
        "age_seconds": round(entry.age_seconds, 1),
        # `false` avisa al cliente de que esto ya no va a cambiar y puede dejar
        # de refrescar.
        "is_updating": entry.raw is not None,
        "situation": _situacion(entry.state),
        # Cada jugador sale con `profile_id`, el slug de su ficha, para que los
        # nombres del boxscore y las alineaciones lleven a ella. None si no
        # tiene: un debutante en su primer juego todavía no está en la base.
        "data": anotar_fichas(detail.model_dump(mode="json")),
    }


@router.get("/games/{game_pk}/winprob")
def live_win_prob(game_pk: int):
    """El recorrido de la probabilidad de ganar a lo largo del juego.

    Va aparte de /detail y no dentro, porque tienen ritmos distintos: el
    detalle se pide al abrir la pantalla y pesa 19 KB, mientras que esto son
    unos pocos cientos de bytes que el cliente quiere refrescar con cada
    sondeo para mover la gráfica. Meterlos juntos obligaría a rebajar 19 KB
    cada diez segundos para actualizar una curva.

    El recorrido NO se puede reconstruir después: la probabilidad es función de
    un estado que ya pasó y que desaparece del feed cuando el juego avanza. Por
    eso el store lo acumula mientras ocurre — ver WinProbPoint.
    """
    entry = store.get(game_pk)
    if not entry:
        raise HTTPException(404, f"El juego {game_pk} no está en seguimiento")

    track = store.win_prob_track(game_pk)
    estado = entry.state
    return {
        "age_seconds": round(entry.age_seconds, 1),
        "is_updating": entry.raw is not None,
        "home_team": estado.home.team_code if estado else None,
        "away_team": estado.away.team_code if estado else None,
        # La probabilidad de AHORA, para la barra; el recorrido, para la curva.
        "current": estado.win_prob_home if estado else None,
        # Solo en juegos terminados: en vivo, los porcentajes ya lo dicen todo.
        "headline": (
            titular_recorrido(track, estado.home.team_code, estado.away.team_code)
            if estado and estado.status == "final" else None
        ),
        "points": track,
        "points_count": len(track),
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
    """
    Arranca el poller solo si LIDOM_LIVE_POLLER está activado.

    Nunca deja caer la aplicación. Antes, si la MLB API no respondía al
    arrancar —sin red, un proxy de por medio, la API caída— la excepción subía
    por el lifespan y uvicorn salía con "Application startup failed": el motor
    en vivo se llevaba consigo /standings, /batting y todo lo demás, que no
    necesitan red para nada.

    Ahora se registra el fallo y la API queda en pie sin motor en vivo.
    /live/status lo dirá, y las pantallas en vivo mostrarán su estado vacío,
    que es exactamente lo que está pasando.
    """
    if os.environ.get("LIDOM_LIVE_POLLER", "").lower() not in ("1", "true", "yes"):
        return

    replay = os.environ.get("LIDOM_LIVE_REPLAY")
    try:
        if replay:
            start_replay(
                int(replay),
                step=int(os.environ.get("LIDOM_REPLAY_STEP", 4)),
                interval=int(os.environ.get("LIDOM_REPLAY_INTERVAL", 2)),
            )
            logger.info(f"Modo repetición del juego {replay}")
        elif os.environ.get("LIDOM_LIVE_MLB", "").lower() in ("1", "true", "yes"):
            from api.seguridad import leer_config
            try:
                produccion = leer_config().produccion
            except Exception:
                produccion = True   # una configuración inválida no es un entorno de pruebas
            if produccion:
                # Una prueba olvidada en el servidor llenaría la portada de
                # juegos de Grandes Ligas. En producción, se queda apagado.
                logger.error("LIDOM_LIVE_MLB no se admite en producción: motor en vivo apagado")
                return
            start_poller(game_date=os.environ.get("LIDOM_LIVE_DATE") or None, liga="mlb")
            logger.warning("Poller en vivo en MODO PRUEBA con la MLB (LIDOM_LIVE_MLB): "
                           "sigue juegos de Grandes Ligas y no ingesta nada")
        else:
            start_poller(game_date=os.environ.get("LIDOM_LIVE_DATE") or None)
            logger.info("Poller en vivo activado por LIDOM_LIVE_POLLER")
    except Exception as e:
        logger.error(
            f"No se pudo arrancar el motor en vivo ({type(e).__name__}: {e}). "
            "La API sigue en pie; los endpoints históricos no se ven afectados."
        )


__all__ = ["router", "start_poller", "stop_poller", "get_poller", "maybe_start_poller"]
