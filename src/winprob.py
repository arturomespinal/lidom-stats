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


# ── El cálculo exacto ────────────────────────────────────────────────────────
# El modelo es una cadena de Markov con todas sus probabilidades escritas:
# robos, avances regalados, el evento de cada aparición y las ramas de cada
# avance. No hace falta simularlo: se puede calcular.
#
# 1. Para cada una de las 24 situaciones de bases y outs, la distribución de
#    carreras de lo que queda de la media entrada (una vez, para el visitante
#    y para el local). Dentro de un mismo número de outs hay ciclos —un boleto
#    deja los mismos outs— así que se resuelve por iteración de valor hasta
#    que no cambia nada.
# 2. Para una situación de juego, se recorre lo que falta media entrada por
#    media entrada sobre la DISTRIBUCIÓN de la diferencia de carreras, con las
#    mismas reglas que la simulación (el local no batea la baja del último si
#    va arriba; los extras se repiten hasta desempatar).
#
# La simulación de 4.000 juegos tardaba ~0,2 s por situación nueva y tenía
# ruido de ±0,8 puntos; esto tarda milisegundos y da el valor exacto del
# mismo modelo. La simulación se queda: es la que se valida contra las
# carreras reales (verify_winprob.py), y la suite exige que las dos coincidan.

_MAX_CARRERAS = 25          # por media entrada; más allá la masa es despreciable
_BASES = [(a, b, c) for a in (False, True) for b in (False, True) for c in (False, True)]


def _prob_eventos(local: bool) -> list:
    """(probabilidad, evento) de una aparición: el embasado por error primero,
    después la tabla, igual que `_muestrea`."""
    tabla = _TABLA_LOCAL if local else _TABLA_VISITANTE
    out, previo = [(PROB_EMBASA_POR_ERROR, "ROE")], 0.0
    for corte, ev in tabla:
        out.append(((1 - PROB_EMBASA_POR_ERROR) * (corte - previo), ev))
        previo = corte
    return out


def _ramas_avance(bases, outs, ev) -> list:
    """Las ramas de `_avanza`, con su probabilidad: (p, bases, outs, carreras)."""
    p1, p2, p3 = bases
    if ev == "2B" and p1:
        r = p2 + p3
        return [(PROB_ANOTA_DESDE_1RA_EN_DOBLE, (False, True, False), outs, r + 1),
                (1 - PROB_ANOTA_DESDE_1RA_EN_DOBLE, (False, True, True), outs, r)]
    if ev == "1B" and (p1 or p2):
        ramas = []
        for p_2da, anota_2da in (((PROB_ANOTA_DESDE_2DA_EN_SENCILLO, True),
                                  (1 - PROB_ANOTA_DESDE_2DA_EN_SENCILLO, False)) if p2 else ((1.0, False),)):
            r = p3 + anota_2da
            nueva_3ra = p2 and not anota_2da
            if p1:
                if nueva_3ra:
                    ramas.append((p_2da, (True, True, True), outs, r))
                else:
                    ramas.append((p_2da * PROB_1RA_A_3RA_EN_SENCILLO, (True, False, True), outs, r))
                    ramas.append((p_2da * (1 - PROB_1RA_A_3RA_EN_SENCILLO), (True, True, False), outs, r))
            else:
                ramas.append((p_2da, (True, False, nueva_3ra), outs, r))
        return ramas
    if ev == "OUT" and outs < 2 and any(bases):
        b1, b2, b3 = bases
        return [(PROB_OUT_PRODUCTIVO, (False, b1, b2), outs + 1, int(b3)),
                (1 - PROB_OUT_PRODUCTIVO, bases, outs + 1, 0)]
    # El resto no tiene azar: se reusa `_avanza` con un generador que nunca
    # se consulta.
    b, o, r = _avanza(bases, outs, ev, None)  # type: ignore[arg-type]
    return [(1.0, b, o, int(r))]


def _transiciones(bases, outs, local: bool) -> Dict[Tuple, float]:
    """Un paso del bucle de `simula_resto_entrada` —robo, avance regalado y
    aparición— como {(bases, outs, carreras): probabilidad}. Outs ≥ 3 es el
    final de la media entrada."""
    pasos = [(1.0, bases, outs, 0)]
    if bases[0] and not bases[1]:
        intento = PROB_INTENTO_ROBO
        pasos = [((1 - intento), bases, outs, 0),
                 (intento * PROB_ROBO_EXITOSO, (False, True, bases[2]), outs, 0),
                 (intento * (1 - PROB_ROBO_EXITOSO), (False, False, bases[2]), outs + 1, 0)]
    tras_regalo = []
    for p, b, o, r in pasos:
        if o >= 3:
            tras_regalo.append((p, b, o, r))
            continue
        if any(b):
            b1, b2, b3 = b
            tras_regalo.append((p * PROB_AVANCE_REGALADO, (False, b1, b2), o, r + int(b3)))
            tras_regalo.append((p * (1 - PROB_AVANCE_REGALADO), b, o, r))
        else:
            tras_regalo.append((p, b, o, r))
    final: Dict[Tuple, float] = {}
    for p, b, o, r in tras_regalo:
        if o >= 3:
            clave = ((False, False, False), 3, r)
            final[clave] = final.get(clave, 0.0) + p
            continue
        for pe, ev in _prob_eventos(local):
            for pa, b2, o2, r2 in _ramas_avance(b, o, ev):
                clave = (b2, min(o2, 3), r + r2)
                final[clave] = final.get(clave, 0.0) + p * pe * pa
    return final


_DIST_ENTRADA: Dict[bool, Dict[Tuple, list]] = {}


def distribucion_carreras(bases, outs: int, local: bool) -> list:
    """P(carreras = k) de lo que queda de la media entrada, k = 0.._MAX_CARRERAS."""
    if local not in _DIST_ENTRADA:
        estados = [(b, o) for b in _BASES for o in range(3)]
        trans = {s: _transiciones(s[0], s[1], local) for s in estados}
        dist = {s: [0.0] * (_MAX_CARRERAS + 1) for s in estados}
        for _ in range(400):
            cambio = 0.0
            for s in estados:
                nuevo = [0.0] * (_MAX_CARRERAS + 1)
                for (b2, o2, r), p in trans[s].items():
                    if r > _MAX_CARRERAS:
                        continue
                    if o2 >= 3:
                        nuevo[r] += p
                    else:
                        resto = dist[(b2, o2)]
                        for k in range(_MAX_CARRERAS + 1 - r):
                            nuevo[k + r] += p * resto[k]
                cambio = max(cambio, max(abs(x - y) for x, y in zip(nuevo, dist[s])))
                dist[s] = nuevo
            if cambio < 1e-14:
                break
        _DIST_ENTRADA[local] = dist
    return _DIST_ENTRADA[local][(tuple(bases), outs)]


def _media_entrada(dist: Dict[int, float], carreras: list, signo: int,
                   salta=lambda d: False) -> Dict[int, float]:
    """Suma (o resta) las carreras de una media entrada a la distribución de
    la diferencia. `salta(d)`: con esa diferencia esta media entrada no se
    juega (el local que ya ganó)."""
    nueva: Dict[int, float] = {}
    for d, p in dist.items():
        if salta(d):
            nueva[d] = nueva.get(d, 0.0) + p
            continue
        for k, pk in enumerate(carreras):
            if pk:
                nueva[d + signo * k] = nueva.get(d + signo * k, 0.0) + p * pk
    return {d: p for d, p in nueva.items() if p > 1e-16}


def prob_gana_local_exacta(est: Estado) -> float:
    """Probabilidad de que gane el LOCAL, sin simular. Mismas reglas que
    `prob_gana_local`."""
    limpia_v = distribucion_carreras((False, False, False), 0, local=False)
    limpia_l = distribucion_carreras((False, False, False), 0, local=True)
    dist = {est.dif_local: 1.0}
    entrada = est.entrada
    resto = distribucion_carreras(est.bases, est.outs, local=not est.es_alta)
    dist = _media_entrada(dist, resto, -1 if est.es_alta else +1)
    if est.es_alta:
        e = entrada
        dist = _media_entrada(dist, limpia_l, +1, salta=lambda d: e >= INNINGS and d > 0)
    entrada += 1
    while entrada <= INNINGS:
        dist = _media_entrada(dist, limpia_v, -1)
        e = entrada
        dist = _media_entrada(dist, limpia_l, +1, salta=lambda d: e >= INNINGS and d > 0)
        entrada += 1
    # Extras: una entrada completa cada vez, hasta desempatar. Empatados al
    # empezar una, el local gana con P(L > V) / (1 − P(L = V)).
    p_mas = sum(pv * pl for v, pv in enumerate(limpia_v) for l, pl in enumerate(limpia_l) if l > v)
    p_igual = sum(pv * limpia_l[v] for v, pv in enumerate(limpia_v))
    extra = p_mas / (1 - p_igual)
    return sum(p for d, p in dist.items() if d > 0) + dist.get(0, 0.0) * extra


# ── Caché ────────────────────────────────────────────────────────────────────
# El poller pregunta cada diez segundos por cada juego en curso, y un juego
# entero toca unos pocos cientos de situaciones distintas: memoizar evita
# recalcular la misma.
#
# La diferencia de carreras se recorta a ±15: con quince arriba en cualquier
# entrada la probabilidad ya es 1.000.
_CACHE: Dict[Tuple, float] = {}
TOPE_DIFERENCIA = 15


def prob_gana_local_cached(est: Estado, sims: int = 4000) -> float:
    """La probabilidad de que gane el local, exacta y memoizada.

    Antes simulaba `sims` juegos con semilla fija (la semilla era para que la
    barra no temblara entre sondeos); el cálculo exacto ya no tiene ruido.
    `sims` se conserva para no romper a quien lo pase y no se usa.
    """
    dif = max(-TOPE_DIFERENCIA, min(TOPE_DIFERENCIA, est.dif_local))
    entrada = min(est.entrada, INNINGS + 3)
    clave = (entrada, est.es_alta, est.outs, est.bases, dif)
    if clave in _CACHE:
        return _CACHE[clave]
    val = prob_gana_local_exacta(Estado(entrada, est.es_alta, est.outs, est.bases, dif))
    _CACHE[clave] = val
    return val
