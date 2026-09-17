"""
capture_gumbo.py — Captura instantáneas reales del feed en vivo para desarrollo.

La API de MLB guarda el estado del juego en cada momento de la transmisión.
/feed/live/timestamps devuelve todas las marcas, y /feed/live?timecode=X
devuelve el juego TAL COMO SE VEÍA en ese instante. Eso permite desarrollar y
probar el motor en vivo fuera de temporada, reproduciendo juegos terminados.

Este script baja un puñado de instantáneas repartidas a lo largo de un juego y
las guarda en fixtures/, para escribir el parser contra la estructura real en
vez de adivinarla.

USO:
    python capture_gumbo.py                # juego por defecto (826343)
    python capture_gumbo.py 826369 12      # otro juego, 12 instantáneas
"""

import json
import os
import sys

import httpx

BASE = "https://statsapi.mlb.com/api/v1.1"
OUT = "fixtures"

game_pk = int(sys.argv[1]) if len(sys.argv) > 1 else 826343
n_snapshots = int(sys.argv[2]) if len(sys.argv) > 2 else 10

os.makedirs(OUT, exist_ok=True)

with httpx.Client(timeout=60.0, headers={"User-Agent": "LIDOM-Stats/0.1"}) as client:
    print(f"Juego {game_pk}")

    r = client.get(f"{BASE}/game/{game_pk}/feed/live/timestamps")
    r.raise_for_status()
    stamps = r.json()
    print(f"  {len(stamps)} marcas de tiempo, de {stamps[0]} a {stamps[-1]}")

    with open(f"{OUT}/{game_pk}_timestamps.json", "w", encoding="utf-8") as f:
        json.dump(stamps, f)

    # Repartidas a lo largo del juego: el arranque, el desarrollo y el final.
    # El estado interesante (corredores, cuenta, cambios de entrada) aparece
    # a mitad, no en los extremos.
    step = max(1, len(stamps) // (n_snapshots - 1))
    picked = stamps[::step][: n_snapshots - 1] + [stamps[-1]]

    total = 0
    for i, ts in enumerate(picked):
        r = client.get(f"{BASE}/game/{game_pk}/feed/live", params={"timecode": ts})
        r.raise_for_status()
        data = r.json()

        path = f"{OUT}/{game_pk}_{ts}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        size = os.path.getsize(path)
        total += size

        ls = data.get("liveData", {}).get("linescore", {})
        state = data.get("gameData", {}).get("status", {}).get("detailedState")
        print(f"  [{i + 1}/{len(picked)}] {ts}  {state:12} "
              f"inn={ls.get('currentInning')} {ls.get('inningState', ''):6} "
              f"outs={ls.get('outs')} "
              f"{ls.get('teams', {}).get('away', {}).get('runs')}-"
              f"{ls.get('teams', {}).get('home', {}).get('runs')}  "
              f"({size // 1024} KB)")

    # El estado final sin timecode, que es lo que devuelve un juego terminado.
    r = client.get(f"{BASE}/game/{game_pk}/feed/live")
    r.raise_for_status()
    with open(f"{OUT}/{game_pk}_final.json", "w", encoding="utf-8") as f:
        json.dump(r.json(), f)

    print(f"\n✅ Guardado en {OUT}/ — {total // 1024} KB en total")
    print("   Avísame y las recojo.")
