"""
inspect_boxscore.py — Inspecciona la estructura del endpoint /boxscore.

USO:
    python inspect_boxscore.py <gamePk>

Ejemplo:
    python inspect_boxscore.py 778293

Imprime las claves principales del JSON y muestra una línea de bateo
y una de pitcheo de muestra para entender el shape exacto del response.
"""

import json
import sys

from src.clients.mlb_api import MLBAPIClient

if len(sys.argv) < 2:
    print("❌ Falta argumento gamePk")
    print("Uso: python inspect_boxscore.py <gamePk>")
    sys.exit(1)

game_pk = int(sys.argv[1])

with MLBAPIClient() as client:
    bs = client.get_boxscore(game_pk)

print(f"📦 Boxscore del juego {game_pk}")
print(f"   Top-level keys: {list(bs.keys())}\n")

# Estructura típica MLB: bs['teams']['home'/'away']['players'] = dict por player_id
teams = bs.get("teams", {})
if not teams:
    print("⚠️ No hay 'teams' en el response. Estructura inesperada.")
    print(json.dumps(bs, indent=2)[:2000])
    sys.exit(0)

print(f"   Keys dentro de 'teams': {list(teams.keys())}\n")

for side in ("home", "away"):
    side_data = teams.get(side, {})
    team_info = side_data.get("team", {})
    team_name = team_info.get("name", "???")
    players = side_data.get("players", {})

    print(f"━━━ {side.upper()} → {team_name} ━━━")
    print(f"   Keys del lado: {list(side_data.keys())}")
    print(f"   Total players en el roster del juego: {len(players)}")

    if not players:
        continue

    # Tomar el primer jugador como muestra
    first_player_key = next(iter(players))
    first_player = players[first_player_key]

    print(f"\n   📊 MUESTRA jugador ({first_player_key}):")
    print(f"      Top keys: {list(first_player.keys())}")

    person = first_player.get("person", {})
    print(f"      person: id={person.get('id')}, name={person.get('fullName')}")

    position = first_player.get("position", {})
    print(f"      position: {position.get('abbreviation')} ({position.get('name')})")

    stats = first_player.get("stats", {})
    print(f"      stats keys: {list(stats.keys())}")

    # Imprimir stats de batting si existen
    batting = stats.get("batting", {})
    if batting:
        print(f"\n      🏏 batting stats (primeras 10 keys):")
        for k, v in list(batting.items())[:10]:
            print(f"         {k}: {v}")

    # Imprimir stats de pitching si existen
    pitching = stats.get("pitching", {})
    if pitching:
        print(f"\n      ⚾ pitching stats (primeras 10 keys):")
        for k, v in list(pitching.items())[:10]:
            print(f"         {k}: {v}")

    print()

# Bonus: ¿qué otras secciones interesantes hay en el boxscore?
print("\n" + "─" * 70)
print("📋 Otras secciones disponibles del boxscore:")
print("─" * 70)
for key in bs.keys():
    if key != "teams":
        value = bs[key]
        if isinstance(value, list):
            print(f"   {key}: lista con {len(value)} elementos")
        elif isinstance(value, dict):
            print(f"   {key}: dict con keys {list(value.keys())[:5]}")
        else:
            print(f"   {key}: {type(value).__name__}")