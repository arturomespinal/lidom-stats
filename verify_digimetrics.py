"""El scraper de DIGIMETRICS (estadisticas.lidom.com), sin red.

Cinco partes:
1. El parser contra páginas REALES guardadas en verify_datos/digimetrics/
   (bajadas el 30-sep-2026, byte a byte). Las cifras esperadas no salen de
   nuestro parser: se sumaron en el navegador, sobre el DOM de la misma página,
   con otro código. Si las dos cuentas coinciden, el parser lee bien.
2. Las defensas del parser: columnas cruzadas, columnas que faltan, innings
   imposibles, filas repetidas.
3. El cliente con un servidor falso (httpx.MockTransport): POST, parámetros,
   caché, reintentos, tope de tamaño, modo sin red.
4. La ingesta de una temporada de punta a punta con ese servidor falso, en una
   base temporal: qué se pide, qué se guarda, idempotencia, y que una segunda
   corrida no le pide nada al servidor.
5. El cruce con el esquema de juego, sobre una base sintética.

Y dos que solo corren si hay datos reales:
6. La caché (data/raw/digimetrics, la deja `python main.py ingest-historia`):
   parsea TODAS las páginas guardadas y exige que ninguna tenga tasas que no
   cuadren.
7. La capa histórica cargada en data/lidom_stats.db: sus temporadas, el
   balance de ganados y perdidos, y el cruce con la MLB API fijado exacto.
"""
import json
import os
import re
import sys
import tempfile
import time
from datetime import date
from pathlib import Path

import httpx

from src.clients.digimetrics import (
    DigimetricsClient,
    DigimetricsError,
    PaginaDemasiadoPesada,
    SinCache,
    nombre_en_cache,
)
from src.scrapers.digimetrics import (
    FormatoInesperado,
    outs_de_innings,
    parse_bateo_equipo,
    parse_etapas,
    parse_pitcheo_equipo,
)

DATOS = Path("verify_datos/digimetrics")
fails: list[str] = []


def check(label, got, want):
    ok = got == want
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}: {got}" + ("" if ok else f"  (esperado {want})"))


def lanza(fn, excepcion) -> bool:
    try:
        fn()
        return False
    except excepcion:
        return True


def leer(nombre: str) -> str:
    return (DATOS / nombre).read_text(encoding="utf-8")


BATEO_1990 = leer("bateo_1990_SR_01.html")
PITCHEO_1990 = leer("lanzamiento_1990_SR_01.html")
BATEO_VACIO = leer("bateo_1951_SR_04.html")
# Una página de pitcheo sin filas: la real con el cuerpo de la tabla vaciado.
PITCHEO_VACIO = re.sub(r"<tbody>.*?</tbody>", "<tbody>\r\n        </tbody>", PITCHEO_1990, flags=re.S)
ETAPAS_1990 = (DATOS / "etapas_1990.json").read_bytes()
ETAPAS_1961 = (DATOS / "etapas_1961.json").read_bytes()


def suma(filas, campo):
    return sum(f[campo] or 0 for f in filas)


print("━━━ 1. El parser contra páginas reales (Águilas, serie regular 1990-91) ━━━")
b = parse_bateo_equipo(BATEO_1990)
check("27 bateadores", len(b.filas), 27)
check("ninguna tasa descuadrada", b.discrepancias, [])
check("sin avisos", b.avisos, [])
# Sumas hechas en el navegador sobre el DOM de la página (30-sep-2026).
check("totales de bateo = los del navegador",
      {k: suma(b.filas, c) for k, c in [("G", "games"), ("AB", "at_bats"), ("R", "runs"), ("H", "hits"),
                                          ("2B", "doubles"), ("3B", "triples"), ("HR", "home_runs"),
                                          ("RBI", "rbi"), ("BB", "walks"), ("IBB", "intentional_walks"),
                                          ("SO", "strikeouts"), ("SB", "stolen_bases"), ("CS", "caught_stealing"),
                                          ("HBP", "hit_by_pitch"), ("SF", "sacrifice_flies"),
                                          ("SH", "sacrifice_bunts"), ("DP", "grounded_into_dp")]},
      {"G": 527, "AB": 1616, "R": 191, "H": 400, "2B": 53, "3B": 14, "HR": 12, "RBI": 151, "BB": 176,
       "IBB": 16, "SO": 233, "SB": 57, "CS": 22, "HBP": 13, "SF": 14, "SH": 19, "DP": 41})
check("primera fila: Domingo Ramos, con su id de la fuente",
      (b.filas[0]["id_miembro"], b.filas[0]["nombre"], b.filas[0]["at_bats"], b.filas[0]["hits"]),
      (5655, "DOMINGO RAMOS", 31, 10))
check("el LOB en blanco es None, no 0 (no se registraba)", {f["left_on_base"] for f in b.filas}, {None})
check("las tasas no se guardan", "AVG" in b.filas[0] or "batting_avg" in b.filas[0], False)

p = parse_pitcheo_equipo(PITCHEO_1990)
check("21 lanzadores", len(p.filas), 21)
check("ninguna tasa descuadrada (incluido el 20.26 de 1.1 IP)", p.discrepancias, [])
check("el nombre del equipo esa temporada", p.nombre_equipo, "Aguilas Cibaeñas")
check("totales de pitcheo = los del navegador",
      {k: suma(p.filas, c) for k, c in [("W", "wins"), ("L", "losses"), ("G", "games"), ("GS", "games_started"),
                                          ("GF", "games_finished"), ("GC", "complete_games"), ("SV", "saves"),
                                          ("outs", "outs"), ("H", "hits_allowed"), ("R", "runs_allowed"),
                                          ("ER", "earned_runs"), ("HR", "home_runs_allowed"),
                                          ("BB", "walks_allowed"), ("SO", "strikeouts"), ("WP", "wild_pitches"),
                                          ("BK", "balks")]},
      {"W": 24, "L": 24, "G": 170, "GS": 48, "GF": 47, "GC": 1, "SV": 12, "outs": 1286, "H": 399,
       "R": 190, "ER": 151, "HR": 18, "BB": 160, "SO": 277, "WP": 16, "BK": 1})
jeff = next(f for f in p.filas if f["nombre"] == "JEFF MUTIS")
check("44.1 IP son 133 outs (Jeff Mutis)", jeff["outs"], 133)
check("una página sin filas (el 04 no existía en 1951)", len(parse_bateo_equipo(BATEO_VACIO).filas), 0)
check("pitcheo sin filas", (len(parse_pitcheo_equipo(PITCHEO_VACIO).filas), parse_pitcheo_equipo(PITCHEO_VACIO).nombre_equipo), (0, None))
check("etapas de 1990", parse_etapas(json.loads(ETAPAS_1990)),
      [("SR", "Serie Regular"), ("RR", "Serie Semifinal"), ("SF", "Serie Final")])
check("1961 no se jugó: sin etapas", parse_etapas(json.loads(ETAPAS_1961)), [])

print("\n━━━ 2. Las defensas del parser ━━━")
# Se intercambian los TEXTOS de los encabezados AB y H: la tabla sigue
# pareciendo válida, pero cada columna se lee con el nombre de la otra.
cruzada = re.sub(r'(<th title="At Bat"[^>]*>)\s*AB\s*(</th>)', r"\1 @@H@@ \2", BATEO_1990, count=1)
cruzada = re.sub(r'(<th title="Hits"[^>]*>)\s*H\s*(</th>)', r"\1 AB \2", cruzada, count=1)
cruzada = cruzada.replace("@@H@@", "H", 1)
check("la sustitución de prueba cambió la página", cruzada != BATEO_1990, True)
check("columnas H y AB cruzadas: las tasas lo delatan", len(parse_bateo_equipo(cruzada).discrepancias) > 10, True)
sin_hr = re.sub(r'<th title="Home runs"[^>]*>\s*HR\s*</th>', "", BATEO_1990)
check("falta una columna: FormatoInesperado", lanza(lambda: parse_bateo_equipo(sin_hr), FormatoInesperado), True)
check("una página sin tabla de jugadores: FormatoInesperado",
      lanza(lambda: parse_bateo_equipo("<html><table><tr><td>x</td></tr></table></html>"), FormatoInesperado), True)
check("innings '7.5' no existen: FormatoInesperado", lanza(lambda: outs_de_innings("7.5"), FormatoInesperado), True)
check("innings '7.2' son 23 outs", outs_de_innings("7.2"), 23)
fila1 = re.search(r"<tr>\s*<td>\s*<img.*?</tr>", BATEO_1990, flags=re.S).group(0)
check("un conteo que no es número: FormatoInesperado",
      lanza(lambda: parse_bateo_equipo(BATEO_1990.replace(fila1, re.sub(r">(\s*)31(\s*)<", r">\g<1>3l\g<2><", fila1, count=1), 1)), FormatoInesperado), True)
repetida = parse_bateo_equipo(BATEO_1990.replace(fila1, fila1 + fila1, 1))
ramos = next(f for f in repetida.filas if f["id_miembro"] == 5655)
check("fila repetida: se suma y se avisa", (len(repetida.filas), ramos["at_bats"], any("repetido" in a for a in repetida.avisos)),
      (27, 62, True))
corta = BATEO_1990.replace(fila1, re.sub(r"<td class=\"text-center\">\s*\.705\s*</td>", "", fila1), 1)
check("fila con una celda de menos: FormatoInesperado", lanza(lambda: parse_bateo_equipo(corta), FormatoInesperado), True)

print("\n━━━ 3. El cliente contra un servidor falso ━━━")
check("nombre de caché estable aunque cambie el orden",
      nombre_en_cache("/Equipo/EquipoBateo", {"b": "1", "a": "2"}) == nombre_en_cache("/Equipo/EquipoBateo", {"a": "2", "b": "1"}), True)
check("nombre de caché legible",
      nombre_en_cache("/Equipo/EquipoBateo", {"idTemporada": "1990", "manoLanza": ""}),
      "Equipo_EquipoBateo/idTemporada-1990_manoLanza-.gz")

# Los reintentos esperan 2-20 s y el cliente espera su turno: en la prueba no.
_sleep = time.sleep
time.sleep = lambda s: None
try:
    vistos = []
    respuestas = iter([httpx.Response(503), httpx.Response(503), httpx.Response(200, content=b"<ok/>")])

    def servidor(req: httpx.Request):
        vistos.append(req)
        return next(respuestas)

    with tempfile.TemporaryDirectory() as tmp:
        dm = DigimetricsClient(cache_dir=tmp, intervalo=0,
                               http=httpx.Client(base_url="http://x", transport=httpx.MockTransport(servidor),
                                                 headers={"User-Agent": "LIDOM-Stats/0.1 prueba"}))
        html = dm.post_html("/Equipo/EquipoBateo", {"idTemporada": 1990, "idEtapa": "SR", "idEquipo": "01", "manoLanza": ""})
        check("dos 503 y luego 200: se reintenta y sale bien", (html, len(vistos)), ("<ok/>", 3))
        check("es un POST, como el jQuery del portal", vistos[-1].method, "POST")
        check("los parámetros van en la URL, manoLanza vacío incluido",
              dict(vistos[-1].url.params), {"idTemporada": "1990", "idEtapa": "SR", "idEquipo": "01", "manoLanza": ""})
        check("con User-Agent identificable", "LIDOM-Stats" in vistos[-1].headers["user-agent"], True)
        dm.post_html("/Equipo/EquipoBateo", {"idTemporada": 1990, "idEtapa": "SR", "idEquipo": "01", "manoLanza": ""})
        check("la segunda vez sale de la caché: el servidor no se entera", (len(vistos), dm.pedidos_red, dm.pedidos_cache), (3, 1, 1))
        offline = DigimetricsClient(cache_dir=tmp, offline=True)
        check("sin red, lo que está en caché se lee",
              offline.post_html("/Equipo/EquipoBateo", {"idTemporada": 1990, "idEtapa": "SR", "idEquipo": "01", "manoLanza": ""}), "<ok/>")
        check("sin red, lo que no está: SinCache",
              lanza(lambda: offline.post_html("/Equipo/EquipoBateo", {"idTemporada": 1991}), SinCache), True)

        vistos.clear()
        dm404 = DigimetricsClient(cache_dir=tmp, intervalo=0, http=httpx.Client(
            base_url="http://x", transport=httpx.MockTransport(lambda r: (vistos.append(r), httpx.Response(404))[1])))
        check("un 404 no se reintenta", (lanza(lambda: dm404.post_html("/No/Existe", {"a": 1}), DigimetricsError), len(vistos)), (True, 1))
        check("y no queda en la caché", (Path(tmp) / nombre_en_cache("/No/Existe", {"a": "1"})).exists(), False)

        dmgrande = DigimetricsClient(cache_dir=tmp, intervalo=0, max_bytes=1000, http=httpx.Client(
            base_url="http://x", transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"x" * 5000))))
        check("una página de fotos en base64: se corta", lanza(lambda: dmgrande.post_html("/Grande", {"a": 1}), PaginaDemasiadoPesada), True)
        check("y tampoco se guarda", (Path(tmp) / nombre_en_cache("/Grande", {"a": "1"})).exists(), False)
        dm.close(); dm404.close(); dmgrande.close()
finally:
    time.sleep = _sleep

print("\n━━━ 4. La ingesta de una temporada, de punta a punta ━━━")
from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from src.models.hist_models import (  # noqa: E402
    HistBateo, HistEquipoTemporada, HistEtapa, HistJugador, HistPitcheo, etiqueta_historica,
)
from src.pipeline.historia_ingestor import (  # noqa: E402
    DISCREPANCIAS_CONOCIDAS, HistoriaIngestor, separar_conocidas,
)

check("etiquetas: verano hasta 1954, invierno desde 1955",
      [etiqueta_historica(a) for a in (1951, 1954, 1955, 1990, 1999)], ["1951", "1954", "1955-56", "1990-91", "1999-00"])

# La fuente falsa: en 1990 juegan el 01 (Águilas) y el 03 (con las mismas
# páginas, para tener dos equipos); el 01 pasa al round robin y nadie llega a
# la final. El resto de los nueve ids devuelve páginas vacías. 1961 no existe.
jugados = {"01", "03"}


def fuente(req: httpx.Request):
    q = dict(req.url.params)
    ruta = req.url.path
    if ruta == "/Equipo/SelectEtapasTemporada":
        return httpx.Response(200, content=ETAPAS_1990 if q["idTemporada"] == "1990" else ETAPAS_1961)
    con_datos = q["idEquipo"] in jugados and (q["idEtapa"] == "SR" or (q["idEtapa"] == "RR" and q["idEquipo"] == "01"))
    if ruta == "/Equipo/EquipoBateo":
        return httpx.Response(200, content=(BATEO_1990 if con_datos else BATEO_VACIO).encode())
    if ruta == "/Equipo/EquipoLanzamiento":
        return httpx.Response(200, content=(PITCHEO_1990 if con_datos else PITCHEO_VACIO).encode())
    return httpx.Response(404)


ingestores: list[HistoriaIngestor] = []


def Ingestor(**kw) -> HistoriaIngestor:
    """Un HistoriaIngestor que se cierra al final de su bloque (cerrar_todo)."""
    i = HistoriaIngestor(**kw)
    ingestores.append(i)
    return i


def cerrar_todo() -> None:
    while ingestores:
        ingestores.pop().close()


def abiertos(carpeta) -> list[str]:
    """Archivos de `carpeta` que este proceso tiene abiertos. En Windows no se
    pueden borrar (WinError 32) y el TemporaryDirectory revienta al salir; en
    Linux sí se pueden, así que sin esta comprobación el fallo no se ve aquí.
    Solo donde existe /proc (Linux); en otros sistemas devuelve []."""
    fd = Path("/proc/self/fd")
    if not fd.exists():
        return []
    raiz = str(Path(carpeta).resolve())
    vistos = []
    for f in fd.iterdir():
        try:
            destino = os.readlink(f)
        except OSError:
            continue
        if destino.startswith(raiz):
            vistos.append(destino)
    return vistos


def contar(engine):
    with Session(engine) as s:
        return {
            "bateo": s.scalar(select(func.count()).select_from(HistBateo)),
            "pitcheo": s.scalar(select(func.count()).select_from(HistPitcheo)),
            "jugadores": s.scalar(select(func.count()).select_from(HistJugador)),
            "etapas": s.scalar(select(func.count()).select_from(HistEtapa)),
            "equipos": sorted(s.execute(select(HistEquipoTemporada.id_equipo, HistEquipoTemporada.team_code,
                                               HistEquipoTemporada.nombre)).all()),
        }


distintos = len({f["id_miembro"] for f in b.filas} | {f["id_miembro"] for f in p.filas})
with tempfile.TemporaryDirectory() as tmp:
    base = f"sqlite:///{tmp}/h.db"
    pedidos = []

    def cliente(refrescar=False):
        return DigimetricsClient(cache_dir=f"{tmp}/cache", intervalo=0, refrescar=refrescar, http=httpx.Client(
            base_url="http://x", transport=httpx.MockTransport(lambda r: (pedidos.append(r), fuente(r))[1])))

    with cliente() as c1:
        ing = Ingestor(db_url=base, client=c1)
        r = ing.ingest([1961, 1990])
    check("1961 se salta: no se jugó", r["no_jugadas"], [1961])
    check("1990: 27+27+27 líneas de bateo (01 y 03 en la regular, 01 en el round robin)", r["bateo"], 81)
    check("y 21+21+21 de pitcheo", r["pitcheo"], 63)
    check("sin discrepancias", r["discrepancias"], [])
    # 1961: 1 (etapas). 1990: 1 (etapas) + 9 (bateo SR de los nueve ids)
    # + 2 (pitcheo SR de los dos que jugaron) + 2 equipos × 2 etapas × 2 tablas.
    check("pedidos: a los equipos que no jugaron solo se les pide el bateo de la regular", r["pedidos_red"], 1 + 1 + 9 + 2 + 8)
    check("pedidos de pitcheo solo a quien jugó",
          sorted({dict(x.url.params)["idEquipo"] for x in pedidos if x.url.path.endswith("Lanzamiento")}), ["01", "03"])
    primera = contar(ing.engine)
    check("jugadores: los distintos de las dos páginas", primera["jugadores"], distintos)
    check("etapas guardadas", primera["etapas"], 3)
    check("equipos de la temporada con su nombre de entonces",
          primera["equipos"], [("01", "AGU", "Aguilas Cibaeñas"), ("03", "ESC", "Aguilas Cibaeñas")])
    with Session(ing.engine) as s:
        fila = s.get(HistBateo, (1990, "SR", "01", 5655))
        check("una fila guardada: Domingo Ramos, 1990-91, AGU", (fila.season_id, fila.team_code, fila.at_bats, fila.left_on_base),
              ("1990-91", "AGU", 31, None))
        mutis = s.get(HistPitcheo, (1990, "RR", "01", jeff["id_miembro"]))
        check("pitcheo del round robin guardado con outs", mutis.outs if mutis else None, 133)

    antes = len(pedidos)
    with cliente() as c2:
        r2 = Ingestor(db_url=base, client=c2).ingest([1990])
    check("segunda corrida: todo de la caché, cero pedidos al servidor", (len(pedidos) - antes, r2["pedidos_cache"]), (0, 20))
    check("e idempotente: la base queda igual", contar(ing.engine), primera)

    # La fuente corrige: el 03 no jugó esa temporada. Con --refrescar se
    # vuelve a bajar y sus filas desaparecen: la temporada se reemplaza entera.
    jugados = {"01"}
    with cliente(refrescar=True) as c3:
        r3 = Ingestor(db_url=base, client=c3).ingest([1990])
    despues = contar(ing.engine)
    check("tras la corrección de la fuente no quedan restos del 03",
          (despues["bateo"], despues["pitcheo"], [e[0] for e in despues["equipos"]]), (54, 42, ["01"]))
    check("2020-21 en adelante no se pide (fotos en base64)",
          lanza(lambda: Ingestor(db_url=base, client=cliente()).ingest_temporada(2020), ValueError), True)

    # Una página que pasa del tope a mitad de temporada (lo que detuvo la
    # primera corrida real en 2020-21): esa temporada se salta ENTERA, sin
    # dejar nada a medias, y la ingesta sigue con la siguiente.
    def fuente_con_pesada(req):
        q = dict(req.url.params)
        if q.get("idTemporada") == "1991" and req.url.path == "/Equipo/SelectEtapasTemporada":
            return httpx.Response(200, content=ETAPAS_1990)
        if q.get("idTemporada") == "1991" and q.get("idEquipo") == "03":
            return httpx.Response(200, content=b"x" * 300_000)
        if q.get("idTemporada") == "1991":
            return fuente(httpx.Request(req.method, str(req.url).replace("idTemporada=1991", "idTemporada=1990")))
        return fuente(req)

    with DigimetricsClient(cache_dir=f"{tmp}/cache2", intervalo=0, max_bytes=200_000, http=httpx.Client(
            base_url="http://x", transport=httpx.MockTransport(fuente_con_pesada))) as c4:
        r4 = Ingestor(db_url=base, client=c4).ingest([1991, 1990])
    with Session(ing.engine) as s:
        de_1991 = s.scalar(select(func.count()).select_from(HistBateo).where(HistBateo.temporada == 1991))
    check("temporada con una página pesada: se salta entera y la ingesta sigue",
          (r4["omitidas_por_peso"], r4["temporadas"], de_1991), ([1991], 1, 0))
    cerrar_todo()
    check("al terminar no queda ningún archivo abierto en la carpeta temporal (WinError 32 en Windows)",
          abiertos(tmp), [])

# Las discrepancias conocidas de la fuente no detienen la ingesta; las nuevas sí.
nombres_cruzada = {d.split(":", 1)[0] for d in parse_bateo_equipo(cruzada).discrepancias}
check("separar: las de la lista pasan a conocidas, el resto sigue siendo nuevo",
      separar_conocidas((1990, "SR", "01", "bateo"),
                        ["DOMINGO RAMOS: AVG x", "OTRO: AVG y"], {(1990, "SR", "01", "bateo"): {"DOMINGO RAMOS"}}),
      (["OTRO: AVG y"], ["DOMINGO RAMOS: AVG x"]))
check("la lista vale solo para SU página (otra etapa no hereda la excepción)",
      separar_conocidas((1990, "RR", "01", "bateo"), ["DOMINGO RAMOS: AVG x"],
                        {(1990, "SR", "01", "bateo"): {"DOMINGO RAMOS"}}), (["DOMINGO RAMOS: AVG x"], []))
check("la lista real: Escogido 2019-20, cinco bateadores",
      {k: len(v) for k, v in DISCREPANCIAS_CONOCIDAS.items()}, {(2019, "SR", "03", "bateo"): 5})


def fuente_cruzada(req):
    if req.url.path == "/Equipo/EquipoBateo" and dict(req.url.params).get("idEquipo") == "01":
        q = dict(req.url.params)
        return httpx.Response(200, content=(cruzada if q["idEtapa"] == "SR" else BATEO_VACIO).encode())
    return fuente(req)


with tempfile.TemporaryDirectory() as tmp:
    for conocidas, esperado in (({}, True), ({(1990, "SR", "01", "bateo"): nombres_cruzada}, False)):
        with DigimetricsClient(cache_dir=None, intervalo=0, http=httpx.Client(
                base_url="http://x", transport=httpx.MockTransport(fuente_cruzada))) as c5:
            r5 = Ingestor(db_url=f"sqlite:///{tmp}/d.db", client=c5,
                                  discrepancias_conocidas=conocidas).ingest([1990])
        check("columnas cruzadas " + ("sin lista: discrepancias que detienen" if esperado
                                      else "en la lista: solo avisos"),
              (bool(r5["discrepancias"]), any("error conocido" in a for a in r5["avisos"])), (esperado, not esperado))
    cerrar_todo()
    check("tampoco aquí queda nada abierto", abiertos(tmp), [])

print("\n━━━ 5. El cruce con el esquema de juego ━━━")
from src.models.database import (  # noqa: E402
    BattingLine, Game, PitchingLine, Player, Season, Team, init_db,
)
from src.pipeline.cruce_historia import cruzar, informe  # noqa: E402

with tempfile.TemporaryDirectory() as tmp:
    engine = init_db(f"sqlite:///{tmp}/c.db")
    with Session(engine) as s, s.begin():
        for code in ("AGU", "LIC"):
            s.add(Team(team_code=code, full_name=code))
        s.add(Season(season_id="2015-16", short_label="15-16"))
        s.add(Player(player_id="p1", full_name="Uno"))
        s.add(Player(player_id="p2", full_name="Dos"))
        s.add(Game(game_id="g1", season_id="2015-16", game_date=date(2015, 10, 20), home_team_code="AGU",
                   away_team_code="LIC", home_score=3, away_score=1, stage="regular", status="final"))
        # Un juego pospuesto con líneas: no debe contar.
        s.add(Game(game_id="g2", season_id="2015-16", game_date=date(2015, 10, 21), home_team_code="AGU",
                   away_team_code="LIC", stage="regular", status="postponed"))
        s.add(BattingLine(game_id="g1", player_id="p1", team_code="AGU", at_bats=4, hits=2, home_runs=1, runs=1, rbi=2))
        s.add(BattingLine(game_id="g2", player_id="p1", team_code="AGU", at_bats=9, hits=9))
        s.add(PitchingLine(game_id="g1", player_id="p2", team_code="AGU", decision="W", outs_recorded=27,
                           earned_runs=1, hits_allowed=5, strikeouts=7))
        s.add(HistBateo(temporada=2015, etapa="SR", id_equipo="01", id_miembro=1, season_id="2015-16",
                        team_code="AGU", at_bats=4, hits=2, home_runs=1, runs=1, rbi=2, doubles=0))
        # Una línea del round robin: no entra en el cruce de la regular.
        s.add(HistBateo(temporada=2015, etapa="RR", id_equipo="01", id_miembro=1, season_id="2015-16",
                        team_code="AGU", at_bats=50, hits=20))
        s.add(HistPitcheo(temporada=2015, etapa="SR", id_equipo="01", id_miembro=2, season_id="2015-16",
                          team_code="AGU", wins=1, losses=0, outs=27, earned_runs=1, hits_allowed=5, strikeouts=7))
        # 1990-91 solo está en la capa histórica: no se cruza.
        s.add(HistBateo(temporada=1990, etapa="SR", id_equipo="01", id_miembro=1, season_id="1990-91",
                        team_code="AGU", at_bats=100, hits=30))
    r = cruzar(engine)
    check("solo se cruzan las temporadas de las dos capas", list(r["temporadas"]), ["2015-16"])
    check("AGU idéntico (el pospuesto y el round robin no cuentan)", r["temporadas"]["2015-16"]["AGU"], {"bateo": {}, "pitcheo": {}})
    with Session(engine) as s, s.begin():
        s.get(HistPitcheo, (2015, "SR", "01", 2)).earned_runs = 2
    r = cruzar(engine)
    check("una carrera limpia de más en la fuente se ve", r["temporadas"]["2015-16"]["AGU"]["pitcheo"], {"CL": (2, 1)})
    check("el informe la muestra", "AGU  CL 2/1" in informe(r), True)
    engine.dispose()
    check("ni en la base del cruce", abiertos(tmp), [])

print("\n━━━ 6. La caché real (si existe) ━━━")
cache = Path("data/raw/digimetrics")
paginas = sorted(cache.glob("Equipo_Equipo*/*.gz")) if cache.exists() else []
if not paginas:
    print("  (no hay caché: corre `python main.py ingest-historia` para bajarla)")
else:
    import gzip

    malas, conocidas, filas = [], [], 0
    for archivo in paginas:
        html = gzip.decompress(archivo.read_bytes()).decode("utf-8")
        es_pitcheo = "Lanzamiento" in archivo.parent.name
        tabla = (parse_pitcheo_equipo if es_pitcheo else parse_bateo_equipo)(html)
        filas += len(tabla.filas)
        q = dict(re.findall(r"(id[A-Za-z]+)-([A-Za-z0-9]*)", archivo.name))
        clave = (int(q["idTemporada"]), q["idEtapa"], q["idEquipo"], "pitcheo" if es_pitcheo else "bateo")
        nuevas, ya = separar_conocidas(clave, tabla.discrepancias)
        malas += [f"{archivo.name}: {d}" for d in nuevas]
        conocidas += [(clave, d.split(":", 1)[0]) for d in ya]
    print(f"  {len(paginas)} páginas, {filas} filas")
    for m in malas[:20]:
        print(f"    {m}")
    check("ninguna fila de la caché con tasas que no cuadren, fuera de las conocidas", len(malas), 0)
    check("y las conocidas siguen ahí (si la fuente las corrige, se quitan de la lista)",
          {k: {n for kk, n in conocidas if kk == k} for k in DISCREPANCIAS_CONOCIDAS},
          DISCREPANCIAS_CONOCIDAS)

print("\n━━━ 7. La capa histórica cargada (si está en data/lidom_stats.db) ━━━")
import sqlite3  # noqa: E402

base_real = Path("data/lidom_stats.db")
con = sqlite3.connect(base_real) if base_real.exists() else None
tiene_historia = bool(con and con.execute(
    "SELECT 1 FROM sqlite_master WHERE name = 'hist_bateo'").fetchone() and con.execute(
    "SELECT 1 FROM hist_bateo LIMIT 1").fetchone())
if not tiene_historia:
    print("  (la base no tiene la capa histórica: corre `python main.py ingest-historia`)")
else:
    temporadas = [t for (t,) in con.execute("SELECT DISTINCT temporada FROM hist_bateo ORDER BY 1")]
    check("66 temporadas, de 1951 a 2019, sin 1961, 1962 ni 1965",
          (len(temporadas), temporadas[0], temporadas[-1], {1961, 1962, 1965} & set(temporadas)), (66, 1951, 2019, set()))
    # En cada etapa, los ganados de todos los lanzadores deberían igualar a
    # los perdidos. En estas doce no: decisiones que faltan o sobran en la
    # propia fuente (verificado el 30-sep-2026 con la carga completa).
    desbalance = con.execute("""
        SELECT temporada, etapa, SUM(wins), SUM(losses) FROM hist_pitcheo
        GROUP BY temporada, etapa HAVING SUM(wins) != SUM(losses) ORDER BY 1, 2""").fetchall()
    check("ganados = perdidos salvo en las doce etapas conocidas", desbalance, [
        (1953, "SR", 108, 109), (1963, "SR", 120, 111), (1964, "SR", 111, 105), (1968, "SF", 7, 6),
        (1971, "SF", 8, 10), (1982, "SR", 116, 118), (1987, "SR", 186, 180), (1993, "RR", 33, 35),
        (2008, "SR", 151, 149), (2009, "SR", 152, 146), (2013, "SR", 151, 147), (2014, "SR", 149, 150)])

    from sqlalchemy import create_engine  # noqa: E402

    motor = create_engine(f"sqlite:///{base_real}")
    cruce = cruzar(motor)
    motor.dispose()
    if not cruce["equipos"]:
        print("  (la base no tiene el esquema de juego de 2012-13 en adelante: no hay cruce)")
    else:
        def difs(season_id, excluir=()):
            return [abs(a - b) for team, f in cruce["temporadas"][season_id].items() if team not in excluir
                    for tipo in ("bateo", "pitcheo") for a, b in f[tipo].values()]

        # Una cifra por temporada: la suma de |DIGIMETRICS - MLB| de todos los
        # totales de todos los equipos. Fija exacta: si cualquiera de las dos
        # fuentes cambia algo, esto lo delata.
        check("huella del cruce por temporada (suma de diferencias absolutas)",
              {s: sum(difs(s)) for s in cruce["temporadas"]},
              {"2012-13": 293, "2013-14": 189, "2014-15": 28, "2015-16": 13438,
               "2016-17": 256, "2017-18": 39, "2018-19": 23, "2019-20": 29})
        check("2014-15 y 2017-18 a 2019-20: solo diferencias de anotador (5 como mucho)",
              max(d for s in ("2014-15", "2017-18", "2018-19", "2019-20") for d in difs(s)), 5)
        check("2016-17: fuera del forfeit Gigantes-Licey, 2 como mucho", max(difs("2016-17", excluir=("GIG", "LIC"))), 2)
        forfeit = cruce["temporadas"]["2016-17"]
        check("y Gigantes y Licey tienen de más en DIGIMETRICS el juego perdido por forfeit",
              (forfeit["GIG"]["bateo"]["VB"], forfeit["LIC"]["bateo"]["VB"]), ((1695, 1662), (1663, 1626)))
        incompleta = cruce["temporadas"]["2015-16"]
        check("2015-16 está INCOMPLETA en DIGIMETRICS: a cada equipo le falta más de un tercio",
              all(f["bateo"]["VB"][0] < 0.7 * f["bateo"]["VB"][1] for f in incompleta.values()), True)

print()
if fails:
    print(f"❌ {len(fails)} comprobaciones fallaron: {fails}")
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
