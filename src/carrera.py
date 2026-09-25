"""
src/carrera.py — Totales de carrera a partir de las temporadas.

Por qué existe este módulo en vez de sumar en el cliente: **las tasas no se
suman ni se promedian**. Un bateador que hizo .400 en 10 turnos y .250 en 400
no batea .325 de por vida; batea .254. El promedio simple da un número que se
ve razonable y está mal, y lo estaría igual en la web que en el móvil, cada uno
a su manera.

Así que la API entrega el bloque ya compuesto y el cliente solo lo pinta. Misma
regla que `src/lateralidad.py`: un solo lugar donde traducir es un solo lugar
donde equivocarse.

Las fórmulas son las de `VIEW_STATEMENTS` en src/models/database.py, aplicadas
a los totales en vez de a una temporada. Se calculan sobre conteos atómicos —
AB, H, BB, HBP, SF, outs— nunca sobre los promedios ya redondeados de cada año.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable

# Conteos que se suman tal cual. Los de bateo primero, los de pitcheo después;
# una lista por disciplina, porque `h` y `so` significan cosas distintas en cada
# una (hits conectados contra hits permitidos) y mezclarlas sería un desastre
# silencioso el día que alguien itere sobre la unión de las dos.
CONTEOS_BATEO = (
    "games", "games_batted", "pa", "ab", "h", "doubles", "triples", "hr",
    "r", "rbi", "bb", "so", "sb", "hbp", "sf",
)
CONTEOS_PITCHEO = (
    "games", "games_started", "wins", "losses", "saves", "outs", "h", "er",
    "so", "bb",
)


def _suma(filas: Iterable[dict], campos: tuple[str, ...]) -> dict[str, int]:
    """Suma campo por campo, tratando el NULL de SQL como cero."""
    return {campo: sum((fila.get(campo) or 0) for fila in filas) for campo in campos}


def carrera_bateo(temporadas: list[dict]) -> dict[str, Any] | None:
    """Totales de bateo de toda la carrera, con las tasas recompuestas.

    `temporadas` son filas de `v_batting_season` — una por temporada Y equipo,
    así que un jugador cambiado a mitad de campaña aporta dos. Sumar las dos es
    lo correcto: son turnos del mismo hombre.
    """
    if not temporadas:
        return None

    total: dict[str, Any] = _suma(temporadas, CONTEOS_BATEO)

    ab = total["ab"]
    # Bases alcanzadas: sencillos + 2×dobles + 3×triples + 4×jonrones. Los
    # sencillos no están guardados; salen de restarle al total de hits los
    # extrabases, que es como los deriva también la vista.
    sencillos = total["h"] - total["doubles"] - total["triples"] - total["hr"]
    bases = sencillos + 2 * total["doubles"] + 3 * total["triples"] + 4 * total["hr"]

    en_base = total["h"] + total["bb"] + total["hbp"]
    oportunidades = ab + total["bb"] + total["hbp"] + total["sf"]

    total["tb"] = bases
    total["avg"] = round(total["h"] / ab, 3) if ab else None
    total["obp"] = round(en_base / oportunidades, 3) if oportunidades else None
    total["slg"] = round(bases / ab, 3) if ab else None
    total["ops"] = (
        round(total["obp"] + total["slg"], 3)
        if total["obp"] is not None and total["slg"] is not None
        else None
    )

    # Contexto de la carrera, que es justo lo que una ficha quiere en la
    # cabecera: cuántas campañas y con cuántas camisetas.
    total["seasons"] = len({fila["season_id"] for fila in temporadas})
    total["teams"] = len({fila["team_code"] for fila in temporadas})
    return total


def carrera_pitcheo(temporadas: list[dict]) -> dict[str, Any] | None:
    """Totales de pitcheo, con ERA y WHIP recompuestas sobre los outs."""
    if not temporadas:
        return None

    total: dict[str, Any] = _suma(temporadas, CONTEOS_PITCHEO)
    outs = total["outs"]

    total["innings_pitched"] = round(outs / 3.0, 1) if outs else 0.0
    # ERA = ER×9/IP y WHIP = (BB+H)/IP, expresadas en outs para no pasar por el
    # valor redondeado de las entradas. En outs: ER×27/outs y (BB+H)×3/outs.
    total["era"] = round(total["er"] * 27 / outs, 2) if outs else None
    total["whip"] = round((total["bb"] + total["h"]) * 3 / outs, 2) if outs else None

    total["seasons"] = len({fila["season_id"] for fila in temporadas})
    total["teams"] = len({fila["team_code"] for fila in temporadas})
    return total


def es_lanzador(bateo: list[dict], pitcheo: list[dict]) -> bool:
    """
    ¿Es un lanzador? Por VOLUMEN, no por haber lanzado alguna vez.

    Antes era `bool(pitcheo)`: cualquiera con una aparición en el montículo.
    Eso metía a 17 jugadores de posición que lanzaron una sola vez en un juego
    roto —Jordany Valdespin: 340 juegos al bate, 1 lanzando— y su ficha abría
    con "Carrera · pitcheo, EFE 0.00" en vez de su bateo.

    Se comparan juegos lanzados contra juegos CON aparición al plato
    (`games_batted`, no `games`: un corredor emergente no batea). En la base
    real el corte es limpio: ningún lanzador pasa de 4 juegos al bate —en
    LIDOM batea el designado—, así que no hace falta un umbral fino.
    """
    juegos_lanzando = sum(t.get("games") or 0 for t in pitcheo)
    juegos_bateando = sum(t.get("games_batted") or 0 for t in bateo)
    return juegos_lanzando > juegos_bateando


def equipos_de_la_carrera(*bloques: list[dict]) -> list[dict[str, Any]]:
    """Los equipos por los que pasó, con el rango de temporadas en cada uno.

    Recibe los bloques de bateo y de pitcheo porque un lanzador también batea
    alguna vez y un jugador de posición ha lanzado en juegos rotos: tomar uno
    solo dejaría equipos fuera de la ficha.

    El orden es cronológico inverso —lo más reciente primero—, que es el que
    espera quien abre la ficha de un jugador activo.
    """
    por_equipo: dict[str, set[str]] = {}
    for bloque in bloques:
        for fila in bloque:
            por_equipo.setdefault(fila["team_code"], set()).add(fila["season_id"])

    equipos = [
        {
            "team_code": codigo,
            "seasons": len(temporadas),
            "first_season": min(temporadas),
            "last_season": max(temporadas),
        }
        for codigo, temporadas in por_equipo.items()
    ]
    equipos.sort(key=lambda e: (e["last_season"], e["seasons"]), reverse=True)
    return equipos


def edad(fecha_nacimiento: str | None, hoy: date | None = None) -> int | None:
    """Edad en años cumplidos a partir de `YYYY-MM-DD`.

    `hoy` es parámetro y no `date.today()` a secas para que la suite pueda fijar
    la fecha: una comprobación de edad que cambie de resultado el día del
    cumpleaños del jugador es una prueba que falla sola una vez al año.

    Se resta el cumpleaños comparando (mes, día) en vez de dividir días entre
    365.25: lo segundo se equivoca por un día alrededor de los bisiestos.
    """
    if not fecha_nacimiento:
        return None
    try:
        nacimiento = date.fromisoformat(fecha_nacimiento[:10])
    except ValueError:
        return None

    referencia = hoy or date.today()
    años = referencia.year - nacimiento.year
    if (referencia.month, referencia.day) < (nacimiento.month, nacimiento.day):
        años -= 1
    return años if años >= 0 else None
