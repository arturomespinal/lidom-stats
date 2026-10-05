"""La seguridad de la API (api/seguridad.py), sin red.

Dos partes:
- La configuración y el límite por IP, como funciones puras (reloj falso).
- La API entera levantada en MODO PRODUCCIÓN con TestClient: documentación
  oculta, diagnóstico solo con clave, CORS, límite con su 429, cabeceras y
  parámetros acotados.

El entorno de producción se fija ANTES de importar api.main, porque la
configuración se lee una vez al arrancar. Por eso esta suite corre en su propio
proceso y no se mezcla con verify_game_routes.py, que prueba en desarrollo.
"""
import os
import sys

CLAVE = "clave-de-diagnostico-de-prueba-123456"
SERVIDOR = "clave-del-servidor-web-de-prueba-7890"
os.environ.update({
    "LIDOM_CLAVE_SERVIDOR": SERVIDOR,
    "LIDOM_ENTORNO": "produccion",
    "LIDOM_CORS_ORIGINS": "https://deportiv.do, https://www.deportiv.do/",
    "LIDOM_LIMITE_POR_MINUTO": "5",
    "LIDOM_CONFIAR_PROXY": "1",
    "LIDOM_CLAVE_DIAGNOSTICO": CLAVE,
})
os.environ.pop("LIDOM_LIVE_POLLER", None)

from api.seguridad import ConfigInvalida, CuboDeFichas, leer_config  # noqa: E402

fails: list[str] = []


def check(label, got, want):
    ok = got == want
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}: {got}" + ("" if ok else f"  (esperado {want})"))


def invalida(env) -> bool:
    try:
        leer_config(env)
        return False
    except ConfigInvalida:
        return True


print("━━━ Configuración ━━━")
dev = leer_config({})
check("desarrollo: CORS a localhost:3000", dev.cors_origenes, ("http://localhost:3000", "http://127.0.0.1:3000"))
check("desarrollo: límite apagado (las suites hacen cientos de peticiones)", dev.limite_por_minuto, 0)
check("desarrollo: no es producción", dev.produccion, False)
prod = leer_config({"LIDOM_ENTORNO": "produccion", "LIDOM_CORS_ORIGINS": "https://deportiv.do/"})
check("producción: límite de 300 por defecto (CGNAT de las redes móviles)", prod.limite_por_minuto, 300)
check("producción: la barra final del origen se quita", prod.cors_origenes, ("https://deportiv.do",))
check("producción sin orígenes: no arranca", invalida({"LIDOM_ENTORNO": "produccion"}), True)
check("producción con '*': no arranca",
      invalida({"LIDOM_ENTORNO": "produccion", "LIDOM_CORS_ORIGINS": "*"}), True)
check("producción con límite 0: no arranca",
      invalida({"LIDOM_ENTORNO": "produccion", "LIDOM_CORS_ORIGINS": "https://a.do",
                "LIDOM_LIMITE_POR_MINUTO": "0"}), True)
check("producción con clave corta: no arranca",
      invalida({"LIDOM_ENTORNO": "produccion", "LIDOM_CORS_ORIGINS": "https://a.do",
                "LIDOM_CLAVE_DIAGNOSTICO": "corta"}), True)
check("límite que no es número: no arranca", invalida({"LIDOM_LIMITE_POR_MINUTO": "mucho"}), True)
check("clave del servidor corta: no arranca",
      invalida({"LIDOM_ENTORNO": "produccion", "LIDOM_CORS_ORIGINS": "https://a.do",
                "LIDOM_CLAVE_SERVIDOR": "corta"}), True)
check("las dos claves iguales: no arranca",
      invalida({"LIDOM_CLAVE_SERVIDOR": "x" * 30, "LIDOM_CLAVE_DIAGNOSTICO": "x" * 30}), True)

print("\n━━━ El cubo de fichas (reloj falso) ━━━")
t = [0.0]
cubo = CuboDeFichas(60, reloj=lambda: t[0])  # 60 por minuto = 1 por segundo
ok = [cubo.pedir("1.1.1.1")[0] for _ in range(60)]
check("deja la ráfaga entera (60 seguidas)", all(ok), True)
negada, espera = cubo.pedir("1.1.1.1")
check("la 61 se niega", negada, False)
check("y dice cuánto esperar (~1 s)", round(espera), 1)
check("otra IP tiene su propio cubo", cubo.pedir("2.2.2.2")[0], True)
t[0] += 1.0
check("un segundo después hay una ficha", cubo.pedir("1.1.1.1")[0], True)
check("pero solo una", cubo.pedir("1.1.1.1")[0], False)
t[0] += 3600
check("una hora después el cubo está lleno otra vez", all(cubo.pedir("1.1.1.1")[0] for _ in range(60)), True)
cubo.MAX_IPS = 10
for i in range(20):
    cubo.pedir(f"10.0.0.{i}")
t[0] += 3600
cubo.pedir("10.0.1.1")
cubo.pedir("10.0.1.2")
check("barre las IPs olvidadas: la memoria no crece con IPs falsas", len(cubo._cubos) <= 10, True)

print("\n━━━ La API en producción ━━━")
from fastapi.testclient import TestClient  # noqa: E402
from api.main import app  # noqa: E402

c = TestClient(app)
IP = iter(f"203.0.113.{i}" for i in range(1, 250))


def get(path, ip=None, **k):
    """Cada llamada con una IP propia salvo que se pida una: así el límite de
    5 por minuto no se mezcla con las comprobaciones que no son de límite."""
    headers = {"X-Forwarded-For": ip or next(IP), **k.pop("headers", {})}
    return c.get(path, headers=headers, **k)


check("/docs no se publica", get("/docs").status_code, 404)
check("/openapi.json no se publica", get("/openapi.json").status_code, 404)

h = get("/health").json()
check("/health sin clave: solo 'ok'", h, {"status": "ok"})
h = get("/health", headers={"X-Clave-Diagnostico": CLAVE}).json()
check("/health con la clave: el diagnóstico completo", sorted(h), sorted(["status", "records", "flat_tables", "game_level", "ingest_hints"]))
h = get("/health", headers={"X-Clave-Diagnostico": CLAVE[:-1] + "x"}).json()
check("/health con una clave equivocada: solo 'ok'", h, {"status": "ok"})
check("/live/status sin clave: solo si el poller corre", get("/live/status").json(), {"poller_running": False})
check("/live/status con la clave: el detalle",
      "tracked_game_pks" in get("/live/status", headers={"X-Clave-Diagnostico": CLAVE}).json(), True)

r = get("/seasons", headers={"Origin": "https://deportiv.do"})
check("CORS: un origen permitido recibe su cabecera", r.headers.get("access-control-allow-origin"), "https://deportiv.do")
r = get("/seasons", headers={"Origin": "https://www.deportiv.do"})
check("CORS: el origen configurado con barra final también", r.headers.get("access-control-allow-origin"), "https://www.deportiv.do")
r = get("/seasons", headers={"Origin": "https://pagina-ajena.com"})
check("CORS: un origen ajeno no la recibe", r.headers.get("access-control-allow-origin"), None)

r = get("/seasons")
check("cabecera nosniff", r.headers.get("x-content-type-options"), "nosniff")
check("cabecera sin Referer", r.headers.get("referrer-policy"), "no-referrer")
check("cabecera no enmarcable", r.headers.get("x-frame-options"), "DENY")

print("\n━━━ Límite por IP (5 por minuto en esta prueba) ━━━")
codigos = [get("/seasons", ip="198.51.100.7").status_code for _ in range(5)]
check("las 5 primeras pasan", codigos, [200] * 5)
r = get("/seasons", ip="198.51.100.7")
check("la sexta: 429", r.status_code, 429)
check("con Retry-After", int(r.headers.get("retry-after", "0")) >= 1, True)
check("y un mensaje en JSON", "Demasiadas peticiones" in r.json().get("detail", ""), True)
check("el 429 también lleva nosniff", r.headers.get("x-content-type-options"), "nosniff")
r = get("/seasons", ip="198.51.100.7", headers={"Origin": "https://deportiv.do"})
check("el 429 lleva CORS: el navegador ve 'espera', no un error de CORS",
      (r.status_code, r.headers.get("access-control-allow-origin")), (429, "https://deportiv.do"))
check("/health no cuenta para el límite (monitores)", get("/health", ip="198.51.100.7").status_code, 200)
check("otra IP no se ve afectada", get("/seasons", ip="198.51.100.8").status_code, 200)
r = c.get("/seasons", headers={"X-Forwarded-For": "198.51.100.7, 10.0.0.1"})
check("detrás de un proxy manda el PRIMER X-Forwarded-For", r.status_code, 429)
# El servidor de Next arma las páginas de TODOS los visitantes desde una IP.
codigos = {get("/seasons", ip="192.0.2.50", headers={"X-Clave-Servidor": SERVIDOR}).status_code
           for _ in range(20)}
check("el servidor de la web con su clave no tiene límite (20 seguidas)", codigos, {200})
codigos = [get("/seasons", ip="192.0.2.51", headers={"X-Clave-Servidor": SERVIDOR[:-1] + "x"}).status_code
           for _ in range(6)]
check("con una clave de servidor equivocada sí cuenta", codigos[-1], 429)
check("la clave de servidor no abre el diagnóstico",
      get("/health", headers={"X-Clave-Servidor": SERVIDOR}).json(), {"status": "ok"})

print("\n━━━ Parámetros acotados ━━━")
check("limit negativo: 422 (en SQLite LIMIT -1 es la tabla entera)", get("/batting?limit=-1").status_code, 422)
check("limit 0: 422", get("/games?limit=0").status_code, 422)
check("búsqueda de más de 60 letras: 422", get("/players/search?q=" + "a" * 61).status_code, 422)
# Una búsqueda normal pasa la validación: 200 si hay jugadores con ese nombre y
# 404 si no hay (en CI la base está vacía). Lo que no puede dar es 422 ni 429.
check("búsqueda normal: la seguridad no la rechaza",
      get("/players/search?q=munguia").status_code in (200, 404), True)

print()
if fails:
    print(f"❌ {len(fails)} comprobaciones fallaron: {fails}")
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
