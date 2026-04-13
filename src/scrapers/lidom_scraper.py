# src/scrapers/lidom_scraper.py — ACTUALIZADO con selectores reales
import time
from bs4 import BeautifulSoup
from src.scrapers.base_scraper import BaseScraper, ScrapeResult
from src.utils.logger import logger

# ✅ La fuente real de datos estructurados es el subdominio de estadísticas
LIDOM_STATS_URL = "https://estadisticas.lidom.com"

# Equipos conocidos con sus IDs oficiales (del DOM real)
LIDOM_TEAMS = {
    "01": "Águilas Cibaeñas",
    "02": "Tigres del Licey",
    "03": "Leones del Escogido",
    "04": "Gigantes del Cibao",
    "05": "Toros del Este",
    "06": "Estrellas Orientales",
    "07": "Azucareros del Este",
    "08": "Caimanes del Sur",
    "09": "Gigantes del Nordeste",
}


class LidomScraper(BaseScraper):
    """
    Scraper para el portal oficial de estadísticas de LIDOM.
    Fuente: estadisticas.lidom.com (DIGIMETRICS)
    
    Extrae: standings, lideratos, stats colectivas por equipo.
    """

    def __init__(self):
        super().__init__(
            source_name="lidom_stats",
            base_url=LIDOM_STATS_URL,
        )

    def scrape(self, season: str = "2025") -> ScrapeResult:
        """
        Extrae datos de la temporada especificada.

        Args:
            season: Año de la temporada (ej. "2025" = temporada 2024-2025)
        """
        result = self._create_result()

        try:
            self.logger.info(f"Iniciando scraping | Temporada: {season}")

            # --- Paso 1: Standings (tabla de posiciones) ---
            standings = self._scrape_standings(season)
            result.data.extend(standings)
            self.logger.info(f"✓ {len(standings)} equipos en standings")
            time.sleep(2)

            # --- Paso 2: Stats colectivas ---
            team_stats = self._scrape_collective_stats(season)
            result.data.extend(team_stats)
            self.logger.info(f"✓ {len(team_stats)} registros de stats colectivas")
            time.sleep(2)

            # --- Paso 3: Lideratos (top jugadores) ---
            leaders = self._scrape_leaders(season)
            result.data.extend(leaders)
            self.logger.info(f"✓ {len(leaders)} registros de lideratos")

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
        """Implementación del método abstracto — parsing se hace por método."""
        return []

    # -------------------------------------------------------------------------
    # Standings
    # -------------------------------------------------------------------------
    def _scrape_standings(self, season: str) -> list[dict]:
        """Extrae la tabla de posiciones."""
        url = f"{self.base_url}/TablaPosicion"
        soup = self.get_soup(url)
        return self._parse_standings(soup, season)

    def _parse_standings(self, soup: BeautifulSoup, season: str) -> list[dict]:
        """
        Parsea la tabla de posiciones.
        Columnas reales: Equipo, J, G, P, Pct, Dif, Casa, Ruta, Racha, U10,
                         X1, EX, CA, CP, DC, Último Juego
        """
        records = []
        # La tabla principal tiene headers con texto conocido
        table = soup.find("table")
        if not table:
            self.logger.warning("Tabla de standings no encontrada")
            self._save_debug_html(str(soup), "standings_debug.html")
            return records

        rows = table.find_all("tr")[1:]  # Saltar header
        for row in rows:
            cols = row.find_all("td")
            if len(cols) < 6:
                continue
            try:
                # El nombre del equipo está en el primer <td>, dentro de <a>
                team_link = cols[0].find("a")
                team_name = team_link.get_text(strip=True) if team_link else cols[0].get_text(strip=True)
                team_id = None
                if team_link and "idEquipo=" in team_link.get("href", ""):
                    team_id = team_link["href"].split("idEquipo=")[-1]

                records.append({
                    "record_type": "standing",
                    "season": season,
                    "team_name": team_name,
                    "team_id": team_id,
                    "games_played": cols[1].get_text(strip=True),
                    "wins": cols[2].get_text(strip=True),
                    "losses": cols[3].get_text(strip=True),
                    "pct": cols[4].get_text(strip=True),
                    "games_back": cols[5].get_text(strip=True),
                    "home_record": cols[6].get_text(strip=True),
                    "away_record": cols[7].get_text(strip=True),
                    "streak": cols[8].get_text(strip=True),
                    "last_10": cols[9].get_text(strip=True),
                    "source": self.source_name,
                })
            except (IndexError, AttributeError) as e:
                self.logger.warning(f"Error parseando fila de standings: {e}")
                continue

        return records

    # -------------------------------------------------------------------------
    # Stats colectivas por equipo
    # -------------------------------------------------------------------------
    def _scrape_collective_stats(self, season: str) -> list[dict]:
        """Extrae stats colectivas (batting/pitching) por equipo."""
        url = f"{self.base_url}/Colectivo"
        soup = self.get_soup(url)
        return self._parse_collective_stats(soup, season)

    def _parse_collective_stats(self, soup: BeautifulSoup, season: str) -> list[dict]:
        """Parsea la página de estadísticas colectivas."""
        records = []
        tables = soup.find_all("table")
        if not tables:
            self.logger.warning("Tablas de stats colectivas no encontradas")
            self._save_debug_html(str(soup), "collective_stats_debug.html")
            return records

        for table in tables:
            headers = [th.get_text(strip=True) for th in table.find_all("th")]
            for row in table.find_all("tr")[1:]:
                cols = row.find_all("td")
                if not cols:
                    continue
                record = {"record_type": "collective_stat", "season": season, "source": self.source_name}
                for i, header in enumerate(headers):
                    if i < len(cols):
                        record[header.lower().replace(" ", "_")] = cols[i].get_text(strip=True)
                records.append(record)

        return records

    # -------------------------------------------------------------------------
    # Lideratos (top jugadores por categoría)
    # -------------------------------------------------------------------------
    def _scrape_leaders(self, season: str) -> list[dict]:
        """Extrae los lideratos estadísticos."""
        url = f"{self.base_url}/Lider"
        soup = self.get_soup(url)
        return self._parse_leaders(soup, season)

    def _parse_leaders(self, soup: BeautifulSoup, season: str) -> list[dict]:
        """Parsea la página de lideratos."""
        records = []
        tables = soup.find_all("table")
        if not tables:
            self.logger.warning("Tablas de lideratos no encontradas")
            self._save_debug_html(str(soup), "leaders_debug.html")
            return records

        for table in tables:
            # Intentar detectar la categoría desde un título cercano
            category = "unknown"
            prev = table.find_previous(["h2", "h3", "h4", "div"])
            if prev:
                category = prev.get_text(strip=True)

            headers = [th.get_text(strip=True) for th in table.find_all("th")]
            for row in table.find_all("tr")[1:]:
                cols = row.find_all("td")
                if not cols:
                    continue
                record = {
                    "record_type": "leader",
                    "season": season,
                    "category": category,
                    "source": self.source_name,
                }
                for i, header in enumerate(headers):
                    if i < len(cols):
                        record[header.lower().replace(" ", "_")] = cols[i].get_text(strip=True)
                records.append(record)

        return records

    # -------------------------------------------------------------------------
    # Detalles por equipo (usando IDs reales del DOM)
    # -------------------------------------------------------------------------
    def scrape_team_detail(self, team_id: str, season: str = "2025") -> list[dict]:
        """
        Extrae estadísticas detalladas de un equipo específico.
        
        Args:
            team_id: ID del equipo ("01" a "09")
            season: Año de temporada
        """
        url = f"{self.base_url}/Equipo/Detalle?idEquipo={team_id}"
        soup = self.get_soup(url)
        records = []

        tables = soup.find_all("table")
        for table in tables:
            headers = [th.get_text(strip=True) for th in table.find_all("th")]
            for row in table.find_all("tr")[1:]:
                cols = row.find_all("td")
                if not cols:
                    continue
                record = {
                    "record_type": "team_detail",
                    "team_id": team_id,
                    "team_name": LIDOM_TEAMS.get(team_id, "Unknown"),
                    "season": season,
                    "source": self.source_name,
                }
                for i, header in enumerate(headers):
                    if i < len(cols):
                        record[header.lower().replace(" ", "_")] = cols[i].get_text(strip=True)
                records.append(record)

        return records


__all__ = ["LidomScraper", "LIDOM_TEAMS"]