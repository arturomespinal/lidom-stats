# src/scrapers/baseball_reference_scraper.py — PARSER CORREGIDO

import time
from bs4 import BeautifulSoup
from src.scrapers.base_scraper import BaseScraper, ScrapeResult
from src.utils.logger import logger

BR_BASE_URL = "https://www.baseball-reference.com"

LIDOM_LEAGUE_IDS = {
    "2025": "c9973ea9",
    "2024": "3d6041f6",
    "2023": "e19532f4",
    "2022": "3f25ed18",
    "2021": "79cba85c",
    "2019": "449c696d",
    "2018": "5dff08bb",
}


class BaseballReferenceScraper(BaseScraper):

    def __init__(self):
        super().__init__(
            source_name="baseball_reference",
            base_url=BR_BASE_URL,
        )

    # En baseball_reference_scraper.py — hacer pitching tolerante a fallos
    def scrape(self, season: str = "2025") -> ScrapeResult:
        result = self._create_result()

        if season not in LIDOM_LEAGUE_IDS:
            msg = f"Temporada '{season}' no disponible."
            result.success = False
            result.errors.append(msg)
            return result

        league_id = LIDOM_LEAGUE_IDS[season]
        self.logger.info(f"Temporada: {season} | League ID: {league_id}")

        try:
            standings = self._scrape_standings(league_id, season)
            result.data.extend(standings)
            self.logger.info(f"✓ Standings: {len(standings)} equipos")
            time.sleep(3)

            batting = self._scrape_batting_leaders(league_id, season)
            result.data.extend(batting)
            self.logger.info(f"✓ Bateo: {len(batting)} registros")
            time.sleep(3)

            # ✅ Pitching en bloque try independiente — si falla, el resto sigue
            try:
                pitching = self._scrape_pitching_leaders(league_id, season)
                result.data.extend(pitching)
                self.logger.info(f"✓ Pitcheo: {len(pitching)} registros")
            except Exception as e:
                # Error 500 de BR — registrar y continuar sin pitching
                result.errors.append(f"Pitching no disponible para {season}: {e}")
                self.logger.warning(
                    f"⚠ Pitching omitido para temporada {season} "
                    f"(BR devolvió error): {e.__class__.__name__}"
                )

        except Exception as e:
            result.success = False
            result.errors.append(str(e))
            self.logger.error(f"Error crítico: {e}", exc_info=True)

        # Éxito parcial: datos extraídos aunque pitching falle
        if result.data:
            result.success = True

        self.logger.info(
            f"Completado | Éxito: {result.success} | "
            f"Registros: {result.record_count} | "
            f"Warnings: {len(result.errors)}"
        )
        return result

    def parse(self, soup: BeautifulSoup) -> list[dict]:
        return []

    # -------------------------------------------------------------------------
    # Utilidad central: parsear cualquier tabla de BR correctamente
    # -------------------------------------------------------------------------
    def _parse_br_table(self, table: BeautifulSoup) -> tuple[list[str], list[dict]]:
        """
        Parsea una tabla de Baseball-Reference correctamente.

        El truco de BR: en el <tbody>, cada fila de datos tiene:
          - Una <th> con el ranking o nombre (NO es header global)
          - Varias <td> con los valores

        Entonces los headers SOLO vienen del <thead>, y las filas
        del <tbody> combinan [th_value] + [td_values].

        Returns:
            (headers, rows) donde rows es lista de dicts alineados.
        """
        records = []

        # 1. Extraer headers ÚNICAMENTE del <thead>
        thead = table.find("thead")
        if not thead:
            return [], []

        headers = []
        for th in thead.find_all("th"):
            # data-stat es el atributo más confiable de BR para el nombre real
            stat = th.get("data-stat") or th.get_text(strip=True)
            headers.append(stat)

        if not headers:
            return [], []

        # 2. Extraer filas del <tbody> — cada fila tiene <th> + <td>
        tbody = table.find("tbody")
        if not tbody:
            return headers, []

        for row in tbody.find_all("tr"):
            # Ignorar filas separadoras (class="thead" o similares)
            row_class = row.get("class", [])
            if "thead" in row_class or "spacer" in row_class:
                continue

            # Combinar <th> (columna 0, siempre presente en BR) + <td>
            th_cell = row.find("th")
            td_cells = row.find_all("td")

            if not th_cell and not td_cells:
                continue

            # Construir lista de valores en orden: [th_val, td1_val, td2_val, ...]
            all_cells = ([th_cell] if th_cell else []) + td_cells

            # Alinear con headers
            record = {}
            for i, header in enumerate(headers):
                if i >= len(all_cells):
                    break
                cell = all_cells[i]
                # data-stat en <td> también da el nombre real del campo
                field_name = cell.get("data-stat") or header
                record[field_name] = cell.get_text(strip=True)

            # Extraer URLs de jugador/equipo si existen
            link = row.find("a")
            if link and link.get("href"):
                href = link["href"]
                if "player" in href:
                    record["player_url"] = BR_BASE_URL + href
                elif "team" in href:
                    record["team_url"] = BR_BASE_URL + href

            if record:
                records.append(record)

        return headers, records

    # -------------------------------------------------------------------------
    # Standings
    # -------------------------------------------------------------------------
    def _scrape_standings(self, league_id: str, season: str) -> list[dict]:
        url = f"{self.base_url}/register/league.cgi?id={league_id}"
        soup = self.get_soup(url) 
        return self._parse_standings(soup, season)

    def _parse_standings(self, soup: BeautifulSoup, season: str) -> list[dict]:
        records = []

    # ✅ ID real confirmado: 'regular_season', no 'standings'
        table = soup.find("table", id="regular_season")
        if not table:
            # Fallback: cualquier tabla con data-stat="W"
            for t in soup.find_all("table"):
             if t.find(attrs={"data-stat": "W"}):
                table = t
                break

        if not table:
            self.logger.warning("Tabla standings no encontrada")
            self._save_debug_html(str(soup), f"standings_{season}_debug.html")
            return records

        _, rows = self._parse_br_table(table)

        for row in rows:
            team_name = row.get("team_ID", "")
            if not team_name or team_name in ("Tm", ""):
                continue

            record = {
                "record_type": "standing",
                "season": season,
                "source": self.source_name,
                **row,
            }
            records.append(record)

        return records

    # -------------------------------------------------------------------------
    # Líderes de bateo y pitcheo
    # -------------------------------------------------------------------------
    def _scrape_batting_leaders(self, league_id: str, season: str) -> list[dict]:
        url = f"{self.base_url}/register/leader.cgi?id={league_id}&type=bat"
        soup = self.get_soup(url)
        return self._parse_leaders(soup, season, stat_type="batting")

    def _scrape_pitching_leaders(self, league_id: str, season: str) -> list[dict]:
        url = f"{self.base_url}/register/leader.cgi?id={league_id}&type=pitch"
        soup = self.get_soup(url)
        return self._parse_leaders(soup, season, stat_type="pitching")

    def _parse_leaders(
        self, soup: BeautifulSoup, season: str, stat_type: str
    ) -> list[dict]:
        records = []
        tables = soup.find_all("table")

        if not tables:
            self.logger.warning(f"No se encontraron tablas de {stat_type}")
            self._save_debug_html(str(soup), f"br_{stat_type}_{season}_debug.html")
            return records

        for table in tables:
            # Detectar categoría estadística desde el caption
            caption = table.find("caption")
            category = caption.get_text(strip=True) if caption else "unknown"

            _, rows = self._parse_br_table(table)

            for row in rows:
                # Filtrar filas sin nombre de jugador
                player = row.get("player") or row.get("name_display") or row.get("Name", "")
                if not player or player in ("Name", ""):
                    continue

                record = {
                    "record_type": f"{stat_type}_leader",
                    "category": category,
                    "season": season,
                    "source": self.source_name,
                    **row,
                }
                records.append(record)

        return records

    def scrape_all_seasons(self) -> ScrapeResult:
        combined = self._create_result()
        for season in LIDOM_LEAGUE_IDS:
            self.logger.info(f"Procesando temporada {season}...")
            result = self.scrape(season=season)
            combined.data.extend(result.data)
            if not result.success:
                combined.errors.extend(result.errors)
            time.sleep(5)
        combined.success = len(combined.errors) == 0
        return combined


__all__ = ["BaseballReferenceScraper", "LIDOM_LEAGUE_IDS"]