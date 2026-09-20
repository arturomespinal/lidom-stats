"""Verificación del modelo de probabilidad de ganar.

Corre sin red. El criterio no es "el código no revienta" sino "el modelo
reproduce el béisbol que hay en la base": si alguien toca una probabilidad de
avance, esto se entera.
"""
import random
import sqlite3
import sys
from collections import Counter

sys.path.insert(0, ".")
from src.winprob import (  # noqa: E402
    Estado, INNINGS, prob_gana_local, prob_gana_local_cached, simula_entrada,
)

fallos = []
n_ok = 0


def check(nombre, obtenido, esperado, tol=None):
    global n_ok
    ok = abs(obtenido - esperado) <= tol if tol is not None else obtenido == esperado
    if ok:
        n_ok += 1
        print(f"  ✓ {nombre}: {obtenido}")
    else:
        fallos.append(nombre)
        print(f"  ✗ {nombre}: {obtenido} (esperaba {esperado}{f' ±{tol}' if tol else ''})")


con = sqlite3.connect("data/lidom_stats.db")
REAL_CPJ, REAL_LOCAL = 4.116, 0.543

print("━━━ el ambiente de carreras se reproduce ━━━")
rng = random.Random(7)
N = 200_000
runs = [simula_entrada(rng) for _ in range(N)]
cpj = sum(runs) / N * INNINGS
check("carreras por equipo por juego", round(cpj, 3), REAL_CPJ, tol=0.15)
check("proporción de entradas en blanco", round(runs.count(0) / N, 3), 0.75, tol=0.04)

print("\n━━━ la distribución completa cuadra, y a eso no se ajustó nada ━━━")
real = Counter()
for h, a in con.execute(
    "SELECT home_score, away_score FROM games WHERE status='final' AND home_score IS NOT NULL"
):
    real[h] += 1
    real[a] += 1
nr = sum(real.values())
rng = random.Random(11)
M = 40_000
sim = Counter(sum(simula_entrada(rng) for _ in range(INNINGS)) for _ in range(M))
err = sum(abs(real.get(k, 0) / nr * 100 - sim.get(k, 0) / M * 100) for k in range(0, 20))
check("error total de la distribución (puntos sobre 200)", round(err, 1), 0.0, tol=12.0)

print("\n━━━ la ventaja de local sale de los datos, no del aire ━━━")
loc, tot = con.execute(
    "SELECT SUM(home_score>away_score), COUNT(*) FROM games "
    "WHERE status='final' AND home_score IS NOT NULL"
).fetchone()
check("el local gana en la base", round(loc / tot, 3), REAL_LOCAL, tol=0.002)
inicio = prob_gana_local_cached(Estado(1, True, 0, (False, False, False), 0), sims=20_000)
check("el modelo lo reproduce al inicio del juego", round(inicio, 3), REAL_LOCAL, tol=0.015)

print("\n━━━ las reglas del béisbol, no de la estadística ━━━")
walkoff = prob_gana_local_cached(Estado(9, False, 0, (False, False, False), 1))
check("local arriba en la baja del 9no: el juego terminó", round(walkoff, 3), 1.0)
perdido = prob_gana_local_cached(Estado(9, True, 2, (False, False, False), -10))
check("abajo 10 con dos outs en el 9no", round(perdido, 3), 0.0, tol=0.005)

print("\n━━━ monotonía: más ventaja nunca puede dar menos probabilidad ━━━")
previa = -1.0
for d in range(-4, 5):
    p = prob_gana_local_cached(Estado(7, True, 1, (False, False, False), d))
    if p < previa - 0.005:
        fallos.append(f"monotonía rota en dif={d}")
        print(f"  ✗ dif {d:+d}: {p:.3f} bajó respecto a {previa:.3f}")
    else:
        n_ok += 1
        print(f"  ✓ dif {d:+d}: {p:.3f}")
    previa = p

print("\n━━━ los corredores valen algo ━━━")
sin = prob_gana_local_cached(Estado(9, False, 1, (False, False, False), -1))
con_ = prob_gana_local_cached(Estado(9, False, 1, (True, True, True), -1))
check("bases llenas mejoran sobre bases limpias", con_ > sin + 0.15, True)
print(f"    limpias {sin:.3f} → llenas {con_:.3f}")

print("\n━━━ el mismo estado da el mismo número ━━━")
a = prob_gana_local_cached(Estado(5, True, 1, (True, False, False), 2))
b = prob_gana_local_cached(Estado(5, True, 1, (True, False, False), 2))
check("la caché no deja temblar la barra", a, b)

print()
if fallos:
    print(f"❌ {len(fallos)} fallaron:")
    for f in fallos:
        print(f"   - {f}")
    sys.exit(1)
print(f"✅ Todas las comprobaciones pasaron ({n_ok})")
