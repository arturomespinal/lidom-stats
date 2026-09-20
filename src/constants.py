"""
src/constants.py — Constantes canónicas del proyecto LIDOM Stats.

Toda referencia "mágica" del dominio (IDs externos, mappings, defaults)
vive aquí para no estar regada por el código.
"""

from __future__ import annotations

# ─────────────────────────────────────────────────────────────────────────────
# MLB Stats API
# ─────────────────────────────────────────────────────────────────────────────

MLB_API_HOST = "https://statsapi.mlb.com"

# La v1 sirve todo lo histórico: /stats, /schedule, /boxscore, /people.
MLB_API_BASE_URL = f"{MLB_API_HOST}/api/v1"

# El feed en vivo (formato GUMBO) SOLO existe en la v1.1. No es que la v1 lo
# sirva distinto: la ruta no está. Las dos versiones conviven y el cliente usa
# la que corresponda según el endpoint.
MLB_API_V11_BASE_URL = f"{MLB_API_HOST}/api/v1.1"

# IDs oficiales de la MLB Stats API para LIDOM
LIDOM_LEAGUE_ID = 131
LIDOM_SPORT_ID = 17  # "WIN" = Winter Leagues

# ─────────────────────────────────────────────────────────────────────────────
# Catálogo canónico de equipos LIDOM
#
# Mapping autoritativo: MLB team_id → nuestro team_code interno.
# Los nombres "full_name" están en su forma correcta con tildes y eñes,
# porque la API a veces los devuelve sin acentos (ej. "Aguilas Cibaenas").
# ─────────────────────────────────────────────────────────────────────────────

LIDOM_TEAMS: dict[int, dict[str, str]] = {
    667: {
        "team_code": "AGU",
        "full_name": "Águilas Cibaeñas",
        "short_name": "Águilas",
        "city": "Santiago",
        "founded_year": "1936",
        "primary_color": "#FFD400",  # Amarillo Águilas
    },
    668: {
        "team_code": "TOR",
        "full_name": "Toros del Este",
        "short_name": "Toros",
        "city": "La Romana",
        "founded_year": "1983",
        "primary_color": "#C8102E",  # Rojo Toros
    },
    669: {
        "team_code": "EST",
        "full_name": "Estrellas Orientales",
        "short_name": "Estrellas",
        "city": "San Pedro de Macorís",
        "founded_year": "1910",
        "primary_color": "#00713B",  # Verde Estrellas
    },
    670: {
        "team_code": "GIG",
        "full_name": "Gigantes del Cibao",
        "short_name": "Gigantes",
        "city": "San Francisco de Macorís",
        "founded_year": "1996",
        "primary_color": "#003DA5",  # Azul Gigantes
    },
    671: {
        "team_code": "ESC",
        "full_name": "Leones del Escogido",
        "short_name": "Escogido",
        "city": "Santo Domingo",
        "founded_year": "1921",
        "primary_color": "#C8102E",  # Rojo Escogido
    },
    672: {
        "team_code": "LIC",
        "full_name": "Tigres del Licey",
        "short_name": "Licey",
        "city": "Santo Domingo",
        "founded_year": "1907",
        "primary_color": "#003DA5",  # Azul Licey
    },
}

# Mapping inverso: team_code → MLB team_id (para queries reversas)
TEAM_CODE_TO_MLB_ID: dict[str, int] = {
    info["team_code"]: mlb_id for mlb_id, info in LIDOM_TEAMS.items()
}

# El mismo catálogo indexado por nuestro código, que es la clave con la que
# viajan los equipos por toda la aplicación: `games.home_team_code`, las vistas,
# la URL de la ficha (/teams/AGU) y TEAM_STYLES en los dos clientes. El id de
# MLB solo aparece al hablar con la API; nada de lo que sirve la nuestra lo usa.
#
# Se deriva, no se escribe a mano: un segundo diccionario literal con los mismos
# seis equipos se desincroniza el día que alguien corrija un nombre en uno solo.
LIDOM_TEAMS_BY_CODE: dict[str, dict[str, str]] = {
    info["team_code"]: info for info in LIDOM_TEAMS.values()
}


# ─────────────────────────────────────────────────────────────────────────────
# Tipos de juego MLB API
# ─────────────────────────────────────────────────────────────────────────────
# Estos valores van en el parámetro `gameType` de la API.

GAME_TYPE_REGULAR = "R"          # Temporada regular
GAME_TYPE_PLAYOFFS = "P"         # Playoffs (round robin)
GAME_TYPE_DIVISION = "D"         # División
GAME_TYPE_LEAGUE = "L"           # Final de liga (Serie Final LIDOM)
GAME_TYPE_WORLD_SERIES = "W"     # Serie Caribe (equivalente para LIDOM)
GAME_TYPE_SPRING = "S"           # Spring Training (no aplica LIDOM)


# ─────────────────────────────────────────────────────────────────────────────
# Defaults y políticas
# ─────────────────────────────────────────────────────────────────────────────

# Rate limiting: la API pública de MLB no documenta límites estrictos,
# pero por etiqueta y resiliencia mantenemos un mínimo de 100ms entre requests.
MIN_REQUEST_INTERVAL_SECONDS = 0.1

# User-Agent identificable. Es buena práctica decir quién eres.
USER_AGENT = "LIDOM-Stats/0.1 (https://github.com/arturomespinal/lidom-stats)"

# Timeout en segundos para cada request HTTP
HTTP_TIMEOUT_SECONDS = 30.0

# Reintentos en caso de fallo (5xx, timeout, conexión)
HTTP_MAX_RETRIES = 3

# Default DB
DEFAULT_DB_URL = "sqlite:///data/lidom_stats.db"
