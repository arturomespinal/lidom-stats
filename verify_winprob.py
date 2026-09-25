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

print("\n━━━ el store acumula el recorrido ━━━")
import glob  # noqa: E402
import json  # noqa: E402
from src.live.gumbo import parse_live_feed  # noqa: E402
from src.live.store import LiveStore, MAX_PUNTOS_WP, UMBRAL_WP, WinProbPoint  # noqa: E402

st = LiveStore()
instantaneas = 0
for f in sorted(glob.glob("fixtures/826343_*.json")):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    if not isinstance(d, dict) or not d.get("liveData"):
        continue
    instantaneas += 1
    e = parse_live_feed(d, game_id="826343")
    st.update(826343, d, e)
    if e.status == "final":
        st.drop(826343)

track = st.win_prob_track(826343)
check("acumuló puntos del juego real", len(track) > 4, True)
check("el umbral descarta repetidos", len(track) < instantaneas, True)
print(f"    {len(track)} puntos de {instantaneas} instantáneas")
check("la curva cierra en el resultado real, no en la simulación",
      track[-1]["wp"], 1.0)
check("el último punto lleva el marcador final", (track[-1]["away"], track[-1]["home"]), (3, 7))
check("cada punto trae marcador y entrada",
      all({"inning", "is_top", "away", "home", "wp"} <= set(p) for p in track), True)

# Un cambio de marcador entra aunque la probabilidad se mueva menos que el umbral.
subidas = [abs(track[i]["wp"] - track[i - 1]["wp"]) for i in range(1, len(track))]
check("ningún salto guardado es menor que el umbral, salvo el cierre",
      all(d >= UMBRAL_WP for d in subidas[:-1]), True)
check("el tope está por encima de cualquier juego real", MAX_PUNTOS_WP > len(track) * 10, True)

# La etiqueta de cada punto la compone el backend con ordinal_es(): la franja
# de la web la pinta en el tooltip tal cual. Si alguien la arma en el cliente,
# vuelve el "Baja del 3rd".
check("cada punto trae su etiqueta en español",
      all(p["label"].startswith(("Alta del ", "Baja del ")) for p in track), True)
check("la etiqueta usa el ordinal en español, no el de la MLB",
      WinProbPoint(3, False, 0, 3, 0.9, 0).as_dict()["label"], "Baja del 3ro")
check("también en entradas extra",
      WinProbPoint(11, True, 4, 4, 0.5, 0).as_dict()["label"], "Alta del 11mo")

# El titular lo compone el backend para los dos clientes. Sobre el juego real:
from src.live.store import titular_recorrido  # noqa: E402
titular = titular_recorrido(track, "EST", "TOR")
print(f"    titular del juego real: {titular}")
check("el titular nombra al ganador por su nombre corto",
      titular.startswith("Estrellas "), True)
check("sin remontada dice el piso del ganador", "nunca estuvo por debajo" in titular, True)

# Remontada: el visitante gana tras estar abajo.
remontada = [{"wp": .60, "home": 0, "away": 0}, {"wp": .77, "home": 3, "away": 0},
             {"wp": 0.0, "home": 3, "away": 4}]
check("una remontada se cuenta como tal",
      titular_recorrido(remontada, "LIC", "AGU"), "Águilas llegó a estar en 23% y remontó.")
check("un juego suspendido empatado no tiene titular",
      titular_recorrido([{"wp": .5, "home": 2, "away": 2}] * 2, "LIC", "AGU"), None)
check("sin recorrido no hay titular", titular_recorrido([], "LIC", "AGU"), None)
# 0.625 → 62.5, un medio EXACTO en coma flotante: round() de Python da 62
# (redondeo al par) y Math.round del cliente, 63. El titular tiene que decir
# lo mismo que la leyenda que pinta el cliente. (Con 0.565 no se ve: en coma
# flotante vale 56.4999… y los dos dan 56.)
check("el porcentaje redondea como Math.round, no como round()",
      titular_recorrido([{"wp": .625, "home": 0, "away": 0},
                         {"wp": 1.0, "home": 1, "away": 0}], "LIC", "AGU"),
      "Licey nunca estuvo por debajo del 63%.")
# El par siempre suma 100: el visitante es el complemento del local. Con
# wp = 0.875 (87.5 exacto) el local es 88 y el visitante 12 — no 13, que es
# lo que daría redondear 12.5 por su lado.
check("un ganador visitante usa el complemento, como la tabla del cliente",
      titular_recorrido([{"wp": .875, "home": 0, "away": 0},
                         {"wp": 0.0, "home": 0, "away": 1}], "LIC", "AGU"),
      "Águilas llegó a estar en 12% y remontó.")

print()
if fallos:
    print(f"❌ {len(fallos)} fallaron:")
    for f in fallos:
        print(f"   - {f}")
    sys.exit(1)
print(f"✅ Todas las comprobaciones pasaron ({n_ok})")
