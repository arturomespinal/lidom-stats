"""Probabilidad de ganar en vivo, calibrada con LIDOM.

Por qué no se usa una tabla de Grandes Ligas
--------------------------------------------
Porque daría números equivocados de forma sistemática. Medido sobre las 14
temporadas (152.251 apariciones al plato):

    carreras por equipo por juego   LIDOM 4.116   MLB ~4.5
    jonrones por aparición          LIDOM 1.36%   MLB ~3%
    OBP de liga                     LIDOM .319

Una liga que anota menos y con mucho menos poder es una liga donde una ventaja
se defiende mejor. La misma ventaja de dos carreras en el séptimo vale MÁS aquí
que en Grandes Ligas, y una tabla importada la subestimaría en todos los juegos.

Por qué una cadena de Markov y no un histórico de jugadas
---------------------------------------------------------
Para ajustar un modelo contra jugadas reales harían falta play-by-play de las
14 temporadas, y solo existen los de los juegos que el poller capturó. Pero un
juego de béisbol es una máquina de estados pequeña —8 configuraciones de bases
por 3 conteos de out— y las probabilidades de transición salen de tasas de
eventos AGREGADAS, que sí están en `batting_lines`.

Es decir: no hace falta saber qué pasó jugada a jugada, basta con saber con qué
frecuencia ocurre cada cosa. Eso lo dan 45.029 líneas de bateo.

La validación es lo que hace honesto al modelo: si las reglas de avance fueran
malas, las carreras simuladas por juego no darían 4.116. Ver verify_winprob.py.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict, Tuple

# ── Tasas de eventos de LIDOM ────────────────────────────────────────────────
# Proporción de apariciones al plato, medidas sobre las 14 temporadas.
# `recalibrar()` las vuelve a sacar de la base cuando entren más temporadas.
TASAS_LIDOM: Dict[str, float] = {
    "1B":   0.1595,
    "2B":   0.0374,
    "3B":   0.0052,
    "HR":   0.0136,
    "BB":   0.0900,   # incluye los intencionales
    "HBP":  0.0107,
    "SF":   0.0074,
    "SH":   0.0079,
    "GIDP": 0.0186,
    "OUT":  0.6497,   # ponches y demás outs sin avance
}

INNINGS = 9
# Los robos se modelan por aparición, no como evento aparte: 3.623 robados con
# 1.394 atrapados en 152.251 AP. Un corredor en primera intenta robar de vez en
# cuando y tiene éxito el 72% de las veces.
PROB_INTENTO_ROBO = 0.033
PROB_ROBO_EXITOSO = 0.722


# Ventaja de local. Batear de último YA está en el modelo —el local no batea en
# la baja del noveno si va ganando— y eso solo vale unas décimas: sin este
# parámetro la simulación daba 50.2% al inicio del juego. El local de LIDOM gana
# el 54.3% de los 2.005 juegos con marcador. La diferencia es terreno conocido,
# viaje y arbitraje, y se modela como un empujón al ataque del local.
VENTAJA_LOCAL = 0.075


def _tabla(boost: float = 0.0):
    """Tasas acumuladas, con los eventos de embasarse escalados por `boost`.

    Escalar solo lo que no es out y renormalizar mantiene la suma en 1 sin
    tener que tocar cada entrada a mano.
    """
    escaladas = {}
    for ev, p in TASAS_LIDOM.items():
        escaladas[ev] = p * (1.0 + boost) if ev != "OUT" else p
    total = sum(escaladas.values())
    acc, salida = 0.0, []
    for ev, p in escaladas.items():
        acc += p / total
        salida.append((acc, ev))
    return salida


_TABLA_VISITANTE = _tabla(0.0)
_TABLA_LOCAL = _tabla(VENTAJA_LOCAL)


def _muestrea(rng: random.Random, local: bool = False) -> str:
    """Un evento por aparición al plato, según las tasas de la liga."""
    if rng.random() < PROB_EMBASA_POR_ERROR:
        return "ROE"
    u = rng.random()
    for corte, ev in (_TABLA_LOCAL if local else _TABLA_VISITANTE):
        if u < corte:
            return ev
    return "OUT"


# Avance de corredores en un hit. La primera versión del modelo movía al
# corredor de segunda solo hasta tercera en un sencillo, y produjo 2.55
# carreras por juego contra las 4.116 reales: 38% por debajo, con 84% de
# entradas en blanco. El béisbol de verdad es más generoso.
PROB_ANOTA_DESDE_2DA_EN_SENCILLO = 0.60
PROB_1RA_A_3RA_EN_SENCILLO = 0.28
PROB_ANOTA_DESDE_1RA_EN_DOBLE = 0.45
# Wild pitches, passed balls, balks y errores. No están en `batting_lines`
# como evento, pero mueven corredores y sin ellos las carreras no cuadran.
PROB_AVANCE_REGALADO = 0.055
# Embasado por error. No existe como columna en `batting_lines` —la MLB API lo
# cuenta como turno al bate sin hit— pero pone gente en base y sin él las
# carreras se quedan cortas. Valor estándar del béisbol.
PROB_EMBASA_POR_ERROR = 0.018
# Out productivo: el roletazo al segunda que mueve al corredor de segunda a
# tercera. Solo con menos de dos outs; con dos, el out cierra la entrada.
PROB_OUT_PRODUCTIVO = 0.20


def _avanza(bases: Tuple[bool, bool, bool], outs: int, ev: str,
            rng: random.Random) -> Tuple[Tuple[bool, bool, bool], int, int]:
    """Aplica un evento al estado. Devuelve (bases, outs, carreras anotadas).

    Las probabilidades de avance son valores estándar del béisbol, no números
    ajustados a mano hasta que cuadrara: el criterio de aceptación es que la
    simulación reproduzca las 4.116 carreras medidas en la base. Si se tocan,
    hay que volver a correr verify_winprob.py.
    """
    p1, p2, p3 = bases
    r = 0

    if ev == "HR":
        r = 1 + p1 + p2 + p3
        return (False, False, False), outs, r

    if ev == "3B":
        r = p1 + p2 + p3
        return (False, False, True), outs, r

    if ev == "2B":
        r = p2 + p3
        if p1 and rng.random() < PROB_ANOTA_DESDE_1RA_EN_DOBLE:
            return (False, True, False), outs, r + 1
        return (False, True, p1), outs, r

    if ev == "1B":
        r = p3
        nueva_3ra = False
        if p2:
            if rng.random() < PROB_ANOTA_DESDE_2DA_EN_SENCILLO:
                r += 1
            else:
                nueva_3ra = True
        nueva_2da = False
        if p1:
            if rng.random() < PROB_1RA_A_3RA_EN_SENCILLO and not nueva_3ra:
                nueva_3ra = True
            else:
                nueva_2da = True
        return (True, nueva_2da, nueva_3ra), outs, r

    if ev == "ROE":
        # Se trata como sencillo sin avance extra: el bateador llega a primera
        # y los demás se mueven lo forzado.
        r = p3 and p2 and p1
        return (True, p1, p2 or p3), outs, int(r)

    if ev in ("BB", "HBP"):
        # Solo avanza lo forzado: con corredor en tercera y primera vacía, el
        # de tercera se queda.
        if not p1:
            return (True, p2, p3), outs, 0
        if not p2:
            return (True, True, p3), outs, 0
        if not p3:
            return (True, True, True), outs, 0
        return (True, True, True), outs, 1

    if ev == "SF":
        # Solo cuenta como elevado de sacrificio si hay quien anote desde
        # tercera; si no, es un out más.
        if p3 and outs < 2:
            return (p1, p2, False), outs + 1, 1
        return bases, outs + 1, 0

    if ev == "SH":
        if outs < 2 and (p1 or p2):
            return (False, p1, p2), outs + 1, 0
        return bases, outs + 1, 0

    if ev == "GIDP":
        # Hace falta corredor en primera y menos de dos outs; si no, es un out.
        if p1 and outs < 2:
            return (False, p2, p3), outs + 2, 0
        return bases, outs + 1, 0

    # Out corriente. Con menos de dos outs y gente en base, a veces la mueve.
    if outs < 2 and any(bases) and rng.random() < PROB_OUT_PRODUCTIVO:
        b1, b2, b3 = bases
        anota = 0
        if b3:
            anota = 1
            b3 = False
        if b2:
            b3, b2 = True, False
        if b1:
            b2, b1 = True, False
        return (b1, b2, b3), outs + 1, anota
    return bases, outs + 1, 0


def simula_entrada(rng: random.Random, local: bool = False) -> int:
    """Carreras en una media entrada completa, empezando limpia."""
    return simula_resto_entrada((False, False, False), 0, rng, local)


def simula_resto_entrada(bases: Tuple[bool, bool, bool], outs: int,
                         rng: random.Random, local: bool = False) -> int:
    """Carreras desde un estado base-out cualquiera hasta el tercer out."""
    total = 0
    while outs < 3:
        # Intento de robo desde primera, antes de la aparición.
        if bases[0] and not bases[1] and rng.random() < PROB_INTENTO_ROBO:
            if rng.random() < PROB_ROBO_EXITOSO:
                bases = (False, True, bases[2])
            else:
                bases = (False, bases[1], bases[2])
                outs += 1
                if outs >= 3:
                    break
        # Avance regalado: wild pitch, passed ball, balk o error.
        if any(bases) and rng.random() < PROB_AVANCE_REGALADO:
            b1, b2, b3 = bases
            if b3:
                total += 1
                b3 = False
            if b2:
                b3, b2 = True, False
            if b1:
                b2, b1 = True, False
            bases = (b1, b2, b3)
        bases, outs, r = _avanza(bases, outs, _muestrea(rng, local), rng)
        total += r
    return total


@dataclass(frozen=True)
class Estado:
    """El estado de un juego en curso, tal como lo da el linescore de GUMBO."""
    entrada: int                       # 1..9+ (extras permitidas)
    es_alta: bool                      # True = batea el visitante
    outs: int                          # 0..2
    bases: Tuple[bool, bool, bool]     # primera, segunda, tercera
    dif_local: int                     # carreras local menos visitante


def prob_gana_local(est: Estado, rng: random.Random, sims: int = 4000) -> float:
    """Probabilidad de que gane el LOCAL, simulando lo que queda de juego.

    Un empate al terminar el noveno va a entradas extra, y ahí el modelo no
    inventa nada: simula entradas completas hasta que alguien quede arriba.
    """
    gana = 0
    for _ in range(sims):
        dif = est.dif_local
        entrada = est.entrada
        alta = est.es_alta

        # Resto de la media entrada en curso.
        r = simula_resto_entrada(est.bases, est.outs, rng, local=not alta)
        dif += -r if alta else r

        if alta:
            # Falta la baja de esta misma entrada.
            if not (entrada >= INNINGS and dif > 0):
                dif += simula_entrada(rng, local=True)
            alta = True
            entrada += 1
        else:
            entrada += 1

        # Entradas completas restantes del juego reglamentario.
        while entrada <= INNINGS:
            dif -= simula_entrada(rng)
            # El local no batea en la baja del último si ya va arriba.
            if not (entrada >= INNINGS and dif > 0):
                dif += simula_entrada(rng, local=True)
            entrada += 1

        # Extras: media entrada cada uno hasta desempatar.
        while dif == 0:
            dif -= simula_entrada(rng)
            dif += simula_entrada(rng, local=True)

        if dif > 0:
            gana += 1
    return gana / sims


def recalibrar(conn) -> Dict[str, float]:
    """Vuelve a sacar las tasas de `batting_lines`.

    Se deja explícito y no automático: las tasas son una constante del modelo,
    y que cambien solas al ingestar una temporada haría que la misma situación
    diera probabilidades distintas de un día para otro sin que nadie lo decida.
    """
    row = conn.execute(
        """SELECT SUM(plate_appearances) pa, SUM(hits) h, SUM(doubles) d2,
                  SUM(triples) d3, SUM(home_runs) hr, SUM(walks) bb,
                  SUM(hit_by_pitch) hbp, SUM(sacrifice_flies) sf,
                  SUM(sacrifice_bunts) sh, SUM(grounded_into_dp) gidp
           FROM batting_lines"""
    ).fetchone()
    pa = row[0]
    s1 = row[1] - row[2] - row[3] - row[4]
    t = {
        "1B": s1 / pa, "2B": row[2] / pa, "3B": row[3] / pa, "HR": row[4] / pa,
        "BB": row[5] / pa, "HBP": row[6] / pa, "SF": row[7] / pa,
        "SH": row[8] / pa, "GIDP": row[9] / pa,
    }
    t["OUT"] = 1.0 - sum(t.values())
    return t


# ── Caché ────────────────────────────────────────────────────────────────────
# Simular 4.000 juegos por cada sondeo, por cada juego en curso, no es viable:
# el poller pregunta cada diez segundos. Pero el espacio de estados es chico y
# se repite muchísimo — un juego entero toca unos pocos cientos de estados
# distintos— así que memoizar resuelve el problema sin precalcular nada.
#
# La diferencia de carreras se recorta a ±15: con quince arriba en cualquier
# entrada la probabilidad ya es 1.000 y seguir simulando no cambia el número.
_CACHE: Dict[Tuple, float] = {}
TOPE_DIFERENCIA = 15


def prob_gana_local_cached(est: Estado, sims: int = 4000) -> float:
    """Igual que `prob_gana_local`, memoizada y con semilla fija.

    La semilla fija importa para el producto, no para la estadística: sin ella
    el mismo estado daría 61.2% y al siguiente sondeo 60.8%, y el usuario vería
    la barra temblar sin que pasara nada en el juego.
    """
    dif = max(-TOPE_DIFERENCIA, min(TOPE_DIFERENCIA, est.dif_local))
    entrada = min(est.entrada, INNINGS + 3)
    clave = (entrada, est.es_alta, est.outs, est.bases, dif)
    if clave in _CACHE:
        return _CACHE[clave]
    val = prob_gana_local(
        Estado(entrada, est.es_alta, est.outs, est.bases, dif),
        random.Random(hash(clave) & 0xFFFFFFFF),
        sims=sims,
    )
    _CACHE[clave] = val
    return val
