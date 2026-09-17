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

print()
if fails:
    print(f"❌ {len(fails)} fallaron: {fails}")
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
