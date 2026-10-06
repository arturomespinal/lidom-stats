"""
verify_live_poller.py — Comprueba el poller y los endpoints en vivo sin red.

Usa un cliente simulado que sirve las instantáneas y la cadena de parches
capturadas en fixtures/. Si no están:

    python capture_gumbo.py
    python capture_diffs.py
    python verify_live_poller.py
"""

import asyncio
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.live.gumbo import parse_live_feed
from src.live.poller import LivePoller
from src.live.store import LiveStore

FIX = "fixtures"
need = [f"{FIX}/diff_base.json", f"{FIX}/diff_chain.json", f"{FIX}/diff_target.json"]
if not all(os.path.exists(p) for p in need):
    print("❌ Faltan fixtures. Corre: python capture_gumbo.py && python capture_diffs.py")
    sys.exit(1)

base = json.load(open(need[0], encoding="utf-8"))
chain = json.load(open(need[1], encoding="utf-8"))
target = json.load(open(need[2], encoding="utf-8"))
snapshots = [json.load(open(f, encoding="utf-8"))
             for f in sorted(glob.glob(f"{FIX}/826343_2025*.json"))]

GAME_PK = base["gamePk"]
fails = []


def check(label, got, want):
    ok = got == want
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}: {got}" + ("" if ok else f"  (esperado {want})"))


class FakeClient:
    """Sirve la base y después los parches, en orden."""

    def __init__(self, full_feeds=None, diffs=None):
        self.full_feeds = full_feeds if full_feeds is not None else [base]
        self.diffs = list(diffs) if diffs is not None else [s["payload"] for s in chain]
        self.full_calls = 0
        self.diff_calls = 0

    def get_live_feed(self, game_pk, timecode=None):
        self.full_calls += 1
        i = min(self.full_calls - 1, len(self.full_feeds) - 1)
        return self.full_feeds[i]

    def get_live_diff(self, game_pk, start_timecode):
        self.diff_calls += 1
        if not self.diffs:
            return []
        return self.diffs.pop(0)

    def get_schedule(self, season, game_type=None):
        return {"dates": [{"date": "2025-10-15", "games": [{
            "gamePk": GAME_PK, "officialDate": "2025-10-15", "gameNumber": 1,
            "teams": {"home": {"team": {"id": 669}}, "away": {"team": {"id": 668}}},
        }]}]}

    def close(self):
        pass


print("━━━ 1. Descubrimiento por calendario ━━━")
st = LiveStore()
fc = FakeClient()
p = LivePoller(store=st, client=fc, game_date="2025-10-15")
found = p.discover()
check("encuentra el juego LIDOM del día", found, [GAME_PK])
check("le asigna el game_id de nuestro esquema",
      p._tracking[GAME_PK], "2025-10-15-TOR-EST-1")

# Sin fecha fija, la jornada es la de RD y no la del reloj de la máquina. El
# servidor corre en UTC: a la 1:30 UTC del 16 en RD siguen siendo las 9:30 de
# la noche del 15, en pleno juego, y date.today() ya diría 16.
from datetime import datetime as _dt, timezone as _tz
import src.live.poller as _pl
from src.jornada import hoy_rd as _hoy_rd
_madrugada_utc = _dt(2025, 10, 16, 1, 30, tzinfo=_tz.utc)
check("a la 1:30 UTC del 16, en RD sigue siendo el 15",
      _hoy_rd(_madrugada_utc).isoformat(), "2025-10-15")
_original = _pl.hoy_rd
_pl.hoy_rd = lambda: _hoy_rd(_madrugada_utc)
try:
    check("sin fecha fija, el poller sigue la jornada de RD",
          LivePoller(store=LiveStore(), client=FakeClient()).discover(), [GAME_PK])
finally:
    _pl.hoy_rd = _original

print("\n━━━ 1b. Modo de prueba con la MLB (LIDOM_LIVE_MLB) ━━━")


class FakeMLB(FakeClient):
    """El calendario del día de Grandes Ligas: dos juegos de playoff y uno de
    otra fecha que no debe seguirse."""

    def __init__(self):
        super().__init__()
        self.pedidos = []

    def get_schedule(self, season=None, game_type=None, **kw):
        self.pedidos.append({"season": season, **kw})
        juego = lambda pk, h, a: {"gamePk": pk, "officialDate": "2026-10-06", "gameNumber": 1, "teams": {
            "home": {"team": {"id": h, "name": f"equipo {h}"}}, "away": {"team": {"id": a, "name": f"equipo {a}"}}}}
        return {"dates": [{"date": "2026-10-06", "games": [juego(813001, 158, 135), juego(813002, 147, 111)]},
                          {"date": "2026-10-07", "games": [juego(813003, 158, 135)]}]}


fm = FakeMLB()
pm = LivePoller(store=LiveStore(), client=fm, game_date="2026-10-06", liga="mlb",
                on_final=lambda pk, s: None)
check("sigue los juegos de Grandes Ligas del día, no los de otra fecha", pm.discover(), [813001, 813002])
check("pide solo ese día y a las Grandes Ligas (sportId 1, sin liga)",
      fm.pedidos[0], {"season": None, "league_id": None, "sport_id": 1, "date": "2026-10-06"})
check("sin game_id: no existen en nuestro esquema", set(pm._tracking.values()), {None})
check("on_final se descarta: nada de la MLB llega a la base", pm.on_final, None)
check("el modo de siempre ignora a los equipos que no son de LIDOM",
      LivePoller(store=LiveStore(), client=FakeMLB(), game_date="2026-10-06").discover(), [])
try:
    LivePoller(store=LiveStore(), client=fm, liga="nba")
    check("una liga desconocida se rechaza", False, True)
except ValueError:
    check("una liga desconocida se rechaza", True, True)

# Un juego terminado en modo MLB: el estado queda, pero on_final no corre.
avisos_mlb = []
pf = LivePoller(store=LiveStore(), client=FakeClient(full_feeds=[snapshots[-1]], diffs=[]),
                game_date="2026-10-06", liga="mlb", on_final=lambda pk, s: avisos_mlb.append(pk))
pf._tracking[GAME_PK] = None
pf._poll_game(GAME_PK)
check("al terminar un juego en modo MLB no se ingesta nada", (pf.store.get(GAME_PK).state.is_final, avisos_mlb),
      (True, []))

# Equipos que no son de LIDOM: la tarjeta y el detalle usan la abreviatura.
import copy
from src.live.detail import parse_game_detail
mlb_feed = copy.deepcopy(snapshots[-1])
for lado, (tid, abrev) in (("home", (158, "MIL")), ("away", (135, "SD"))):
    mlb_feed["gameData"]["teams"][lado].update({"id": tid, "abbreviation": abrev})
    # Como en el feed real: el equipo del boxscore trae el id, no la abreviatura.
    mlb_feed["liveData"]["boxscore"]["teams"][lado]["team"]["id"] = tid
est = parse_live_feed(mlb_feed)
check("la tarjeta: los códigos de la MLB", (est.away.team_code, est.home.team_code), ("SD", "MIL"))
det = parse_game_detail(mlb_feed)
det = det if isinstance(det, dict) else det.model_dump() if hasattr(det, "model_dump") else det.__dict__
codigos = json.dumps(det, default=lambda o: getattr(o, "__dict__", str(o)))
check("el detalle también (no queda en null)", ('"team_code": "MIL"' in codigos, '"team_code": "SD"' in codigos),
      (True, True))

# Arranque: el modo MLB se enciende con la variable y NUNCA en producción.
import api.live_routes as _lr_mlb
_arranques = []
_start_original = _lr_mlb.start_poller
_lr_mlb.start_poller = lambda **kw: _arranques.append(kw)
_env_original = dict(os.environ)
try:
    os.environ.update({"LIDOM_LIVE_POLLER": "1", "LIDOM_LIVE_MLB": "1"})
    os.environ.pop("LIDOM_LIVE_REPLAY", None)
    os.environ.pop("LIDOM_ENTORNO", None)
    _lr_mlb.maybe_start_poller()
    check("LIDOM_LIVE_MLB=1 arranca el poller con la MLB", [k.get("liga") for k in _arranques], ["mlb"])
    _arranques.clear()
    os.environ.update({"LIDOM_ENTORNO": "produccion", "LIDOM_CORS_ORIGINS": "https://deportiv.example"})
    _lr_mlb.maybe_start_poller()
    check("en producción LIDOM_LIVE_MLB no arranca nada", _arranques, [])
finally:
    os.environ.clear()
    os.environ.update(_env_original)
    _lr_mlb.start_poller = _start_original

print("\n━━━ 2. Primer sondeo: feed completo ━━━")
p._poll_game(GAME_PK)
e = st.get(GAME_PK)
check("bajó el feed entero una vez", e.full_fetches, 1)
check("todavía no aplicó parches", e.patch_applications, 0)
check("guardó el documento crudo", e.raw is not None, True)
check("marca de tiempo inicial", e.timecode, base["metaData"]["timeStamp"])
print(f"    estado: {e.state.score_line} · {e.state.situation}")

print("\n━━━ 3. Sondeos siguientes: solo parches ━━━")
for _ in range(len(chain)):
    p._poll_game(GAME_PK)
e = st.get(GAME_PK)
check("no volvió a bajar el feed entero", e.full_fetches, 1)
check("aplicó un parche por sondeo", e.patch_applications, len(chain))
check("sondeos totales", e.poll_count, len(chain) + 1)
check("llegó a la marca final de la cadena", e.timecode, target["metaData"]["timeStamp"])

esperado = parse_live_feed(target, game_id="2025-10-15-TOR-EST-1")
check("el estado por parches es idéntico al del feed completo", e.state, esperado)
print(f"    estado: {e.state.score_line} · {e.state.situation}")

print("\n━━━ 4. Respaldo cuando el parche no sirve ━━━")
casos = [
    ("respuesta con basura", [{"no_es_un_diff": []}]),
    ("operación inválida", [{"diff": [{"op": "replace", "path": "/no/existe/nada", "value": 1}]}]),
    ("la API devuelve el feed completo", target),
    ("un objeto inesperado", {"error": "timecode demasiado viejo"}),
]
for etiqueta, respuesta in casos:
    st2 = LiveStore()
    fc2 = FakeClient(full_feeds=[base, target], diffs=[respuesta])
    p2 = LivePoller(store=st2, client=fc2, game_date="2025-10-15")
    p2._tracking[GAME_PK] = None
    p2._poll_game(GAME_PK)      # completo
    p2._poll_game(GAME_PK)      # aquí llega la respuesta mala
    e2 = st2.get(GAME_PK)
    ok = e2.state is not None and e2.raw is not None
    if not ok:
        fails.append(etiqueta)
    print(f"  {'✓' if ok else '✗'} {etiqueta}: se recuperó, "
          f"feeds completos={e2.full_fetches}, parches={e2.patch_applications}")

st3 = LiveStore()
fc3 = FakeClient(full_feeds=[base], diffs=[[]])
p3 = LivePoller(store=st3, client=fc3, game_date="2025-10-15")
p3._tracking[GAME_PK] = None
p3._poll_game(GAME_PK)
antes = st3.get(GAME_PK).timecode
p3._poll_game(GAME_PK)
check("un diff vacío deja el estado intacto", st3.get(GAME_PK).timecode, antes)

print("\n━━━ 5. Final del juego ━━━")
avisos = []
st4 = LiveStore()
fc4 = FakeClient(full_feeds=[snapshots[-1]], diffs=[])
p4 = LivePoller(store=st4, client=fc4, game_date="2025-10-15",
                on_final=lambda pk, s: avisos.append((pk, s.score_line)))
p4._tracking[GAME_PK] = None
p4._poll_game(GAME_PK)
check("disparó on_final una vez", len(avisos), 1)
check("con el marcador correcto", avisos[0][1], "TOR 3 - 7 EST")
check("soltó el documento crudo del juego terminado", st4.get(GAME_PK).raw, None)
check("pero conservó el estado final", st4.get(GAME_PK).state.is_final, True)
p4._poll_game(GAME_PK)
check("no vuelve a disparar on_final", len(avisos), 1)

print("\n━━━ 6. Intervalo de sondeo ━━━")
espera = p._poll_game(GAME_PK)
check("usa el que recomienda la API, no uno fijo", espera, 10.0)
st5 = LiveStore()
p5 = LivePoller(store=st5, client=FakeClient(), game_date="2025-10-15")
p5._schedule_checked_at = 9e18   # que no consulte el calendario
check("sin juegos activos duerme largo", p5.tick(), 60)

print("\n━━━ 7. La caché ━━━")
s = st.stats()
print(f"    {s}")
check("un solo juego en seguimiento", s["tracked"], 1)
check("ahorro: 1 feed completo contra muchos parches",
      s["full_fetches"] < s["patch_applications"], True)
check("by_game_id encuentra el juego",
      st.by_game_id("2025-10-15-TOR-EST-1").game_pk, GAME_PK)
check("states() devuelve el estado", len(st.states()), 1)

print("\n━━━ 8. Endpoints HTTP ━━━")
from fastapi.testclient import TestClient
import api.live_routes as lr
lr.store = st
from api.main import app

# El router ya se montó con la caché por defecto; la sustituimos para la prueba.
import src.live.store as store_mod
store_mod.store._entries = st._entries

c = TestClient(app)
r = c.get("/live/status")
check("/live/status responde", r.status_code, 200)
print(f"    {r.json()}")
check("el poller no arranca solo", r.json()["poller_running"], False)

r = c.get("/live/games")
check("/live/games responde", r.status_code, 200)
check("con el juego en seguimiento", r.json()["count"], 1)
d = r.json()["data"][0]
check("trae el marcador", (d["away"]["runs"], d["home"]["runs"]), (2, 6))
check("trae los corredores", d["runners"]["third"] is not None, True)

r = c.get(f"/live/games/{GAME_PK}")
check(f"/live/games/{GAME_PK} responde", r.status_code, 200)
check("informa la antigüedad del dato", "age_seconds" in r.json(), True)
check("juego no seguido → 404", c.get("/live/games/999999").status_code, 404)
r = c.get(f"/live/games/{GAME_PK}/detail")
sit = r.json().get("situation") or {}
check("/detail trae la situación del juego en curso: outs, cuenta, bases, bateador y lanzador",
      (r.status_code, sorted(sit), sit.get("runners", {}).get("third") is not None),
      (200, ["balls", "batter", "half_over_label", "is_top_inning", "on_deck", "outs", "pitcher",
             "runners", "strikes"], True))
check("en pleno turno no hay fin de media entrada", sit.get("half_over_label"), None)
check("…con los mismos datos que la tarjeta", (sit.get("outs"), sit.get("batter")), (d["outs"], d["batter"]))
r = c.get("/day")
check("/day: un juego en vivo de la caché abre la puerta a los marcadores aunque la base no lo tenga",
      (r.status_code, r.json().get("any_live")), (200, True))

print("\n━━━ 9. Flujo SSE ━━━")


async def probar_sse():
    gen = lr.live_stream.__wrapped__ if hasattr(lr.live_stream, "__wrapped__") else None
    resp = await lr.live_stream(GAME_PK)
    it = resp.body_iterator
    primero = await asyncio.wait_for(it.__anext__(), timeout=3)
    return primero


primero = asyncio.run(probar_sse())
check("el primer evento es de estado", primero.startswith("event: state"), True)
cuerpo = json.loads(primero.split("data: ", 1)[1].strip())
check("el JSON del evento trae el marcador", cuerpo["away"]["runs"], 2)
check("y cabe en un evento SSE", len(primero) < 8192, True)
print(f"    {len(primero)} bytes por evento")


async def probar_final():
    """Un juego terminado debe emitir 'final' y cerrar el flujo."""
    lr.store = st4
    store_mod.store._entries = st4._entries
    resp = await lr.live_stream(GAME_PK)
    eventos = []
    async for chunk in resp.body_iterator:
        eventos.append(chunk)
        if len(eventos) >= 2:
            break
    return eventos


eventos = asyncio.run(asyncio.wait_for(probar_final(), timeout=5))
check("emite estado y después final", [e.split("\n")[0] for e in eventos],
      ["event: state", "event: final"])

print("\n━━━ 10. ReplayClient contra instantáneas reales ━━━")
from src.live.replay import ReplayClient


class InnerFake:
    """Cliente interno que sirve las instantáneas guardadas."""

    def __init__(self):
        self.marcas = sorted(snapshots, key=lambda d: d["metaData"]["timeStamp"])
        self.stamps = [d["metaData"]["timeStamp"] for d in self.marcas]
        self.diff_calls = []

    def get_live_timestamps(self, game_pk):
        return list(self.stamps)

    def get_live_feed(self, game_pk, timecode=None):
        for d in self.marcas:
            if d["metaData"]["timeStamp"] == timecode:
                return json.loads(json.dumps(d))
        return json.loads(json.dumps(self.marcas[0]))

    def get_live_diff(self, game_pk, start_timecode, end_timecode=None):
        self.diff_calls.append((start_timecode, end_timecode))
        return [{"diff": [{"op": "replace", "path": "/metaData/timeStamp",
                           "value": end_timecode}]}]

    def close(self):
        pass


inner = InnerFake()
rc = ReplayClient(GAME_PK, client=inner, step=2, interval=3, game_date="2026-09-17")

# Esto es exactamente lo que falló en Windows: el calendario sintético traía
# los IDs en None porque el feed en vivo no anida los equipos como /schedule.
check("lee el ID del local del feed en vivo", rc.home_id, 669)
check("lee el ID del visitante", rc.away_id, 668)

sched = rc.get_schedule(season="2026")
juego = sched["dates"][0]["games"][0]
check("el calendario sintético usa la anidación de /schedule",
      juego["teams"]["home"]["team"]["id"], 669)

st6 = LiveStore()
p6 = LivePoller(store=st6, client=rc, game_date="2026-09-17")
check("discover() SÍ encuentra el juego", p6.discover(), [GAME_PK])
check("y le arma el game_id", p6._tracking[GAME_PK] is not None, True)

feed = rc.get_live_feed(GAME_PK)
check("inyecta su propio intervalo en el feed", feed["metaData"]["wait"], 3)

rc.get_live_diff(GAME_PK, rc.stamps[0])
check("avanza la posición según step", rc.pos, 2)
check("pide el diff entre las dos marcas reales",
      inner.diff_calls[-1], (rc.stamps[0], rc.stamps[2]))

parche = rc.get_live_diff(GAME_PK, rc.stamps[2])
ops = parche[0]["diff"]
check("añade la operación que mantiene el ritmo",
      ops[-1], {"op": "replace", "path": "/metaData/wait", "value": 3})

while not rc.finished:
    rc.get_live_diff(GAME_PK, "x")
check("al terminar no avanza más", rc.get_live_diff(GAME_PK, "x"), [])
check("progreso al 100%", rc.progress, 1.0)
rc.restart()
check("restart vuelve al principio", rc.pos, 0)

try:
    ReplayClient(GAME_PK, client=InnerFake(), game_date="2026-09-17")
    ajeno_ok = True
except ValueError:
    ajeno_ok = False
check("acepta un juego de LIDOM", ajeno_ok, True)

print("\n━━━ Al terminar un juego (on_final de la API) ━━━")
# Lo que la API hace cuando el poller avisa un final: ingestar SOLO ese juego y,
# si entró, poner al día las tablas planas. Los ingestores se sustituyen por
# dobles que anotan las llamadas: aquí se prueba el cableado, no la red.
import types
import src.pipeline.boxscore_ingestor as _bi
import src.pipeline.mlb_ingestor as _mi
import api.live_routes as _lr

llamadas = []
resultado = {"ingested": True}


class BoxDoble:
    def __init__(self, *a, **k): pass
    def ingest(self, *a, **k): llamadas.append(("temporada", a, k)); return {}
    def ingest_game(self, pk, season=None):
        llamadas.append(("juego", pk, season))
        # Como el real: la temporada sale del calendario del juego.
        return dict(resultado, game_pk=pk, season="2025")


class PlanasDoble:
    def __init__(self, *a, **k): pass
    def ingest(self, season):
        llamadas.append(("planas", season))
        return {}


_bi.BoxscoreIngestor, _mi.MLBIngestor = BoxDoble, PlanasDoble
estado = types.SimpleNamespace(season="2025")

_lr._ingest_finished_game(826343, estado)
check("ingesta solo ese juego, con su temporada", llamadas[0], ("juego", 826343, "2025"))
check("no corre la ingesta de la temporada entera", any(c[0] == "temporada" for c in llamadas), False)
check("y pone al día las tablas planas", llamadas[1:], [("planas", "2025")])

llamadas.clear()
resultado = {"ingested": False}
_lr._ingest_finished_game(826343, estado)
check("si el juego no entró, las planas no se tocan", llamadas, [("juego", 826343, "2025")])

llamadas.clear()
resultado = {"ingested": True}
_lr._ingest_finished_game(826343, types.SimpleNamespace(season=None))
check("sin temporada en el estado, el juego la saca de su calendario",
      llamadas, [("juego", 826343, None), ("planas", "2025")])


class BoxQueFalla(BoxDoble):
    def ingest_game(self, pk, season=None):
        raise RuntimeError("la MLB API no responde")


_bi.BoxscoreIngestor = BoxQueFalla
llamadas.clear()
try:
    _lr._ingest_finished_game(826343, estado)
    sin_excepcion = True
except Exception:
    sin_excepcion = False
check("un fallo de la ingesta no tumba el hilo del poller", sin_excepcion, True)
check("y tras el fallo no intenta las planas", llamadas, [])

print()
if fails:
    print(f"❌ {len(fails)} fallaron: {fails}")
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
