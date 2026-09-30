"""
src/clients/digimetrics.py — Cliente HTTP para estadisticas.lidom.com (DIGIMETRICS).

El portal es un ASP.NET MVC con jQuery: cada tabla la pide la página con un
POST sin cuerpo a una acción que devuelve un fragmento de HTML (o JSON, para
las listas de etapas). No hay que ejecutar JavaScript para obtener los datos,
así que NO hace falta Selenium ni Playwright: basta con hacer los mismos POST
que hace el navegador. Tampoco Scrapy: son unos pocos miles de pedidos
secuenciales a un solo servidor lento, y lo que importa es la cortesía y la
caché, no la concurrencia.

Tres reglas de cortesía, porque el servidor es uno solo y es de la liga:
    - Un pedido por segundo como mínimo entre pedidos reales (los que salen
      de la caché no esperan).
    - Caché en disco de cada respuesta buena: reprocesar, corregir el parser o
      volver a correr la ingesta NO vuelve a golpear el servidor. Las páginas
      históricas no cambian.
    - Tope de tamaño: desde 2020-21 las tablas traen fotos en base64 y una
      página pesa de 5 a 45 MB. Se corta la descarga al pasar el tope, en vez
      de bajarla entera para tirarla.

Reintentos: 5xx, timeouts y cortes de conexión, con espera exponencial. Un 4xx
no se reintenta. Lo que salió mal NUNCA se guarda en la caché.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import time
from pathlib import Path
from typing import Any, Optional

import httpx
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.constants import (
    DIGIMETRICS_BASE_URL,
    DIGIMETRICS_CACHE_DIR,
    DIGIMETRICS_INTERVALO_SEGUNDOS,
    DIGIMETRICS_MAX_BYTES,
    HTTP_MAX_RETRIES,
    HTTP_TIMEOUT_SECONDS,
    USER_AGENT,
)
from src.utils.logger import logger


class DigimetricsError(Exception):
    """Error del cliente DIGIMETRICS que no se arregla reintentando."""


class PaginaDemasiadoPesada(DigimetricsError):
    """La respuesta pasó de DIGIMETRICS_MAX_BYTES (las fotos en base64)."""


class SinCache(DigimetricsError):
    """Modo sin red y la página no está en la caché."""


class _Transitorio(Exception):
    """5xx del servidor: se reintenta."""


RETRYABLE = (
    httpx.TimeoutException,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.RemoteProtocolError,
    _Transitorio,
)


def nombre_en_cache(ruta: str, params: dict[str, Any]) -> str:
    """
    El nombre del archivo de caché de un pedido: legible y estable.

    "/Equipo/EquipoBateo" + {idTemporada: 1990, idEtapa: "SR", ...}
      → "Equipo_EquipoBateo/idEquipo-01_idEtapa-SR_idTemporada-1990_manoLanza-.gz"

    Los parámetros van ordenados, así el mismo pedido cae siempre en el mismo
    archivo aunque se arme en otro orden. Si algún valor trae caracteres raros
    se reemplazan, y se añade un hash corto para que dos valores distintos no
    choquen tras la limpieza.
    """
    carpeta = ruta.strip("/").replace("/", "_") or "raiz"
    partes = [f"{k}-{params[k]}" for k in sorted(params)]
    base = "_".join(partes) or "sin-parametros"
    limpio = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    if limpio != base:
        limpio += "_" + hashlib.sha1(base.encode()).hexdigest()[:8]
    return f"{carpeta}/{limpio}.gz"


def _avisar_reintento(estado: RetryCallState) -> None:
    # No se usa tenacity.before_sleep_log: loguru formatea el MENSAJE con
    # str.format, y el texto del error trae el dict de parámetros con sus
    # llaves ({'idTemporada': ...}), que revienta con KeyError justo cuando
    # hay que reintentar. Pasado como argumento, loguru no lo interpreta.
    logger.warning(
        "DIGIMETRICS: intento {} falló ({}); se reintenta",
        estado.attempt_number,
        estado.outcome.exception() if estado.outcome else "?",
    )


class DigimetricsClient:
    """
    Uso:
        with DigimetricsClient() as dm:
            etapas = dm.post_json("/Equipo/SelectEtapasTemporada", {"idTemporada": 1990})
            html = dm.post_html("/Equipo/EquipoBateo", {...})

    Parámetros:
        cache_dir   Dónde se guardan las respuestas (None = sin caché).
        offline     Solo caché: si la página no está, SinCache. Sirve para
                    reprocesar sin red o para las pruebas.
        refrescar   Ignora la caché al LEER (la sigue escribiendo). Para
                    re-bajar una temporada que la fuente corrigió.
        intervalo   Segundos mínimos entre pedidos reales.
        http        Un httpx.Client ya armado (las pruebas pasan uno con
                    MockTransport). Si no, se crea uno.
    """

    def __init__(
        self,
        base_url: str = DIGIMETRICS_BASE_URL,
        cache_dir: Optional[str | Path] = DIGIMETRICS_CACHE_DIR,
        offline: bool = False,
        refrescar: bool = False,
        intervalo: float = DIGIMETRICS_INTERVALO_SEGUNDOS,
        max_bytes: int = DIGIMETRICS_MAX_BYTES,
        http: Optional[httpx.Client] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.offline = offline
        self.refrescar = refrescar
        self.intervalo = intervalo
        self.max_bytes = max_bytes
        self._ultimo = 0.0
        # Contadores para el resumen de la ingesta: cuántas páginas vinieron
        # del servidor y cuántas de la caché.
        self.pedidos_red = 0
        self.pedidos_cache = 0
        self._http = http or httpx.Client(
            base_url=self.base_url,
            timeout=httpx.Timeout(HTTP_TIMEOUT_SECONDS, connect=10.0),
            headers={"User-Agent": USER_AGENT},
            # El HTTPS del portal redirige a HTTP; pedimos HTTP directo, pero
            # seguir redirecciones no cuesta nada si un día lo cambian.
            follow_redirects=True,
        )

    # ─── Context manager ────────────────────────────────────────────────────

    def __enter__(self) -> "DigimetricsClient":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    # ─── API pública ────────────────────────────────────────────────────────

    def post_html(self, ruta: str, params: dict[str, Any]) -> str:
        """POST a una acción que devuelve un fragmento de HTML."""
        return self._post(ruta, params).decode("utf-8")

    def post_json(self, ruta: str, params: dict[str, Any]) -> Any:
        """POST a una acción que devuelve JSON (las listas de etapas)."""
        return json.loads(self._post(ruta, params).decode("utf-8"))

    # ─── Núcleo ─────────────────────────────────────────────────────────────

    def _post(self, ruta: str, params: dict[str, Any]) -> bytes:
        params = {k: ("" if v is None else str(v)) for k, v in params.items()}
        archivo = self.cache_dir / nombre_en_cache(ruta, params) if self.cache_dir else None

        if archivo and not self.refrescar and archivo.exists():
            self.pedidos_cache += 1
            return gzip.decompress(archivo.read_bytes())
        if self.offline:
            raise SinCache(f"{ruta} {params} no está en la caché ({archivo})")

        cuerpo = self._post_red(ruta, params)
        self.pedidos_red += 1

        if archivo:
            archivo.parent.mkdir(parents=True, exist_ok=True)
            # Escritura atómica: primero a un temporal y luego rename. Si el
            # proceso muere a mitad, no queda un .gz truncado que la próxima
            # corrida tomaría por bueno.
            tmp = archivo.with_suffix(".tmp")
            tmp.write_bytes(gzip.compress(cuerpo))
            tmp.replace(archivo)
        return cuerpo

    def _esperar_turno(self) -> None:
        falta = self.intervalo - (time.monotonic() - self._ultimo)
        if falta > 0:
            time.sleep(falta)

    @retry(
        stop=stop_after_attempt(HTTP_MAX_RETRIES),
        wait=wait_exponential(multiplier=2, min=2, max=20),
        retry=retry_if_exception_type(RETRYABLE),
        before_sleep=_avisar_reintento,
        reraise=True,
    )
    def _post_red(self, ruta: str, params: dict[str, str]) -> bytes:
        self._esperar_turno()
        inicio = time.monotonic()
        try:
            # POST sin cuerpo y con los parámetros en la URL: exactamente lo
            # que hace el jQuery del portal ($.ajax con url "...?idTemporada=").
            with self._http.stream("POST", ruta, params=params) as r:
                if r.status_code >= 500:
                    raise _Transitorio(f"{r.status_code} en {ruta} {params}")
                if r.status_code >= 400:
                    raise DigimetricsError(f"{r.status_code} en {ruta} {params}")
                trozos: list[bytes] = []
                total = 0
                for trozo in r.iter_bytes():
                    total += len(trozo)
                    if total > self.max_bytes:
                        raise PaginaDemasiadoPesada(
                            f"{ruta} {params} pasa de {self.max_bytes // 1024} KB "
                            "(fotos en base64)"
                        )
                    trozos.append(trozo)
        finally:
            self._ultimo = time.monotonic()
        cuerpo = b"".join(trozos)
        logger.debug(
            f"DIGIMETRICS {ruta} {params} → {len(cuerpo) // 1024} KB "
            f"en {time.monotonic() - inicio:.2f}s"
        )
        return cuerpo
