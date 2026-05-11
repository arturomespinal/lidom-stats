"""
inspect_schedule.py — Inspecciona la estructura del endpoint /schedule.

Imprime:
  - Total de juegos de la temporada regular 2024-25 LIDOM
  - El primer gamePk encontrado (para usarlo después en /boxscore)
  - Los primeros 1500 chars del JSON para entender estructura
"""

import json

from src.clients.mlb_api import MLBAPIClient

with MLBAPIClient() as client:
    resp = client.get_schedule(season="2025", game_type="R")

# El response de /schedule viene anidado:
# { "dates": [ { "date": "2024-10-15", "games": [...] }, ... ] }
games = []
for date_entry in resp.get("dates", []):
    games.extend(date_entry.get("games", []))

print(f"📅 Total juegos temporada regular 2024-25: {len(games)}")
print(f"🔢 totalGames del response: {resp.get('totalGames')}")
print(f"🔢 totalItems del response: {resp.get('totalItems')}")

if games:
    first = games[0]
    print(f"\n🎯 Primer gamePk encontrado: {first.get('gamePk')}")
    print(f"   Fecha: {first.get('gameDate')}")
    print(f"   Estado: {first.get('status', {}).get('detailedState')}")

    # Equipos
    teams = first.get("teams", {})
    home = teams.get("home", {}).get("team", {})
    away = teams.get("away", {}).get("team", {})
    print(f"   {away.get('name')} @ {home.get('name')}")

    # Score si está finalizado
    home_score = teams.get("home", {}).get("score")
    away_score = teams.get("away", {}).get("score")
    if home_score is not None:
        print(f"   Score: {away.get('name')} {away_score} - {home_score} {home.get('name')}")

print("\n" + "─" * 70)
print("📋 Estructura cruda del primer juego (primeros 1500 chars):")
print("─" * 70)
print(json.dumps(games[0] if games else {}, indent=2, ensure_ascii=False)[:1500])