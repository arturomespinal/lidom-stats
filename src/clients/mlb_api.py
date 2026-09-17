"""
src/clients/mlb_api.py — Cliente HTTP para la MLB Stats API.

Diseño:
    - Síncrono (httpx.Client). Async se puede agregar después sin romper interfaz.
    - Retry exponencial automático en 5xx, timeouts y errores de conexión.
    - Rate limit suave: mínimo 100ms entre requests (configurable).
    - User-Agent identificable: la MLB API es pública pero por etiqueta
      decimos quiénes somos.
    - Loguea cada request con duración y status.
    - Devuelve dict raw o modelo Pydantic según el método.

Por qué httpx y no requests:
    - httpx soporta async out-of-the-box (migración futura sin cambiar libs)
    - Mejor manejo de timeouts (connect, read, write por separado)
    - HTTP/2 nativo (la MLB API lo soporta, mejor latencia)
    - API casi idéntica a requests (curva de aprendizaje cero)
"""

from __future__ import annotations

import time
from typing import Any, Optional

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

from src.constants import (
    HTTP_MAX_RETRIES,
    HTTP_TIMEOUT_SECONDS,
    LIDOM_LEAGUE_ID,
    LIDOM_SPORT_ID,
    MIN_REQUEST_INTERVAL_SECONDS,
    MLB_API_BASE_URL,
    MLB_API_V11_BASE_URL,
    USER_AGENT,
)
from src.models.api_models import APIHittingStatsResponse
from src.utils.logger import logger


# Excepciones que SÍ ameritan reintento (transitorias)
RETRYABLE_EXCEPTIONS = (
    httpx.TimeoutException,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.RemoteProtocolError,
)


class MLBAPIError(Exception):
    """Excepción base para errores del cliente MLB API."""


class MLBAPIClient:
    """
    Cliente síncrono para la MLB Stats API.

    Uso:
        with MLBAPIClient() as client:
            stats = client.get_hitting_stats(season="2025")
            for split in stats.all_splits():
                print(split.player.fullName, split.stat.avg)

    También funciona sin context manager si manejas tú mismo close():
        client = MLBAPIClient()
        try:
            ...
        finally:
            client.close()
    """

    def __init__(
        self,
        base_url: str = MLB_API_BASE_URL,
        v11_base_url: str = MLB_API_V11_BASE_URL,
        timeout: float = HTTP_TIMEOUT_SECONDS,
        min_request_interval: float = MIN_REQUEST_INTERVAL_SECONDS,
        user_agent: str = USER_AGENT,
    ):
        self.base_url = base_url.rstrip("/")
        # El feed en vivo solo existe en la v1.1. httpx ignora base_url cuando
        # la URL que le pasas es absoluta, así que los métodos de v1.1 arman la
        # URL completa y los de v1 siguen usando rutas relativas sin enterarse.
        self.v11_base_url = v11_base_url.rstrip("/")
        self.min_request_interval = min_request_interval
        self._last_request_ts: float = 0.0

        # httpx.Client con configuración robusta
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=httpx.Timeout(timeout, connect=10.0),
            headers={
                "User-Agent": user_agent,
                "Accept": "application/json",
            },
            follow_redirects=True,
            http2=False,  # Activar cuando confirmes que tu entorno soporta http2
        )

    # ─── Context manager support ────────────────────────────────────────────

    def __enter__(self) -> MLBAPIClient:
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    # ─── Core: GET con retry y rate limiting ────────────────────────────────

    def _throttle(self) -> None:
        """
        Espera lo necesario para respetar el intervalo mínimo entre requests.
        Implementación simple: time desde el último request; si es menor al
        mínimo, dormimos la diferencia.
        """
        elapsed = time.monotonic() - self._last_request_ts
        wait = self.min_request_interval - elapsed
        if wait > 0:
            time.sleep(wait)

    @retry(
        stop=stop_after_attempt(HTTP_MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(RETRYABLE_EXCEPTIONS),
        before_sleep=before_sleep_log(logger, "WARNING"),
        reraise=True,
    )
    def _get(self, path: str, params: Optional[dict[str, Any]] = None) -> Any:
        """
        GET con retry exponencial y rate limiting.

        Devuelve lo que traiga el JSON: casi siempre un dict, pero
        /feed/live/timestamps responde con un array.

        Reintenta SOLO en errores transitorios (timeout, conexión, 5xx).
        En 4xx (bad request, not found) NO reintenta — eso es un bug del caller.
        """
        self._throttle()

        params = params or {}
        # Filtrar None values (httpx los manda como "None" textual)
        params = {k: v for k, v in params.items() if v is not None}

        start = time.monotonic()
        response = self._client.get(path, params=params)
        elapsed_ms = (time.monotonic() - start) * 1000
        self._last_request_ts = time.monotonic()

        logger.debug(
            f"MLB API {response.status_code} GET {path} "
            f"params={params} ({elapsed_ms:.0f}ms)"
        )

        # Errores 5xx: reintentar
        if 500 <= response.status_code < 600:
            response.raise_for_status()  # Levanta HTTPStatusError, tenacity NO la captura
            # Si quisieras reintentar 5xx, deberías capturar HTTPStatusError aparte.
            # Por simplicidad ahora dejamos que falle.

        # Errores 4xx: levantar con mensaje claro
        if 400 <= response.status_code < 500:
            raise MLBAPIError(
                f"MLB API devolvió {response.status_code} en GET {path}: "
                f"{response.text[:200]}"
            )

        return response.json()

    # ─── Endpoints específicos ──────────────────────────────────────────────

    def get_hitting_stats(
        self,
        season: str,
        league_id: int = LIDOM_LEAGUE_ID,
        sport_id: int = LIDOM_SPORT_ID,
        game_type: str = "R",
        limit: int = 10000,
        offset: int = 0,
        player_pool: str = "All",
    ) -> APIHittingStatsResponse:
        """
        Obtiene stats de bateo agregadas por temporada.

        Endpoint:
            GET /stats?stats=season&group=hitting&leagueId={league_id}
                &sportIds={sport_id}&season={season}&gameType={game_type}

        Args:
            season: "2025" (representa la temp. invernal 2024-25)
            game_type: "R" temporada regular, "P" playoffs, "L" final, "W" caribe
            limit: máximo de splits a devolver (10000 es de facto "sin límite")
            player_pool: "All" devuelve todos los jugadores con al menos una
                aparición. CRÍTICO: si se omite, la MLB API asume "QUALIFIED"
                y filtra a quienes alcanzan el mínimo de PA por juego de equipo
                — en una liga invernal corta eso reduce 206 bateadores a 22.

        Returns:
            APIHittingStatsResponse validado.
        """
        params = {
            "stats": "season",
            "group": "hitting",
            "leagueId": league_id,
            "sportIds": sport_id,
            "season": season,
            "gameType": game_type,
            "limit": limit,
            "offset": offset,
            "playerPool": player_pool,
        }
        raw = self._get("/stats", params=params)
        return APIHittingStatsResponse.model_validate(raw)

    def get_pitching_stats(
        self,
        season: str,
        league_id: int = LIDOM_LEAGUE_ID,
        sport_id: int = LIDOM_SPORT_ID,
        game_type: str = "R",
        limit: int = 10000,
        player_pool: str = "All",
    ) -> dict:
        """
        Stats de pitcheo agregadas. Devuelve dict raw por ahora — modelo
        Pydantic específico se añade en siguiente iteración.

        player_pool: ver nota en get_hitting_stats(). Sin este parámetro la API
        devuelve solo lanzadores calificados (IP >= 1 por juego de equipo).
        """
        params = {
            "stats": "season",
            "group": "pitching",
            "leagueId": league_id,
            "sportIds": sport_id,
            "season": season,
            "gameType": game_type,
            "limit": limit,
            "playerPool": player_pool,
        }
        return self._get("/stats", params=params)

    def get_schedule(
        self,
        season: str,
        league_id: int = LIDOM_LEAGUE_ID,
        sport_id: int = LIDOM_SPORT_ID,
        game_type: Optional[str] = None,
    ) -> dict:
        """
        Lista de juegos de una temporada.

        Devuelve un dict con structure:
            {"dates": [{"games": [...]}], "totalGames": N, ...}

        Devolvemos dict raw para inspección. El modelo Pydantic Schedule
        lo agregamos cuando consumamos este endpoint en el ingestor.
        """
        params = {
            "leagueId": league_id,
            "sportId": sport_id,
            "season": season,
            "gameType": game_type,
        }
        return self._get("/schedule", params=params)

    def get_boxscore(self, game_pk: int) -> dict:
        """
        Box score completo de un juego: lineups, batting line por bateador,
        pitching line por lanzador. ESTE es el endpoint que poblará nuestras
        tablas batting_lines y pitching_lines.
        """
        return self._get(f"/game/{game_pk}/boxscore")

    def get_play_by_play(self, game_pk: int) -> dict:
        """Play-by-play completo. Solo para futura granularidad de evento."""
        return self._get(f"/game/{game_pk}/playByPlay")

    # ─── Feed en vivo (API v1.1) ────────────────────────────────────────────

    def get_live_feed(self, game_pk: int, timecode: Optional[str] = None) -> dict:
        """
        Estado completo del juego en formato GUMBO.

        Endpoint:
            GET /api/v1.1/game/{gamePk}/feed/live[?timecode=YYYYMMDD_HHMMSS]

        Sin timecode devuelve el estado actual. CON timecode devuelve el juego
        tal como se veía en ese instante — la API conserva cada instantánea de
        la transmisión. Eso permite reproducir juegos terminados para
        desarrollar y probar el motor en vivo fuera de temporada.

        La respuesta ronda el megabyte. Para seguimiento continuo conviene
        get_live_diff(), que devuelve solo los cambios.
        """
        params = {"timecode": timecode} if timecode else None
        return self._get(f"{self.v11_base_url}/game/{game_pk}/feed/live", params)

    def get_live_timestamps(self, game_pk: int) -> list[str]:
        """
        Todas las marcas de tiempo registradas para un juego.

        Devuelve una lista de strings "YYYYMMDD_HHMMSS" en orden cronológico,
        una por cada actualización que hubo durante la transmisión. Son las
        marcas que acepta el parámetro timecode.
        """
        raw = self._get(f"{self.v11_base_url}/game/{game_pk}/feed/live/timestamps")
        # Este endpoint devuelve un array JSON, no un objeto. _get normaliza
        # a dict, así que lo recuperamos de la clave que use.
        if isinstance(raw, list):
            return raw
        return raw.get("timestamps", raw.get("data", []))

    def get_live_diff(self, game_pk: int, start_timecode: str) -> dict:
        """
        Solo los cambios desde start_timecode, en formato JSON Patch.

        Endpoint:
            GET /api/v1.1/game/{gamePk}/feed/live/diffPatch
                ?startTimecode=...&endTimecode=...

        Es lo que hace viable el polling continuo: en vez de bajar un megabyte
        cada diez segundos, se baja el estado completo una vez y después solo
        los parches. Si la API no puede calcular el diff (marca demasiado vieja)
        devuelve el feed completo, así que el llamador debe contemplar ambas
        formas de respuesta.
        """
        return self._get(
            f"{self.v11_base_url}/game/{game_pk}/feed/live/diffPatch",
            {"startTimecode": start_timecode},
        )

    def get_teams(
        self,
        season: str,
        league_id: int = LIDOM_LEAGUE_ID,
        sport_id: int = LIDOM_SPORT_ID,
    ) -> dict:
        """Lista de equipos de la liga para una temporada."""
        params = {
            "leagueIds": league_id,
            "sportId": sport_id,
            "season": season,
        }
        return self._get("/teams", params=params)

    def get_person(self, person_id: int) -> dict:
        """Perfil completo de un jugador."""
        return self._get(f"/people/{person_id}")

    def get_people(self, person_ids: list[int]) -> dict:
        """
        Perfiles de varios jugadores en UN solo request.

        Endpoint:
            GET /people?personIds=1,2,3

        Existe para no hacer ~450 llamadas a /people/{id} al ingestar una
        temporada completa de boxscores. La URL tiene un límite práctico de
        longitud, así que el llamador debe trocear en lotes (~100 IDs).

        Returns:
            dict raw: {"people": [ {...}, ... ]}
        """
        if not person_ids:
            return {"people": []}

        params = {"personIds": ",".join(str(pid) for pid in person_ids)}
        return self._get("/people", params=params)

    def get_standings(
        self,
        season: str,
        league_id: int = LIDOM_LEAGUE_ID,
    ) -> dict:
        """Tabla de posiciones oficial."""
        params = {
            "leagueId": league_id,
            "season": season,
        }
        return self._get("/standings", params=params)


__all__ = ["MLBAPIClient", "MLBAPIError"]
