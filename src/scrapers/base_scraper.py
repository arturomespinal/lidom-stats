# src/scrapers/base_scraper.py — con fallback automático a Playwright
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from bs4 import BeautifulSoup
from src.utils.http_client import fetch_page, fetch_page_playwright
from src.utils.logger import logger


@dataclass
class ScrapeResult:
    source: str
    url: str
    scraped_at: datetime = field(default_factory=datetime.now)
    success: bool = True
    data: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def record_count(self) -> int:
        return len(self.data)


class BaseScraper(ABC):
    def __init__(self, source_name: str, base_url: str):
        self.source_name = source_name
        self.base_url = base_url
        self.logger = logger.bind(scraper=source_name)

    def get_soup(self, url: str, force_playwright: bool = False, **kwargs) -> BeautifulSoup:
        """
        Descarga una página y retorna BeautifulSoup.
        
        Estrategia:
        1. Intenta httpx (rápido, sin overhead de browser)
        2. Si falla o `force_playwright=True`, usa Playwright (Chromium real)
        """
        html = None

        if not force_playwright:
            try:
                html = fetch_page(url, **kwargs)
            except Exception as e:
                self.logger.warning(
                    f"httpx falló ({e.__class__.__name__}) → cambiando a Playwright"
                )

        # Fallback a Playwright si httpx falló o se forzó
        if html is None:
            html = fetch_page_playwright(url)

        return BeautifulSoup(html, "lxml")

    @abstractmethod
    def scrape(self, **kwargs) -> ScrapeResult:
        ...

    @abstractmethod
    def parse(self, soup: BeautifulSoup) -> list[dict]:
        ...

    def _create_result(self) -> ScrapeResult:
        return ScrapeResult(source=self.source_name, url=self.base_url)

    def _save_debug_html(self, html: str, filename: str) -> None:
        import os
        debug_dir = "data/raw/debug"
        os.makedirs(debug_dir, exist_ok=True)
        filepath = os.path.join(debug_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)
        self.logger.debug(f"HTML de debug guardado en: {filepath}")


__all__ = ["BaseScraper", "ScrapeResult"]