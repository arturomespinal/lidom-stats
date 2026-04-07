# Scraper principal para lidom.com — fuente oficial de la liga.
import time
from bs4 import BeautifulSoup
from src.scrapers.base_scraper import BaseScraper, ScrapeResult
from src.utils.logger import logger


LIDOM_BASE_URL = "https://lidom.com"


class LidomScraper(BaseScraper):
    """
    Scraper para el sitio oficial de LIDOM (lidom.com).
    Extrae: equipos, standings, estadísticas de temporada.
    """
    
    def __init__(self):
        super().__init__(
            source_name="lidom_official",
            base_url=LIDOM_BASE_URL,
        )
    
    def scrape(self, season: str = "2024-2025") -> ScrapeResult:
        """
        Extrae datos de la temporada especificada.
        
        Args:
            season: Temporada en formato "YYYY-YYYY" (ej. "2024-2025")
        """
        result = self._create_result()
        
        try:
            self.logger.info(f"Iniciando scraping | Temporada: {season}")
            
            # --- Paso 1: Extraer equipos ---
            teams = self._scrape_teams()
            result.data.extend(teams)
            
            self.logger.info(f"✓ {len(teams)} equipos extraídos")
            
            # Pausa ética entre requests (no bombardear el servidor)
            time.sleep(2)
            
            # --- Paso 2: Standings (se añadirán más métodos aquí) ---
            # standings = self._scrape_standings(season)
            # result.data.extend(standings)
            
        except Exception as e:
            result.success = False
            result.errors.append(str(e))
            self.logger.error(f"Error durante el scraping: {e}")
        
        self.logger.info(
            f"Scraping completado | "
            f"Éxito: {result.success} | "
            f"Registros: {result.record_count}"
        )
        return result
    
    def parse(self, soup: BeautifulSoup) -> list[dict]:
        """Implementación del método abstracto — parsing genérico."""
        # Cada método específico tiene su propio parse interno
        return []
    
    def _scrape_teams(self) -> list[dict]:
        """Extrae la lista de equipos de LIDOM."""
        url = f"{self.base_url}/equipos"
        soup = self.get_soup(url)
        return self._parse_teams(soup)
    
    def _parse_teams(self, soup: BeautifulSoup) -> list[dict]:
        """
        Parsea la página de equipos.
        ⚠️  Los selectores CSS se ajustan según la estructura real del sitio.
        """
        teams = []
        
        # TODO: Inspeccionar lidom.com/equipos y ajustar este selector
        # Placeholder — se actualiza tras inspeccionar el DOM real
        team_cards = soup.select(".team-card, .equipo-item, article.team")
        
        if not team_cards:
            self.logger.warning("No se encontraron tarjetas de equipos — verificar selectores CSS")
            # Guardamos el HTML crudo para depuración
            self._save_debug_html(str(soup), "teams_debug.html")
        
        for card in team_cards:
            try:
                team = {
                    "name": card.select_one(".team-name, h2, h3").get_text(strip=True),
                    "url": card.select_one("a")["href"] if card.select_one("a") else None,
                    "logo_url": card.select_one("img")["src"] if card.select_one("img") else None,
                    "source": self.source_name,
                }
                teams.append(team)
            except (AttributeError, TypeError) as e:
                self.logger.warning(f"Error parseando tarjeta de equipo: {e}")
                continue
        
        return teams
    
    def _save_debug_html(self, html: str, filename: str) -> None:
        """Guarda HTML crudo para depuración cuando los selectores fallan."""
        import os
        debug_dir = "data/raw/debug"
        os.makedirs(debug_dir, exist_ok=True)
        filepath = os.path.join(debug_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)
        self.logger.debug(f"HTML de debug guardado en: {filepath}")


__all__ = ["LidomScraper"]