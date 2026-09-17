"""
capture_diffs.py — Captura una cadena real de parches del feed en vivo.

El feed completo pesa ~1 MB. Sondear tres juegos cada 10 segundos sería
18 MB por minuto, así que el poller debe usar /feed/live/diffPatch, que
devuelve solo los cambios en formato RFC 6902 (JSON Patch).

Este script guarda:
    - el feed COMPLETO en una marca de tiempo (la base)
    - los parches de cada paso siguiente
    - el feed COMPLETO al final de la cadena (la verdad contra la que comparar)

Con eso se puede verificar lo único que importa: que aplicar los parches en
secuencia sobre la base reproduzca exactamente el feed completo final. Si eso
se cumple, el poller puede confiar en los parches.

USO:
    python capture_diffs.py                 # juego por defecto, 12 pasos
    python capture_diffs.py 826343 20 400   # juego, pasos, índice de arranque
"""

import json
import os
import sys

import httpx

BASE = "https://statsapi.mlb.com/api/v1.1"
OUT = "fixtures"

game_pk = int(sys.argv[1]) if len(sys.argv) > 1 else 826343
steps = int(sys.argv[2]) if len(sys.argv) > 2 else 12
start_index = int(sys.argv[3]) if len(sys.argv) > 3 else 190

os.makedirs(OUT, exist_ok=True)

with httpx.Client(timeout=60.0, headers={"User-Agent": "LIDOM-Stats/0.1"}) as client:
    stamps = client.get(f"{BASE}/game/{game_pk}/feed/live/timestamps").json()
    chain = stamps[start_index : start_index + steps + 1]
    if len(chain) < 2:
        print(f"❌ El índice {start_index} deja menos de 2 marcas (hay {len(stamps)})")
        sys.exit(1)

    print(f"Juego {game_pk}: cadena de {len(chain)} marcas desde {chain[0]}")

    # Base: el feed completo en la primera marca de la cadena.
    base = client.get(f"{BASE}/game/{game_pk}/feed/live",
                      params={"timecode": chain[0]}).json()
    with open(f"{OUT}/diff_base.json", "w", encoding="utf-8") as f:
        json.dump(base, f)
    base_kb = os.path.getsize(f"{OUT}/diff_base.json") // 1024
    print(f"  base completa: {base_kb} KB")

    # Los parches de cada paso.
    diffs = []
    total_diff = 0
    for a, b in zip(chain, chain[1:]):
        r = client.get(f"{BASE}/game/{game_pk}/feed/live/diffPatch",
                       params={"startTimecode": a, "endTimecode": b})
        payload = r.json()
        diffs.append({"start": a, "end": b, "payload": payload})

        size = len(r.content)
        total_diff += size
        n_ops = sum(len(d.get("diff", [])) for d in payload) if isinstance(payload, list) else -1
        print(f"  {a} → {b}: {n_ops:>3} operaciones, {size:>6} bytes")

    with open(f"{OUT}/diff_chain.json", "w", encoding="utf-8") as f:
        json.dump(diffs, f)

    # La verdad: el feed completo al final de la cadena.
    final = client.get(f"{BASE}/game/{game_pk}/feed/live",
                       params={"timecode": chain[-1]}).json()
    with open(f"{OUT}/diff_target.json", "w", encoding="utf-8") as f:
        json.dump(final, f)

    print(f"\n  {len(diffs)} pasos por parche: {total_diff // 1024} KB en total")
    print(f"  los mismos {len(diffs)} pasos por feed completo: ~{base_kb * len(diffs)} KB")
    if total_diff:
        print(f"  → los parches ahorran {(base_kb * 1024 * len(diffs)) / total_diff:.0f}× de ancho de banda")
    print("\n✅ Guardado. Avísame y lo recojo.")
