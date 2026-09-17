"""
replay_game.py — Reproduce un juego terminado como si estuviera en vivo.

La API conserva una instantánea del estado por cada actualización de la
transmisión, y /feed/live?timecode=X devuelve el juego tal como se veía en ese
instante. Recorriendo esas marcas en orden se reproduce el juego completo, lo
que permite desarrollar y probar el motor en vivo fuera de temporada, de forma
determinista y repetible.

USO:
    python replay_game.py                      # juego inaugural, 1 de cada 10 marcas
    python replay_game.py 826369               # otro juego
    python replay_game.py 826343 --step 1      # todas las marcas (lento)
    python replay_game.py 826343 --delay 0.5   # pausa entre cuadros, para verlo correr

Imprime solo cuando el estado CAMBIA: así se ve la narrativa del juego en vez
de cientos de líneas repetidas.
"""

import argparse
import time

from src.clients.mlb_api import MLBAPIClient
from src.live.gumbo import parse_live_feed

parser = argparse.ArgumentParser(description="Reproduce un juego terminado como si fuera en vivo")
parser.add_argument("game_pk", nargs="?", type=int, default=826343)
parser.add_argument("--step", type=int, default=10,
                    help="Usa 1 de cada N marcas de tiempo (default 10)")
parser.add_argument("--delay", type=float, default=0.0,
                    help="Segundos de pausa entre cuadros")
parser.add_argument("--limit", type=int, default=None,
                    help="Corta tras N cuadros")
args = parser.parse_args()

with MLBAPIClient() as client:
    stamps = client.get_live_timestamps(args.game_pk)
    print(f"Juego {args.game_pk}: {len(stamps)} marcas de tiempo")

    picked = stamps[:: args.step]
    if args.limit:
        picked = picked[: args.limit]
    print(f"Reproduciendo {len(picked)} cuadros (1 de cada {args.step})\n")

    previous = None
    shown = 0

    for ts in picked:
        state = parse_live_feed(client.get_live_feed(args.game_pk, timecode=ts))

        # La huella de lo que le importa a un marcador. Si no cambió, el cuadro
        # no aporta nada y no se imprime.
        fingerprint = (
            state.status, state.inning, state.inning_half, state.outs,
            state.balls, state.strikes, state.home.runs, state.away.runs,
            state.runners.state_code, state.batter, state.pitcher,
        )
        if fingerprint == previous:
            continue
        previous = fingerprint
        shown += 1

        anotacion = "  ⚾" if state.last_play_is_scoring else ""
        print(f"{state.timestamp}  {state.score_line}")
        print(f"    {state.situation}{anotacion}")
        if state.batter and state.status == "live":
            print(f"    al bate: {state.batter}  ·  lanza: {state.pitcher}")
        if state.last_play:
            print(f"    {state.last_play}")
        print()

        if args.delay:
            time.sleep(args.delay)

    final = parse_live_feed(client.get_live_feed(args.game_pk))
    print("─" * 70)
    print(f"FINAL: {final.score_line}   ({shown} cambios de estado en {len(picked)} cuadros)")
    if final.decisions:
        print(f"  Ganó: {final.decisions.winner}   Perdió: {final.decisions.loser}"
              + (f"   Salvó: {final.decisions.save}" if final.decisions.save else ""))
    print("  Línea por entradas:")
    linea_a = " ".join(f"{i.away_runs if i.away_runs is not None else '-':>2}" for i in final.line_score)
    linea_h = " ".join(f"{i.home_runs if i.home_runs is not None else '-':>2}" for i in final.line_score)
    print(f"    {final.away.team_code}  {linea_a}  │ {final.away.runs:>2} {final.away.hits:>2} {final.away.errors:>2}")
    print(f"    {final.home.team_code}  {linea_h}  │ {final.home.runs:>2} {final.home.hits:>2} {final.home.errors:>2}")
