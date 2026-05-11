"""
verify_api.py — Smoke test contra la MLB Stats API real.

Ejecuta un solo request al endpoint de hitting stats de LIDOM 2025
y muestra los 10 mejores bateadores. Si esto funciona, el pipeline
completo (cliente → API → Pydantic → datos tipados) está OK.
"""

from src.clients.mlb_api import MLBAPIClient
from src.constants import LIDOM_TEAMS

print("🔌 Conectando a MLB Stats API...")

with MLBAPIClient() as client:
    response = client.get_hitting_stats(season="2025")

splits = response.all_splits()
print(f"✅ Recibí {len(splits)} jugadores con stats de LIDOM 2025\n")

print(f"{'#':>3} {'Jugador':<25} {'Equipo':<22} {'AVG':>5} {'OBP':>5} {'SLG':>5} {'OPS':>5} {'HR':>3}")
print("─" * 78)

for split in splits[:10]:
    mlb_team_id = split.team.id
    team_code = LIDOM_TEAMS.get(mlb_team_id, {}).get("team_code", "???")
    s = split.stat

    print(
        f"{split.rank or '':>3} "
        f"{split.player.fullName:<25} "
        f"{team_code:<3} {split.team.name:<18} "
        f"{s.avg or 0:>5.3f} {s.obp or 0:>5.3f} {s.slg or 0:>5.3f} {s.ops or 0:>5.3f} "
        f"{s.homeRuns:>3}"
    )

print(f"\n💡 La API tardó muy poco. ¿Cuántos requests crees que podemos hacer por hora?")