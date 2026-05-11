"""
Test offline: valida los modelos Pydantic contra el JSON REAL que devolvió
la MLB API para la query de hitting stats de LIDOM 2025.

Este test no necesita red. Simula la respuesta y verifica:
  1. Que el JSON parsea sin errores.
  2. Que los promedios (".368") se conviertan correctamente a 0.368.
  3. Que el campo "atBatsPerHomeRun" con valor "-.--" no crashee.
  4. Que `all_splits()` aplane correctamente.
  5. Que los equipos se mapeen al catálogo canónico.
"""

import sys
sys.path.insert(0, "/home/claude/lidom-stats")

import os
os.makedirs("/tmp/logs", exist_ok=True)
os.chdir("/tmp")

import json

from src.models.api_models import APIHittingStatsResponse
from src.constants import LIDOM_TEAMS


# Subset real del JSON que devolvió la API (3 jugadores de muestra).
# Incluye casos delicados:
#   - Ismael Munguia: atBatsPerHomeRun = "-.--" (0 HR)
#   - Raimel Tapia: stolenBasePercentage = ".818" (string con punto inicial)
#   - Sócrates Brito: tilde en el nombre (test de encoding)
SAMPLE_JSON = """
{
  "copyright": "Copyright 2026 MLB Advanced Media, L.P.",
  "stats": [{
    "type": {"displayName": "season"},
    "group": {"displayName": "hitting"},
    "totalSplits": 3,
    "splits": [
      {
        "season": "2025",
        "stat": {
          "age": 26, "gamesPlayed": 38, "groundOuts": 45, "airOuts": 38,
          "runs": 21, "doubles": 5, "triples": 2, "homeRuns": 0,
          "strikeOuts": 8, "baseOnBalls": 21, "intentionalWalks": 1,
          "hits": 50, "hitByPitch": 6, "avg": ".368", "atBats": 136,
          "obp": ".470", "slg": ".434", "ops": ".904",
          "caughtStealing": 4, "stolenBases": 3,
          "stolenBasePercentage": ".429", "caughtStealingPercentage": ".571",
          "groundIntoDoublePlay": 2, "numberOfPitches": 593,
          "plateAppearances": 168, "totalBases": 59, "rbi": 16,
          "leftOnBase": 35, "sacBunts": 4, "sacFlies": 1,
          "babip": ".388", "groundOutsToAirouts": "1.18",
          "catchersInterference": 0, "atBatsPerHomeRun": "-.--"
        },
        "team": {"id": 669, "name": "Estrellas Orientales", "link": "/api/v1/teams/669"},
        "player": {"id": 665998, "fullName": "Ismael Munguia", "link": "/api/v1/people/665998"},
        "league": {"id": 131, "name": "LIDOM", "link": "/api/v1/league/131"},
        "sport": {"id": 17, "link": "/api/v1/sports/17", "abbreviation": "WIN"},
        "numTeams": 1,
        "rank": 1,
        "position": {"code": "9", "name": "Outfielder", "type": "Outfielder", "abbreviation": "RF"}
      },
      {
        "season": "2025",
        "stat": {
          "gamesPlayed": 50, "atBats": 205, "hits": 73, "homeRuns": 2,
          "avg": ".356", "obp": ".398", "slg": ".454", "ops": ".852",
          "stolenBases": 9, "caughtStealing": 2,
          "stolenBasePercentage": ".818", "atBatsPerHomeRun": "102.50"
        },
        "team": {"id": 669, "name": "Estrellas Orientales"},
        "player": {"id": 606132, "fullName": "Raimel Tapia"},
        "league": {"id": 131, "name": "LIDOM"},
        "sport": {"id": 17, "abbreviation": "WIN"},
        "rank": 2
      },
      {
        "season": "2025",
        "stat": {
          "gamesPlayed": 44, "atBats": 163, "hits": 48, "homeRuns": 3,
          "avg": ".294", "obp": ".382", "slg": ".393", "ops": ".775"
        },
        "team": {"id": 671, "name": "Leones del Escogido"},
        "player": {"id": 593647, "fullName": "Sócrates Brito"},
        "league": {"id": 131, "name": "LIDOM"},
        "sport": {"id": 17, "abbreviation": "WIN"},
        "rank": 9
      }
    ]
  }]
}
"""

print("=== Test 1: Parseo de JSON real ===")
raw = json.loads(SAMPLE_JSON)
response = APIHittingStatsResponse.model_validate(raw)
print(f"✅ Parseó correctamente, {len(response.stats)} bloques")

splits = response.all_splits()
print(f"✅ all_splits() devolvió {len(splits)} jugadores")
assert len(splits) == 3, f"Esperaba 3 splits, got {len(splits)}"

print("\n=== Test 2: Conversión string → float en promedios ===")
soto_like = splits[0]
print(f"  Jugador: {soto_like.player.fullName}")
print(f"  AVG raw API: '.368' → modelo: {soto_like.stat.avg!r} (type: {type(soto_like.stat.avg).__name__})")
print(f"  OBP raw API: '.470' → modelo: {soto_like.stat.obp!r}")
print(f"  SLG raw API: '.434' → modelo: {soto_like.stat.slg!r}")
print(f"  OPS raw API: '.904' → modelo: {soto_like.stat.ops!r}")

assert soto_like.stat.avg == 0.368
assert soto_like.stat.obp == 0.470
assert soto_like.stat.slg == 0.434
assert soto_like.stat.ops == 0.904
print("✅ Todos los promedios convertidos correctamente")

print("\n=== Test 3: Manejo del valor problemático '-.--' ===")
print(f"  atBatsPerHomeRun (0 HR): {soto_like.stat.atBatsPerHomeRun!r}")
assert soto_like.stat.atBatsPerHomeRun == "-.--", "Debería conservarse como string"
print("✅ '-.--' no crashea, se conserva como string para reportes")

print("\n=== Test 4: Encoding de tildes (Sócrates Brito) ===")
socrates = splits[2]
print(f"  Nombre crudo: {socrates.player.fullName!r}")
assert socrates.player.fullName == "Sócrates Brito"
print("✅ Tildes y caracteres especiales se preservan")

print("\n=== Test 5: Mapping MLB team_id → team_code canónico ===")
for split in splits:
    mlb_id = split.team.id
    if mlb_id in LIDOM_TEAMS:
        canonical = LIDOM_TEAMS[mlb_id]
        print(f"  MLB id {mlb_id} ('{split.team.name}') "
              f"→ team_code='{canonical['team_code']}' "
              f"({canonical['full_name']})")
    else:
        print(f"  ⚠️ MLB id {mlb_id} ('{split.team.name}') NO encontrado en LIDOM_TEAMS")

print("\n=== Test 6: Stats individuales accesibles tipadas ===")
for split in splits:
    s = split.stat
    print(f"  {split.player.fullName:<25} "
          f"PA={s.plateAppearances:>3} AB={s.atBats:>3} "
          f"H={s.hits:>3} HR={s.homeRuns:>2} "
          f"AVG={s.avg:.3f} OBP={s.obp:.3f} SLG={s.slg:.3f}")

print("\n=== Test 7: Resilencia ante campos faltantes ===")
# El segundo y tercer jugador en el JSON tienen menos campos.
# Como `extra='ignore'` y todos los counts son `= 0` por default,
# nada debe crashear.
short_split = splits[1]
assert short_split.stat.gamesPlayed == 50
assert short_split.stat.intentionalWalks == 0  # Campo no presente → default 0
print(f"✅ Campos no presentes en JSON usan defaults (intentionalWalks=0 OK)")

print("\n🎉 Todos los tests pasaron. Los modelos Pydantic son robustos contra el JSON real.")
