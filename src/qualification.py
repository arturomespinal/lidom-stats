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

3. Los RÉCORDS de una temporada piden más: 0.8 entradas por juego (40 en una
   temporada de 50). Con 0.6, la mejor efectividad de la historia era el 0.00
   de Tommy Milone en 2018-19: real (seis aperturas, 34.1 entradas, ninguna
   limpia), pero un récord de todos los tiempos en 34 entradas se discute.
   Con 0.8 salen esos casos y quedan de 5 a 11 calificados por temporada
   desde 2012-13; con 1.0 quedaban 1 o 2 y el récord era solo de los años 50
   a 70, cuando los abridores tiraban el doble. Solo para las mejores
   temporadas (analitica/): los líderes de cada temporada siguen con 0.6.
"""

from __future__ import annotations

# Apariciones al plato por juego de equipo. Es el mínimo oficial del béisbol y
# en una temporada de 50 juegos deja 16 calificados de 209: funciona tal cual.
PA_PER_TEAM_GAME = 3.1

# Entradas lanzadas por juego de equipo. Adaptado a la liga invernal; ver la
# nota 2 de arriba.
IP_PER_TEAM_GAME = 0.6

# Para las mejores temporadas de la historia; ver la nota 3 de arriba.
IP_PER_TEAM_GAME_RECORD = 0.8


def qualifying_pa(team_games: int) -> int:
    """Turnos mínimos para entrar a una tabla de líderes de tasa de bateo."""
    return round(PA_PER_TEAM_GAME * max(0, team_games))


def qualifying_ip(team_games: int) -> float:
    """Entradas mínimas para entrar a una tabla de líderes de tasa de pitcheo."""
    return round(IP_PER_TEAM_GAME * max(0, team_games), 1)


def qualifying_ip_record(team_games: int) -> float:
    """Entradas mínimas para que una temporada compita por el récord de
    efectividad o de WHIP de todos los tiempos."""
    return round(IP_PER_TEAM_GAME_RECORD * max(0, team_games), 1)


__all__ = [
    "PA_PER_TEAM_GAME",
    "IP_PER_TEAM_GAME",
    "IP_PER_TEAM_GAME_RECORD",
    "qualifying_pa",
    "qualifying_ip",
    "qualifying_ip_record",
]
