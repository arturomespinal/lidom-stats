"""
api/historia_routes.py — La historia de la liga: DIGIMETRICS (1951-2012) + MLB API.

    GET /historia/lideres             Líderes de todos los tiempos, serie regular
    GET /historia/miembros/{id}       Un jugador que solo existe en DIGIMETRICS

La lógica vive en src/historia.py; aquí solo HTTP. La ficha de los jugadores
que están en las dos fuentes sigue siendo /players/{player_id}, que ahora trae
también sus temporadas anteriores a 2012-13 (bloque `history`).

Si la base no tiene la capa histórica (nadie corrió `python main.py
ingest-historia`), estos endpoints responden 404 con el comando que falta, y la
ficha y el buscador siguen funcionando como antes.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.engine import Connection

from src.carrera import carrera_bateo, carrera_pitcheo, equipos_de_la_carrera
from src.historia import (
    ANIO_CORTE,
    CATEGORIAS_BATEO,
    CATEGORIAS_PITCHEO,
    CacheCarreras,
    es_lanzador_historico,
    nombre_para_mostrar,
    normalizar_nombre,
    temporadas_historicas,
)
from src.models.database import get_engine
from src.models.hist_models import etiqueta_historica

router = APIRouter()
engine = get_engine()
_cache = CacheCarreras()

SIN_HISTORIA = "La capa histórica no está cargada. Corre: python main.py ingest-historia"


def hay_historia(conn: Connection) -> bool:
    """¿Existen las tablas hist_* con datos y los enlaces?"""
    tablas = {n for (n,) in conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('hist_bateo', 'hist_enlaces')"))}
    if tablas != {"hist_bateo", "hist_enlaces"}:
        return False
    return conn.execute(text("SELECT 1 FROM hist_bateo LIMIT 1")).first() is not None


def _categorias(grupo: str) -> list[dict]:
    cats = CATEGORIAS_BATEO if grupo == "bateo" else CATEGORIAS_PITCHEO
    return [{"stat": k, "label": v[0], "is_rate": v[2]} for k, v in cats.items()]


@router.get("/historia/lideres", tags=["Historia"])
def lideres_historicos(
    group: str = Query("bateo", pattern="^(bateo|pitcheo)$"),
    stat: str = Query("h", max_length=20),
    limit: int = Query(25, ge=1, le=100),
):
    """
    Líderes de todos los tiempos en serie regular: DIGIMETRICS antes de
    2012-13 y la MLB API desde entonces, sumados por persona.

    Las tasas (AVG, OBP, SLG, OPS, EFE, WHIP) exigen un mínimo de carrera; ver
    MIN_PA_CARRERA y MIN_OUTS_CARRERA en src/historia.py.
    """
    cats = CATEGORIAS_BATEO if group == "bateo" else CATEGORIAS_PITCHEO
    if stat not in cats:
        raise HTTPException(422, f"'{stat}' no es una categoría de {group}: {', '.join(cats)}")
    with engine.connect() as conn:
        if not hay_historia(conn):
            raise HTTPException(404, SIN_HISTORIA)
    resultado = _cache.lideres(engine, group, stat, limit)
    return resultado | {"categories": _categorias(group)}


@router.get("/historia/resumen", tags=["Historia"])
def resumen_historico():
    """El líder de todos los tiempos de las categorías principales, en una
    sola llamada: la portada de récords de la web y del móvil."""
    with engine.connect() as conn:
        if not hay_historia(conn):
            raise HTTPException(404, SIN_HISTORIA)
    return _cache.resumen(engine)


def historia_de_jugador(conn: Connection, player_id: str, batting: list[dict], pitching: list[dict]) -> dict | None:
    """
    El bloque `history` de la ficha de un jugador de la MLB API: sus temporadas
    en DIGIMETRICS antes de 2012-13 y la carrera completa (las dos fuentes).
    None si no tiene años anteriores (o si no hay capa histórica).
    """
    if not hay_historia(conn):
        return None
    miembros = [i for (i,) in conn.execute(
        text("SELECT id_miembro FROM hist_enlaces WHERE player_id = :p"), {"p": player_id})]
    if not miembros:
        return None
    viejas = temporadas_historicas(conn, miembros)
    if not viejas["batting"] and not viejas["pitching"]:
        return None
    # La carrera completa: los años viejos (solo regular) más todo lo de la
    # MLB API. Las tasas se recomponen sobre la suma, nunca se promedian.
    todas_b = viejas["batting"] + batting
    todas_p = viejas["pitching"] + pitching
    return {
        "batting": viejas["batting"],
        "pitching": viejas["pitching"],
        "career_batting": carrera_bateo(todas_b),
        "career_pitching": carrera_pitcheo(todas_p),
        "teams": equipos_de_la_carrera(todas_b, todas_p),
        "id_miembro": min(miembros),
        "source": "DIGIMETRICS (estadisticas.lidom.com)",
    }


def historicos_que_coinciden(conn: Connection, q: str, limite: int) -> list[dict]:
    """
    Jugadores que solo están en DIGIMETRICS y cuyo nombre contiene `q`.

    - Los enlazados no: esos ya salen como jugadores de la MLB API.
    - Solo los que jugaron antes de 2012-13. Un no enlazado con años
      posteriores es alguien que la MLB API tiene con otro nombre; mostrarlo
      aquí sería un duplicado.
    - La comparación se hace en Python con el nombre normalizado, no con LIKE:
      SQLite solo pasa a minúsculas las letras sin tilde (LOWER('PEÑA') da
      'peÑa') y los años viejos están en mayúsculas. Así "pena" encuentra a
      "TONY PEÑA". Son unos pocos miles de nombres: se recorren sin problema.
    - Se mira también el nombre que se muestra: "diomedes" encuentra a
      "DIOM. GUAYUBIN OLIVO", que en la app sale como Diómedes Olivo.
    """
    if not hay_historia(conn):
        return []
    buscado = normalizar_nombre(q)
    if not buscado:
        return []
    filas = conn.execute(text(
        """
        SELECT j.id_miembro, j.nombre,
               MIN(t.temporada) AS primera, MAX(t.temporada) AS ultima,
               GROUP_CONCAT(DISTINCT t.team_code) AS equipos
        FROM hist_jugadores j
        JOIN (SELECT id_miembro, temporada, team_code FROM hist_bateo WHERE etapa = 'SR'
              UNION ALL
              SELECT id_miembro, temporada, team_code FROM hist_pitcheo WHERE etapa = 'SR') t
          ON t.id_miembro = j.id_miembro
        WHERE j.id_miembro NOT IN (SELECT id_miembro FROM hist_enlaces)
        GROUP BY j.id_miembro, j.nombre
        HAVING MIN(t.temporada) < :corte
        """), {"corte": ANIO_CORTE})
    coinciden = [
        r for r in filas
        if buscado in normalizar_nombre(r.nombre) or buscado in normalizar_nombre(nombre_para_mostrar(r.nombre))
    ]
    # Los más recientes primero, como el buscador de la MLB API.
    coinciden.sort(key=lambda r: (-r.ultima, r.nombre))
    return [
        {
            "id_miembro": r.id_miembro,
            "name": nombre_para_mostrar(r.nombre),
            "first_season": etiqueta_historica(r.primera),
            "last_season": etiqueta_historica(r.ultima),
            "teams": sorted(set((r.equipos or "").split(","))),
        }
        for r in coinciden[:limite]
    ]


@router.get("/historia/miembros/{id_miembro}", tags=["Historia"])
def miembro_historico(id_miembro: int):
    """
    La ficha de un jugador de DIGIMETRICS: todas sus temporadas, con las
    etapas (regular, round robin, final), y los totales de carrera de la serie
    regular.

    Si está enlazado a un jugador de la MLB API, `player_id` lo dice: su ficha
    completa es /players/{player_id}.
    """
    with engine.connect() as conn:
        if not hay_historia(conn):
            raise HTTPException(404, SIN_HISTORIA)
        fila = conn.execute(text("SELECT nombre FROM hist_jugadores WHERE id_miembro = :i"),
                            {"i": id_miembro}).first()
        if not fila:
            raise HTTPException(404, f"No hay ningún miembro {id_miembro} en DIGIMETRICS")
        enlace = conn.execute(text("SELECT player_id FROM hist_enlaces WHERE id_miembro = :i"),
                              {"i": id_miembro}).first()
        # Todas las etapas y todos los años de la fuente, para la tabla. Los
        # totales de carrera, solo con la regular.
        todo = temporadas_historicas(conn, [id_miembro], solo_regular=False, antes_del_corte=False)
    regular_b = [t for t in todo["batting"] if t["stage"] == "regular"]
    regular_p = [t for t in todo["pitching"] if t["stage"] == "regular"]
    post_b = [t for t in todo["batting"] if t["stage"] != "regular"]
    post_p = [t for t in todo["pitching"] if t["stage"] != "regular"]
    return {
        "player": {
            "id_miembro": id_miembro,
            "name": nombre_para_mostrar(fila.nombre),
            "player_id": enlace.player_id if enlace else None,
        },
        "batting": todo["batting"],
        "pitching": todo["pitching"],
        "career_batting": carrera_bateo(regular_b),
        "career_pitching": carrera_pitcheo(regular_p),
        "postseason_batting": carrera_bateo(post_b),
        "postseason_pitching": carrera_pitcheo(post_p),
        "teams": equipos_de_la_carrera(regular_b, regular_p),
        "is_pitcher": es_lanzador_historico(regular_b, regular_p),
        "source": "DIGIMETRICS (estadisticas.lidom.com)",
    }
