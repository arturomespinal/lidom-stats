# src/utils/http_client.py — Cliente híbrido httpx + Playwright
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from src.utils.logger import logger

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-DO,es;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    # Headers que Chrome envía y httpx no — clave para evitar bloqueos
    "sec-ch-ua": '"Chromium";v="125", "Google Chrome";v="125"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
}

DEFAULT_TIMEOUT = 30


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    before_sleep=lambda retry_state: logger.warning(
        f"Reintento #{retry_state.attempt_number} tras fallo..."
    ),
)
def fetch_page(url: str, headers: dict | None = None, timeout: int = DEFAULT_TIMEOUT) -> str:
    """Intenta primero con httpx (rápido). Falla → usa Playwright (robusto)."""
    merged_headers = {**DEFAULT_HEADERS, **(headers or {})}
    logger.debug(f"GET → {url}")
    with httpx.Client(
        headers=merged_headers,
        timeout=timeout,
        follow_redirects=True,
        # Fuerza HTTP/1.1 — algunos sitios rechazan HTTP/2 de httpx
        http2=False,
    ) as client:
        response = client.get(url)
        response.raise_for_status()
    logger.debug(f"✓ {response.status_code} | {len(response.content):,} bytes | {url}")
    return response.text


def fetch_page_playwright(url: str, wait_for: str = "networkidle") -> str:
    """
    Descarga una página usando Playwright (Chromium headless).
    
    Usar cuando fetch_page falla por bloqueo de bot o contenido JS dinámico.
    
    Args:
        url: URL a descargar
        wait_for: Estrategia de espera — "networkidle" espera a que no
                  haya requests activas (ideal para SPAs que cargan datos)
    """
    from playwright.sync_api import sync_playwright

    logger.debug(f"[Playwright] GET → {url}")

    with sync_playwright() as p:
        # Lanzar Chromium headless con perfil realista
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",  # oculta que es bot
            ],
        )
        context = browser.new_context(
            # Viewport y locale reales
            viewport={"width": 1920, "height": 1080},
            locale="es-DO",
            timezone_id="America/Santo_Domingo",
            # User agent de Chrome real
            user_agent=DEFAULT_HEADERS["User-Agent"],
        )

        page = context.new_page()

        # Inyectar script para ocultar que es Playwright
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """)

        page.goto(url, wait_until=wait_for, timeout=30_000)
        html = page.content()

        browser.close()

    logger.debug(f"[Playwright] ✓ {len(html):,} bytes | {url}")
    return html


__all__ = ["fetch_page", "fetch_page_playwright"]