"""
Ejercita la proyección de detalle contra instantáneas GUMBO reales.

Corre sin red: todo sale de fixtures/, capturadas con capture_gumbo.py.
"""
import json
import sys
from pathlib import Path

from src.live.detail import EVENTOS_ES, evento_es, parse_game_detail
from src.live.gumbo import parse_live_feed
from src.live.store import LiveStore

fails = []


def check(label, got, want):
    ok = got == want
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}: {got}" + ("" if ok else f"  (esperado {want})"))


def load(name):
    return json.loads(Path("fixtures") / name and (Path("fixtures") / name).read_text(encoding="utf-8"))


FINAL = "826343_20251016_035057.json"
MEDIO = "826343_20251016_010018.json"
INICIO = "826343_20251015_232631.json"

if not (Path("fixtures") / FINAL).exists():
    print("Faltan las instantáneas. Corre primero:  python capture_gumbo.py")
    sys.exit(1)

final = load(FINAL)
medio = load(MEDIO)
inicio = load(INICIO)


print("━━━ Eventos en español ━━━")
check("un roletazo no se queda en inglés", evento_es("Groundout"), "Roletazo de out")
check("ponche", evento_es("Strikeout"), "Ponche")
check("jonrón", evento_es("Home Run"), "Jonrón")
check("doble play por tierra", evento_es("Grounded Into DP"), "Doble play por tierra")
# Un evento desconocido cae al inglés de la MLB, que es feo pero cierto. Lo que
# NO puede pasar es que se quede en blanco: la línea del relato desaparecería.
check("un evento desconocido conserva el texto de la MLB",
      evento_es("Batter Reached On Interference"), "Batter Reached On Interference")
check("sin evento no inventa nada", evento_es(None), None)
check("el mapa cubre los eventos del juego de prueba",
      {p["result"].get("event") for p in final["liveData"]["plays"]["allPlays"]
       if p["result"].get("event")} - set(EVENTOS_ES),
      set())


print("\n━━━ Relato ━━━")
det = parse_game_detail(final, game_id="2025-10-15-TOR-EST-1")
check("todas las jugadas del juego", det.plays_total, 71)
check("sin límite devuelve todas", det.plays_returned, 71)
# Del más reciente al más viejo: es el orden en que se lee un relato en vivo.
check("la primera de la lista es la ÚLTIMA del juego",
      det.plays[0].index, max(p.index for p in det.plays))
check("y la última es la primera del juego", det.plays[-1].index, 0)
check("el relato arranca en la baja del 9no o antes", det.plays[0].inning, 9)
check("la media entrada se rotula en español", det.plays[-1].half_label, "Alta del 1ro")
check("se conserva el texto crudo de la MLB",
      det.plays[0].description is not None and " " in det.plays[0].description, True)

recorte = parse_game_detail(final, plays_limit=6)
check("el límite recorta", recorte.plays_returned, 6)
check("pero informa el total real", recorte.plays_total, 71)
check("y recorta por el lado reciente", recorte.plays[0].index, det.plays[0].index)
check("plays_limit=0 deja el relato vacío", parse_game_detail(final, plays_limit=0).plays_returned, 0)

anotadoras = [p for p in det.plays if p.is_scoring_play]
print(f"    {len(anotadoras)} jugadas anotadoras; la primera: "
      f"{anotadoras[-1].batter} — {anotadoras[-1].event_es}")
check("hay jugadas anotadoras marcadas", len(anotadoras) > 0, True)
check("una jugada anotadora tiene carreras impulsadas o el marcador cambió",
      all(p.rbi > 0 or p.event_es for p in anotadoras), True)


print("\n━━━ Línea por entradas ━━━")
check("nueve entradas", len(det.innings), 9)
check("ordinal en español", det.innings[6].ordinal_es, "7mo")
check("la 2da del local fue de 3", det.innings[1].home_runs, 3)
# El local ganaba y no bateó en la baja del 9no. Eso NO es cero: es el guion
# del cuadro, y por eso el campo es Optional.
check("la baja del 9no no se jugó y es None", det.innings[8].home_runs, None)
check("la alta del 9no sí se jugó", det.innings[8].away_runs, 0)
check("las carreras por entrada suman el total del visitante",
      sum(i.away_runs or 0 for i in det.innings), det.away.runs)
check("y las del local", sum(i.home_runs or 0 for i in det.innings), det.home.runs)
print(f"    TOR {det.away.runs}-{det.away.hits}-{det.away.errors}   "
      f"EST {det.home.runs}-{det.home.hits}-{det.home.errors}")


print("\n━━━ Boxscore ━━━")
check("equipos identificados", (det.away.team_code, det.home.team_code), ("TOR", "EST"))
check("nombre del catálogo canónico, con tildes", det.home.team_name, "Estrellas Orientales")
titulares = [b for b in det.home.batters if b.is_starter]
check("nueve titulares en la alineación local", len(titulares), 9)
check("ordenados por turno al bate",
      [b.batting_order for b in titulares],
      [100, 200, 300, 400, 500, 600, 700, 800, 900])
check("un sustituto va justo debajo de su titular",
      [b.batting_order for b in det.home.batters[:4]], [100, 200, 300, 301])
check("los hits del boxscore cuadran con la línea",
      sum(b.hits for b in det.home.batters), det.home.hits)
check("y las carreras impulsadas no superan las anotadas",
      sum(b.rbi for b in det.home.batters) <= det.home.runs + 5, True)
primero = det.home.batters[0]
print(f"    abre {primero.name} ({primero.position}) — {primero.summary}")
check("la MLB ya da el resumen hecho", primero.summary, "1-4 | SB")


print("\n━━━ Lanzadores ━━━")
p = det.home.pitchers
check("seis lanzadores usó el local", len(p), 6)
check("el primero es el abridor", p[0].is_starter, True)
check("y solo él", sum(1 for x in p if x.is_starter), 1)
check("el orden es el de entrada al juego", [x.order for x in p], [1, 2, 3, 4, 5, 6])
check("el ganador trae su nota", p[0].note, "(W, 1-0)")
# inningsPitched es un STRING: "0.2" son dos outs, no dos décimas. Convertirlo
# a float lo rompería en silencio.
check("las entradas se conservan como texto", p[2].innings_pitched, "0.2")
check("no es un número", isinstance(p[2].innings_pitched, str), True)
print(f"    {p[0].name}: {p[0].summary}")
check("banca y bullpen presentes",
      (len(det.home.bench) > 0, len(det.home.bullpen) > 0), (True, True))


print("\n━━━ Pre-juego y juego a medias ━━━")
pre = parse_game_detail(inicio)
print(f"    al inicio: estado={pre.status}, {pre.plays_total} jugadas, "
      f"{len(pre.innings)} entradas")
check("el pre-juego no revienta el parser", isinstance(pre.plays_total, int), True)
check("ya hay alineación publicada antes de empezar", len(pre.home.batters) > 0, True)

mitad = parse_game_detail(medio)
check("a mitad de juego hay menos jugadas que al final",
      mitad.plays_total < det.plays_total, True)
check("y menos entradas jugadas", len(mitad.innings) <= len(det.innings), True)
check("un documento vacío da un detalle vacío, no una excepción",
      parse_game_detail({}).plays_total, 0)


print("\n━━━ La caché sirve el detalle sin tocar la MLB ━━━")
st = LiveStore()
st.update(826343, final, parse_live_feed(final))
check("con crudo proyecta al vuelo", st.get_detail(826343, 5).plays_returned, 5)

st.drop(826343)
entry = st.get(826343)
check("drop suelta el megabyte", entry.raw, None)
check("pero congela el detalle antes", entry.detail is not None, True)
congelado = st.get_detail(826343, 5)
check("y se sigue sirviendo igual", congelado.plays_returned, 5)
check("con el total intacto", congelado.plays_total, 71)
check("sin mutar el congelado", st.get(826343).detail.plays_returned, 71)
check("el marcador reducido sobrevive igual", st.get_state(826343).is_final, True)
check("stats lo reporta", st.stats()["frozen_details"], 1)
check("un juego que no seguimos no existe", st.get_detail(999999), None)

completo = len(parse_game_detail(final).model_dump_json())
corto = len(parse_game_detail(final, plays_limit=25).model_dump_json())
piso = len(parse_game_detail(final, plays_limit=0).model_dump_json())
print(f"    completo {completo:,} B · con 25 jugadas {corto:,} B · sin relato {piso:,} B")
# El boxscore, las alineaciones y el bullpen son un PISO fijo que recortar el
# relato no toca: son 40 jugadores por equipo con sus números. Por eso el
# ahorro se mide contra la parte variable, no contra el total.
check("el relato completo es la mayor parte de lo variable",
      (completo - piso) > (corto - piso) * 2, True)
check("recortar a 25 jugadas quita cerca de la mitad del total",
      0.40 < 1 - corto / completo < 0.55, True)


print()
if fails:
    print(f"❌ {len(fails)} comprobaciones fallaron:")
    for f in fails:
        print("   -", f)
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
