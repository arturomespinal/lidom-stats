# Clase base abstracta para todos los scrapers del proyecto.
# Define el contrato que cada scraper DEBE implementar.
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from bs4 import BeautifulSoup
from src.utils.http_client import fetch_page
from src.utils.logger import logger


@dataclass
class ScrapeResult:
    """Resultado estandarizado de cualquier operación de scraping."""
    source: str                          # Nombre de la fuente (ej. "lidom_official")
    url: str                             # URL que fue scrapeada
    scraped_at: datetime = field(default_factory=datetime.now)
    success: bool = True
    data: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    
    @property
    def record_count(self) -> int:
        return len(self.data)


class BaseScraper(ABC):
    """
    Clase base para todos los scrapers de LIDOM Stats.
    
    Cada scraper concreto hereda de esta clase e implementa:
    - scrape(): lógica de extracción específica de la fuente
    - parse(): transformación de HTML crudo a datos estructurados
    """
    
    def __init__(self, source_name: str, base_url: str):
        self.source_name = source_name
        self.base_url = base_url
        self.logger = logger.bind(scraper=source_name)  # Logger con contexto
    
    def get_soup(self, url: str, **kwargs) -> BeautifulSoup:
        """Descarga una página y retorna un objeto BeautifulSoup listo para parsear."""
        html = fetch_page(url, **kwargs)
        # lxml es el parser más rápido — por eso está en requirements.txt
        return BeautifulSoup(html, "lxml")
    
    @abstractmethod
    def scrape(self, **kwargs) -> ScrapeResult:
        """
        Punto de entrada principal del scraper.
        Debe retornar siempre un ScrapeResult.
        """
        ...
    
    @abstractmethod
    def parse(self, soup: BeautifulSoup) -> list[dict]:
        """
        Parsea el HTML y extrae los datos como lista de diccionarios.
        """
        ...
    
    def _create_result(self) -> ScrapeResult:
        """Factory para crear un ScrapeResult con los metadatos del scraper."""
        return ScrapeResult(source=self.source_name, url=self.base_url)


__all__ = ["BaseScraper", "ScrapeResult"]