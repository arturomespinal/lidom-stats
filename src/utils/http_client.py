# Cliente HTTP centralizado con reintentos automáticos y rate limiting ético.
# Usamos httpx (async-ready) + tenacity para robustez.
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from src.utils.logger import logger


# Headers que simulan un navegador real — reduce bloqueos
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-DO,es;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
}

# Tiempo máximo de espera por request (segundos)
DEFAULT_TIMEOUT = 30


@retry(
    # Reintenta hasta 3 veces si falla por error de red o HTTP 5xx
    stop=stop_after_attempt(3),
    # Espera exponencial: 2s → 4s → 8s entre intentos
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    before_sleep=lambda retry_state: logger.warning(
        f"Reintento #{retry_state.attempt_number} tras fallo..."
    ),
)
def fetch_page(url: str, headers: dict | None = None, timeout: int = DEFAULT_TIMEOUT) -> str:
    """
    Descarga el HTML de una URL con manejo de errores y reintentos.
    
    Args:
        url: URL completa a descargar.
        headers: Headers HTTP opcionales (se mezclan con los defaults).
        timeout: Timeout en segundos.
        
    Returns:
        HTML de la página como string.
        
    Raises:
        httpx.HTTPStatusError: Si el servidor responde con error 4xx/5xx.
    """
    merged_headers = {**DEFAULT_HEADERS, **(headers or {})}
    
    logger.debug(f"GET → {url}")
    
    with httpx.Client(headers=merged_headers, timeout=timeout, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()  # Lanza excepción si status >= 400
        
    logger.debug(f"✓ {response.status_code} | {len(response.content):,} bytes | {url}")
    return response.text


__all__ = ["fetch_page"]