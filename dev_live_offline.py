"""
dev_live_offline.py — Levanta la API con un juego ya cargado en la caché en
vivo, a partir de las capturas GUMBO de fixtures/. Sin red.

Para qué sirve: trabajar en la pantalla de juego (marcador, relato, franja de
probabilidad) fuera de temporada o sin conexión. `replay_game.py` y
LIDOM_LIVE_REPLAY reproducen un juego contra la MLB API real — necesitan red y
van al ritmo de la transmisión. Esto no: carga las instantáneas que
`capture_gumbo.py` ya dejó en disco, en orden, por el MISMO camino que usa el
poller (parse_live_feed → store.update), y levanta uvicorn con la caché llena.

    python dev_live_offline.py                    # juego 826343, hasta el final
    python dev_live_offline.py 826343 --hasta 5   # solo 5 instantáneas: EN VIVO
    python dev_live_offline.py --host 0.0.0.0     # para probar desde el TELÉFONO

Por defecto escucha solo en 127.0.0.1, que alcanza para la web en la misma
máquina. El teléfono con Expo Go llega por la IP de la red WiFi
(mobile/src/config.ts), y a 127.0.0.1 no puede: para él hace falta
`--host 0.0.0.0`, que abre la API a la red local mientras corre.

Con --hasta el juego queda a medias y la pantalla se ve EN VIVO, con la
probabilidad actual. Sin él se aplican todas y se cierra con store.drop(),
igual que el poller al llegar a final: la curva termina en el 100% real y el
detalle queda congelado.

La densidad de la curva es la de las capturas, no la de un juego real: diez
instantáneas dan unos ocho puntos, contra los 40-80 que el poller acumula
sondeando cada diez segundos. La forma es real; la resolución, no.
"""

from __future__ import annotations

import argparse
import glob
import json
import sys

from src.live.gumbo import parse_live_feed
from src.live.store import store


def sembrar(game_pk: int, hasta: int | None) -> None:
    # `{pk}_2*.json` y no `{pk}_*.json`: en fixtures/ también vive
    # `{pk}_timestamps.json`, que es una LISTA de marcas y no un feed.
    archivos = sorted(glob.glob(f"fixtures/{game_pk}_2*.json"))
    if not archivos:
        sys.exit(
            f"No hay capturas de {game_pk} en fixtures/. "
            f"Corre antes: python capture_gumbo.py"
        )
    if hasta is not None:
        archivos = archivos[:hasta]

    estado = None
    for ruta in archivos:
        with open(ruta, encoding="utf-8") as f:
            doc = json.load(f)
        estado = parse_live_feed(doc)
        store.update(estado.game_pk, doc, estado)

    if estado and estado.status == "final" and hasta is None:
        store.drop(estado.game_pk)

    puntos = len(store.win_prob_track(game_pk))
    print(
        f"  {len(archivos)} instantáneas → {estado.away.team_code} {estado.away.runs}"
        f"–{estado.home.runs} {estado.home.team_code} ({estado.status}), "
        f"{puntos} puntos de probabilidad"
    )
    print(f"  Web: http://localhost:3000/live/{game_pk}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("game_pk", nargs="?", type=int, default=826343)
    ap.add_argument("--hasta", type=int, default=None,
                    help="aplicar solo las N primeras instantáneas (juego en vivo)")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1",
                    help="0.0.0.0 para que llegue el teléfono por la red WiFi")
    args = ap.parse_args()

    sembrar(args.game_pk, args.hasta)

    # Se importa DESPUÉS de sembrar a propósito: la app comparte el `store`
    # de módulo, así que lo que se cargó arriba es lo que va a servir. El
    # poller no arranca — LIDOM_LIVE_POLLER no está puesto — y nadie pisa la
    # caché sembrada.
    import uvicorn
    from api.main import app

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
