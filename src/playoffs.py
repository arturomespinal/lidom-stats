"""
src/playoffs.py — La carrera por el round robin.

LIDOM juega una temporada regular de 6 equipos y clasifican 4 al round robin.
Esa línea entre el 4to y el 5to puesto es el dato más significativo de la tabla
de posiciones: dos tercios de la liga avanza, así que "cuántos juegos me faltan
para clasificar" le importa a un fanático más que "cuántos me faltan para ser
primero".

Se calcula aquí, desde G-P, y NO se toma de la MLB API.

El `gamesBack` que la API entrega ya mide respecto al 4to puesto — fue
justamente lo que descubrimos cuando Águilas aparecía con GB −9.5 siendo
líder. Pero depender de eso sería depender de una decisión de la MLB sobre
cómo agrupa una liga que no es suya: el día que LIDOM cambie el formato, o que
la API reagrupe los equipos, la columna mentiría en silencio y nadie lo
notaría. Desde G-P siempre dice la verdad y el formato es nuestro.
"""

from __future__ import annotations

from typing import Any, Sequence

# Cuántos equipos clasifican al round robin. Si LIDOM cambia el formato, se
# cambia aquí y toda la app se entera.
PLAYOFF_SPOTS = 4


def games_behind(ahead: Any, behind: Any) -> float:
    """
    Juegos que `behind` le lleva de atraso a `ahead`.

    La fórmula estándar del béisbol: promedia la diferencia de victorias con la
    de derrotas. No se usa el PCT porque dos equipos con distinto número de
    juegos jugados darían una distancia engañosa.

    Acepta dicts o cualquier objeto con .wins/.losses.
    """
    aw, al = _wl(ahead)
    bw, bl = _wl(behind)
    return ((aw - bw) + (bl - al)) / 2


def _wl(row: Any) -> tuple[int, int]:
    if isinstance(row, dict):
        return int(row.get("wins") or 0), int(row.get("losses") or 0)
    return int(getattr(row, "wins", 0) or 0), int(getattr(row, "losses", 0) or 0)


def annotate_playoff_race(
    rows: Sequence[dict], spots: int = PLAYOFF_SPOTS
) -> Sequence[dict]:
    """
    Marca cada fila con su situación frente a la línea de clasificación.

    `rows` debe venir YA ordenada por posición (el 1ro primero). Muta los dicts
    en sitio y los devuelve por comodidad.

    Añade dos campos:

      playoff_spot : bool
          Si el equipo ocupa hoy un puesto de clasificación.

      playoff_games : float | None
          Distancia a la línea, con signo. POSITIVO = juegos de colchón sobre
          el primer equipo que está fuera. NEGATIVO = juegos de atraso contra
          el último que está dentro. Cero = empatado en la línea.

          El punto de referencia cambia según el lado, y es a propósito: a un
          equipo clasificado le importa cuánto le pisa el 5to, y a uno fuera le
          importa cuánto le falta para alcanzar al 4to. Medir ambos contra el
          mismo equipo daría un número correcto pero inútil.
    """
    for i, row in enumerate(rows):
        row["playoff_spot"] = i < spots

    # Con la liga entera dentro no hay línea, y un número sería inventado.
    if len(rows) <= spots or spots <= 0:
        for row in rows:
            row["playoff_games"] = None
        return rows

    last_in = rows[spots - 1]    # el 4to: el último que clasifica
    first_out = rows[spots]      # el 5to: el primero que queda fuera

    for i, row in enumerate(rows):
        if i < spots:
            gap = games_behind(row, first_out)
        else:
            gap = -games_behind(last_in, row)
        # El "+ 0.0" no es adorno: negar cero en punto flotante da -0.0, que
        # viaja así en el JSON y JavaScript imprime como "-0". Sumarle cero lo
        # devuelve a 0.0 sin tocar ningún otro valor.
        row["playoff_games"] = gap + 0.0

    return rows


__all__ = ["PLAYOFF_SPOTS", "games_behind", "annotate_playoff_race"]
