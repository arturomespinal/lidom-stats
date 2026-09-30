"""
Seguridad de la API antes de desplegarla.

── Qué se protege y qué no ──────────────────────────────────────────────────
La API es de SOLO LECTURA (todas las rutas son GET) y sirve datos públicos:
marcadores y estadísticas. No hay cuentas ni nada que escribir, así que no hay
"login" que poner. Lo que sí hay que cuidar al ponerla en internet:

1. **Que nadie la tumbe o la vacíe a golpes.** Límite de peticiones por IP
   (`LimiteDeTasa`). Es lo que de verdad frena a un scraper o a un bucle mal
   hecho, y además protege la cuota que usamos contra la MLB.
2. **Que un navegador no la use desde cualquier página.** CORS con los
   orígenes de la configuración (`LIDOM_CORS_ORIGINS`), nunca "*" en
   producción.
3. **Que no cuente sus tripas.** `/health` y `/live/status` decían cuántas
   filas tiene cada tabla, qué juegos sigue el poller y cómo ingestar. En
   producción eso solo sale con la clave de diagnóstico
   (`LIDOM_CLAVE_DIAGNOSTICO`, cabecera `X-Clave-Diagnostico`); sin ella,
   `/health` responde `{"status": "ok"}` y nada más. Tampoco se publica la
   documentación interactiva (`/docs`, `/redoc`, `/openapi.json`).
4. **Cabeceras de seguridad** en todas las respuestas (`nosniff`, sin
   `Referer`, no enmarcable).

── Por qué NO hay una clave de API en las apps ───────────────────────────────
Una clave metida en la app del teléfono o en la web no es secreta: se saca del
binario o de las herramientas del navegador en un minuto, y el `EventSource`
del en vivo ni siquiera puede mandar cabeceras. Daría sensación de seguridad
sin darla. El control real para una API pública de lectura es el límite por
IP. Si un día hace falta distinguir clientes de verdad (una app de terceros,
un plan de pago), el camino es un token firmado de corta vida que emita un
servidor nuestro — no una clave fija repartida en las apps.

── Configuración (variables de entorno) ──────────────────────────────────────
    LIDOM_ENTORNO             "produccion" activa todo lo de arriba. Cualquier
                              otro valor (o nada) es desarrollo: CORS a
                              localhost:3000, diagnóstico abierto, /docs.
    LIDOM_CORS_ORIGINS        Orígenes permitidos, separados por comas.
                              Obligatorio en producción.
    LIDOM_LIMITE_POR_MINUTO   Peticiones por IP y minuto. En producción, 300
                              por defecto. No más bajo: en RD las redes
                              móviles comparten una IP pública entre muchos
                              clientes (CGNAT), y una persona con la app
                              abierta en un juego en vivo ya hace ~10 por
                              minuto. En desarrollo está apagado (0) salvo que
                              se ponga: las suites hacen cientos de peticiones
                              seguidas desde la misma "IP".
    LIDOM_CONFIAR_PROXY       "1" si la API va detrás de un proxy (Nginx,
                              Cloudflare, Render…): entonces la IP del cliente
                              sale de X-Forwarded-For. Sin proxy NO activarlo:
                              cualquiera podría inventarse la cabecera y
                              saltarse el límite.
    LIDOM_CLAVE_DIAGNOSTICO   Clave para ver /health completo y /live/status en
                              producción. Mínimo 24 caracteres. Vive solo en
                              el servidor; nunca en las apps.
    LIDOM_CLAVE_SERVIDOR      Clave del servidor de la web (Next.js), cabecera
                              X-Clave-Servidor. Las páginas se arman en ESE
                              servidor, así que todas sus peticiones llegan
                              desde una sola IP: sin esta clave, el límite
                              por minuto sería para toda la web junta. Con
                              ella esas peticiones no cuentan. Mínimo 24
                              caracteres; en la web va en una variable SIN el
                              prefijo NEXT_PUBLIC_, que Next nunca manda al
                              navegador.

Una configuración inválida en producción NO arranca: es mejor un error claro
al desplegar que una API abierta sin que nadie lo note.
"""
from __future__ import annotations

import hmac
import json
import os
import threading
import time
from dataclasses import dataclass
from typing import Mapping, Optional

ORIGENES_DESARROLLO = ["http://localhost:3000", "http://127.0.0.1:3000"]
CABECERA_DIAGNOSTICO = "X-Clave-Diagnostico"
CABECERA_SERVIDOR = "x-clave-servidor"

# Rutas que no cuentan para el límite: la sonda de vida (un monitor la pide
# cada minuto y no debe comerse el cupo de nadie).
EXENTAS = {"/health"}


class ConfigInvalida(RuntimeError):
    """La configuración de producción no es segura: la API no arranca."""


@dataclass(frozen=True)
class Config:
    produccion: bool
    cors_origenes: tuple[str, ...]
    limite_por_minuto: int
    confiar_proxy: bool
    clave_diagnostico: Optional[str]
    clave_servidor: Optional[str] = None


def leer_config(env: Mapping[str, str] = os.environ) -> Config:
    entorno = (env.get("LIDOM_ENTORNO") or "desarrollo").strip().lower()
    produccion = entorno in {"produccion", "producción", "production", "prod"}

    origenes = [
        o.strip().rstrip("/")
        for o in (env.get("LIDOM_CORS_ORIGINS") or "").split(",")
        if o.strip()
    ]
    if not origenes:
        if produccion:
            raise ConfigInvalida(
                "En producción LIDOM_CORS_ORIGINS es obligatorio "
                "(ej.: https://deportiv.do,https://www.deportiv.do)."
            )
        origenes = list(ORIGENES_DESARROLLO)
    if produccion and "*" in origenes:
        raise ConfigInvalida("En producción LIDOM_CORS_ORIGINS no puede ser '*'.")

    crudo = (env.get("LIDOM_LIMITE_POR_MINUTO") or ("300" if produccion else "0")).strip()
    try:
        limite = int(crudo)
    except ValueError:
        raise ConfigInvalida(f"LIDOM_LIMITE_POR_MINUTO no es un número: {crudo!r}")
    if limite < 0 or (produccion and limite == 0):
        raise ConfigInvalida(
            "LIDOM_LIMITE_POR_MINUTO tiene que ser mayor que 0 en producción."
        )

    clave = (env.get("LIDOM_CLAVE_DIAGNOSTICO") or "").strip() or None
    if produccion and clave is not None and len(clave) < 24:
        raise ConfigInvalida("LIDOM_CLAVE_DIAGNOSTICO necesita al menos 24 caracteres.")

    servidor = (env.get("LIDOM_CLAVE_SERVIDOR") or "").strip() or None
    if produccion and servidor is not None and len(servidor) < 24:
        raise ConfigInvalida("LIDOM_CLAVE_SERVIDOR necesita al menos 24 caracteres.")
    if servidor is not None and servidor == clave:
        raise ConfigInvalida(
            "LIDOM_CLAVE_SERVIDOR y LIDOM_CLAVE_DIAGNOSTICO tienen que ser distintas."
        )

    return Config(
        produccion=produccion,
        cors_origenes=tuple(origenes),
        limite_por_minuto=limite,
        confiar_proxy=(env.get("LIDOM_CONFIAR_PROXY") or "").strip() == "1",
        clave_diagnostico=clave,
        clave_servidor=servidor,
    )


_config: Optional[Config] = None


def config() -> Config:
    """La configuración de este proceso, leída una vez del entorno."""
    global _config
    if _config is None:
        _config = leer_config()
    return _config


def diagnostico_autorizado(config: Config, cabeceras: Mapping[str, str]) -> bool:
    """
    ¿Puede esta petición ver el diagnóstico interno?

    En desarrollo, siempre. En producción, solo con la clave, comparada en
    tiempo constante (`hmac.compare_digest`) para no filtrarla por lo que tarda
    la respuesta. Sin clave configurada, nunca.
    """
    if not config.produccion:
        return True
    if not config.clave_diagnostico:
        return False
    dada = cabeceras.get(CABECERA_DIAGNOSTICO) or cabeceras.get(CABECERA_DIAGNOSTICO.lower()) or ""
    return hmac.compare_digest(dada.encode(), config.clave_diagnostico.encode())


# ─────────────────────────────────────────────────────────────────────────────


class CuboDeFichas:
    """
    Límite por IP con un cubo de fichas (token bucket).

    Cada IP tiene un cubo de `capacidad` fichas que se rellena a `capacidad`
    por minuto; cada petición gasta una. Deja ráfagas cortas —abrir la app
    dispara cinco o seis peticiones a la vez— y corta el uso sostenido por
    encima del ritmo. Guarda dos números por IP, no una lista de marcas de
    tiempo: la memoria no crece con el tráfico.

    En memoria y por proceso, como la caché en vivo. Con varios workers cada
    uno lleva su cuenta: el límite efectivo se multiplica por los workers.
    Para eso haría falta Redis (ver "Producción" en CLAUDE.md).
    """

    # Por encima de tantas IPs se barren las que llevan rato sin pedir nada,
    # para que un barrido de IPs falsas no llene la memoria.
    MAX_IPS = 50_000

    def __init__(self, por_minuto: int, reloj=time.monotonic):
        self.capacidad = float(por_minuto)
        self.ritmo = por_minuto / 60.0  # fichas por segundo
        self.reloj = reloj
        self._cubos: dict[str, tuple[float, float]] = {}
        self._cerrojo = threading.Lock()

    def pedir(self, ip: str) -> tuple[bool, float]:
        """(permitida, segundos hasta la próxima ficha si no lo está)."""
        ahora = self.reloj()
        with self._cerrojo:
            fichas, antes = self._cubos.get(ip, (self.capacidad, ahora))
            fichas = min(self.capacidad, fichas + (ahora - antes) * self.ritmo)
            if fichas >= 1:
                self._cubos[ip] = (fichas - 1, ahora)
                permitida, espera = True, 0.0
            else:
                self._cubos[ip] = (fichas, ahora)
                permitida, espera = False, (1 - fichas) / self.ritmo
            if len(self._cubos) > self.MAX_IPS:
                self._barrer(ahora)
        return permitida, espera

    def _barrer(self, ahora: float) -> None:
        # Un cubo lleno es igual a no tener cubo: se puede olvidar.
        lleno_en = self.capacidad / self.ritmo
        self._cubos = {
            ip: v for ip, v in self._cubos.items() if ahora - v[1] < lleno_en
        }


CABECERAS_SEGURIDAD = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
]


class Proteccion:
    """
    Middleware ASGI puro: límite por IP y cabeceras de seguridad.

    ASGI puro y no `BaseHTTPMiddleware` a propósito: este último envuelve la
    respuesta y con el flujo SSE del en vivo (una respuesta que no termina)
    se ha comportado mal en varias versiones de Starlette. Aquí solo se mira la
    petición al entrar y se añaden cabeceras al empezar la respuesta.
    """

    def __init__(self, app, config: Config):
        self.app = app
        self.config = config
        self.cubo = CuboDeFichas(config.limite_por_minuto) if config.limite_por_minuto else None

    def es_servidor_web(self, scope) -> bool:
        """La petición viene del servidor de la web con su clave."""
        if not self.config.clave_servidor:
            return False
        for nombre, valor in scope.get("headers", []):
            if nombre == CABECERA_SERVIDOR.encode():
                return hmac.compare_digest(valor, self.config.clave_servidor.encode())
        return False

    def ip_cliente(self, scope) -> str:
        if self.config.confiar_proxy:
            for nombre, valor in scope.get("headers", []):
                if nombre == b"x-forwarded-for":
                    # El primero de la lista es el cliente; los demás, proxies.
                    return valor.decode("latin-1").split(",")[0].strip()
        cliente = scope.get("client")
        return cliente[0] if cliente else "desconocido"

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if (
            self.cubo is not None
            and scope.get("method") != "OPTIONS"
            and scope.get("path") not in EXENTAS
            and not self.es_servidor_web(scope)
        ):
            permitida, espera = self.cubo.pedir(self.ip_cliente(scope))
            if not permitida:
                cuerpo = json.dumps(
                    {"detail": "Demasiadas peticiones. Espera un momento y vuelve a intentar."},
                    ensure_ascii=False,
                ).encode()
                await send({
                    "type": "http.response.start",
                    "status": 429,
                    "headers": [
                        (b"content-type", b"application/json; charset=utf-8"),
                        (b"retry-after", str(max(1, round(espera))).encode()),
                        *CABECERAS_SEGURIDAD,
                    ],
                })
                await send({"type": "http.response.body", "body": cuerpo})
                return

        async def enviar(mensaje):
            if mensaje["type"] == "http.response.start":
                mensaje = dict(mensaje)
                mensaje["headers"] = list(mensaje.get("headers", [])) + CABECERAS_SEGURIDAD
            await send(mensaje)

        await self.app(scope, receive, enviar)
