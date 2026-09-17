"""
src/qualification.py — Mínimos de calificación para tablas de líderes.

La regla vive aquí y no dentro de un endpoint porque se aplica en dos capas:
los endpoints sobre tablas planas (api/main.py) y los que leen las vistas de
granularidad de juego (api/game_routes.py). Tenerla duplicada garantizaría que
un día muestren líderes distintos.

Dos ideas que conviene no perder:

1. El mínimo existe para las estadísticas de TASA, donde pocas apariciones
   inflan el número: sin él, quien batea de 1-1 encabeza el promedio con 1.000.
   En las acumuladas no aplica — nadie exige un mínimo para liderar jonrones o
   ponches, porque el propio acumulado ya premia haber jugado.

2. El estándar de pitcheo de la MLB no es trasladable a una liga invernal.
   1.0 entrada por juego de equipo deja UN solo calificado en LIDOM: un abridor
   de aquí hace entre 8 y 14 aperturas y llega a lo sumo a 50 entradas, contra
   las ~32 aperturas y ~190 entradas de un abridor de Grandes Ligas. Con 0.6
   quedan 14, aproximadamente la misma proporción por equipo que produce el
   3.1 del bateo.
"""

from __future__ import annotations

# Apariciones al plato por juego de equipo. Es el mínimo oficial del béisbol y
# en una temporada de 50 juegos deja 16 calificados de 209: funciona tal cual.
PA_PER_TEAM_GAME = 3.1

# Entradas lanzadas por juego de equipo. Adaptado a la liga invernal; ver la
# nota 2 de arriba.
IP_PER_TEAM_GAME = 0.6


def qualifying_pa(team_games: int) -> int:
    """Turnos mínimos para entrar a una tabla de líderes de tasa de bateo."""
    return round(PA_PER_TEAM_GAME * max(0, team_games))


def qualifying_ip(team_games: int) -> float:
    """Entradas mínimas para entrar a una tabla de líderes de tasa de pitcheo."""
    return round(IP_PER_TEAM_GAME * max(0, team_games), 1)


__all__ = [
    "PA_PER_TEAM_GAME",
    "IP_PER_TEAM_GAME",
    "qualifying_pa",
    "qualifying_ip",
]
