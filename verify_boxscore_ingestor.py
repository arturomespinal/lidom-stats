"""Prueba de integración del BoxscoreIngestor con un cliente MLB simulado."""
import os, sqlite3, sys
from src.models.database import init_db
from src.models import flat_models  # noqa: F401
import src.pipeline.boxscore_ingestor as bi

DB = "sqlite:///data/test.db"


def game(pk, date_, away_id, home_id, away_s, home_s, state="F", gtype="R"):
    return {
        "gamePk": pk, "gameDate": f"{date_}T23:30:00Z", "officialDate": date_,
        "gameNumber": 1, "gameType": gtype, "scheduledInnings": 9,
        "status": {"codedGameState": state, "detailedState": "Final"},
        "venue": {"name": "Estadio Cibao"},
        "teams": {
            "home": {"team": {"id": home_id}, "score": home_s},
            "away": {"team": {"id": away_id}, "score": away_s},
        },
    }


def batter(pid, order, pos, ab, h, d=0, t=0, hr=0, bb=0, so=0, rbi=0, hbp=0, sf=0):
    return {
        "person": {"id": pid, "fullName": f"Jugador {pid}"},
        "battingOrder": str(order), "position": {"abbreviation": pos},
        "stats": {"batting": {
            "plateAppearances": ab + bb + hbp + sf, "atBats": ab, "runs": 1, "hits": h,
            "doubles": d, "triples": t, "homeRuns": hr, "rbi": rbi, "baseOnBalls": bb,
            "intentionalWalks": 0, "strikeOuts": so, "hitByPitch": hbp, "sacFlies": sf,
            "sacBunts": 0, "stolenBases": 0, "caughtStealing": 0,
            "groundIntoDoublePlay": 0, "leftOnBase": 2,
        }, "pitching": {}},
        "seasonStats": {"batting": {"avg": ".999"}},  # debe ser ignorado
    }


def pitcher(pid, outs, er, h, bb, so, gs=0, w=0, l=0, sv=0, hld=0):
    return {
        "person": {"id": pid, "fullName": f"Lanzador {pid}"},
        "position": {"abbreviation": "P"},
        "stats": {"batting": {}, "pitching": {
            "outs": outs, "gamesStarted": gs, "battersFaced": outs + h + bb,
            "pitchesThrown": outs * 5, "strikes": outs * 3, "hits": h, "runs": er,
            "earnedRuns": er, "homeRuns": 0, "baseOnBalls": bb, "intentionalWalks": 0,
            "strikeOuts": so, "hitBatsmen": 0, "wildPitches": 0, "balks": 0,
            "wins": w, "losses": l, "saves": sv, "holds": hld, "blownSaves": 0,
        }},
        "seasonStats": {"pitching": {"era": "9.99"}},
    }


def side(batters, pitchers):
    players = {f"ID{p['person']['id']}": p for p in batters + pitchers}
    return {"players": players, "pitchers": [p["person"]["id"] for p in pitchers]}


# Juego 1: TOR(668) @ EST(669), 3-5. Juego 2: LIC(672) @ AGU(667), 4-2 en 10 innings.
BOX = {
    826343: {"teams": {
        "home": side([batter(101, 100, "SS", 4, 2, d=1, rbi=2), batter(102, 200, "CF", 3, 1, bb=1)],
                     [pitcher(201, 18, 2, 4, 1, 7, gs=1, w=1), pitcher(202, 9, 1, 2, 0, 3, sv=1)]),
        "away": side([batter(111, 100, "1B", 4, 1), batter(112, 200, "LF", 4, 0, so=2)],
                     [pitcher(211, 15, 4, 6, 2, 4, gs=1, l=1), pitcher(212, 11, 1, 1, 1, 2, hld=1)]),
    }},
    826344: {"teams": {
        "home": side([batter(103, 100, "C", 5, 2, hr=1, rbi=1)],
                     [pitcher(203, 21, 3, 5, 3, 6, gs=1, l=1)]),
        "away": side([batter(101, 100, "SS", 5, 3, t=1, rbi=2)],  # mismo jugador, otro equipo
                     [pitcher(213, 30, 2, 4, 1, 9, gs=1, w=1)]),
    }},
    826347: {"teams": {
        "home": side([batter(112, 100, "LF", 4, 2, rbi=3)],
                     [pitcher(212, 27, 2, 5, 2, 8, gs=1, w=1)]),
        "away": side([batter(111, 100, "1B", 4, 1)],
                     [pitcher(211, 24, 5, 7, 3, 5, gs=1, l=1)]),
    }},
}

PEOPLE = {
    101: ("Ismael Munguía", "1997-06-15", "L", "R", "Nicaragua"),
    102: ("Raimel Tapia", "1994-02-04", "L", "L", "Dominican Republic"),
    103: ("José Manuel Fernández", "1996-04-02", "R", "R", "Dominican Republic"),
    111: ("Luis García Jr.", "2000-01-03", "R", "R", "Dominican Republic"),
    112: ("Manuel Peña", "2003-12-05", "L", "R", "Dominican Republic"),
    201: ("J.C. Mejía", "1996-08-15", "R", "R", "Dominican Republic"),
    202: ("Jorge Tavárez", "1995-05-20", "R", "R", "Dominican Republic"),
    211: ("Patrick Weigel", "1994-07-08", "R", "R", "USA"),
    212: ("Gerson Moreno", "1995-09-01", "R", "R", "Dominican Republic"),
    203: ("Aaron Sánchez", "1992-07-01", "R", "R", "USA"),
    213: ("Cristopher Molina", "1998-03-11", "R", "R", "Dominican Republic"),
}


class FakeClient:
    calls = {"schedule": 0, "boxscore": 0, "people": 0}

    def __enter__(self): return self
    def __exit__(self, *a): return False

    def get_schedule(self, season, game_type=None):
        FakeClient.calls["schedule"] += 1
        return {"dates": [
            {"date": "2025-10-15", "games": [game(826343, "2025-10-15", 668, 669, 3, 5)]},
            {"date": "2025-10-16", "games": [
                game(826344, "2025-10-16", 672, 667, 4, 2),
                # Juego contra un equipo fuera de LIDOM: debe descartarse
                game(826345, "2025-10-16", 999, 667, 1, 0),
                # Colisión de game_id: el juego jugado y su entrada pospuesta
                # comparten fecha y equipos. La pospuesta va DESPUÉS a propósito
                # — con last-write-wins ganaba ella y borraba el marcador.
                game(826347, "2025-10-17", 668, 670, 2, 6),
                game(826346, "2025-10-17", 668, 670, None, None, state="D"),
            ]},
        ]}

    def get_boxscore(self, game_pk):
        FakeClient.calls["boxscore"] += 1
        return BOX[game_pk]

    def get_people(self, person_ids):
        FakeClient.calls["people"] += 1
        out = []
        for pid in person_ids:
            name, bd, bats, throws, country = PEOPLE[pid]
            out.append({"id": pid, "fullName": name, "birthDate": bd,
                        "batSide": {"code": bats}, "pitchHand": {"code": throws},
                        "birthCountry": country, "height": "6' 1\"", "weight": 200})
        return {"people": out}


bi.MLBAPIClient = FakeClient

os.makedirs("data", exist_ok=True)
if os.path.exists("data/test.db"):
    os.remove("data/test.db")
init_db(DB)

print("\n━━━ CORRIDA 1 ━━━")
s1 = bi.BoxscoreIngestor(DB).ingest(season="2025")
print("\n━━━ CORRIDA 2 (idempotencia + checkpoint) ━━━")
s2 = bi.BoxscoreIngestor(DB).ingest(season="2025")

c = sqlite3.connect("data/test.db")
c.row_factory = sqlite3.Row
q = lambda s: c.execute(s).fetchall()
n = lambda t: c.execute(f"select count(*) from {t}").fetchone()[0]

print("\n━━━ RESULTADOS ━━━")
fails = []
def check(label, got, want):
    ok = got == want
    if not ok: fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}: {got}" + ("" if ok else f"  (esperado {want})"))

check("teams", n("teams"), 6)
check("seasons", n("seasons"), 1)
check("games (3 game_id: descarta equipo ajeno, colapsa el duplicado)", n("games"), 3)
check("players", n("players"), 11)
check("batting_lines", n("batting_lines"), 8)
check("pitching_lines", n("pitching_lines"), 8)
check("boxscores pedidos (solo finales, 1 vez)", FakeClient.calls["boxscore"], 3)
check("checkpoint saltó los 3 juegos en la corrida 2", s2["games_skipped"], 3)
check("corrida 2 no escribió líneas nuevas", s2["batting_lines"], 0)
check("players del resumen es distinto, no acumulado", s1["players"], 11)

# La colisión: gana el juego jugado, no la entrada pospuesta que venía después.
dup = q("select * from games where game_id='2025-10-17-TOR-GIG-1'")[0]
check("colisión: gana el estado final", dup["status"], "final")
check("colisión: conserva el marcador", (dup["away_score"], dup["home_score"]), (2, 6))
check("colisión: conserva el gamePk jugado", dup["source_url"].split("/")[-2], "826347")

r = q("select * from seasons")[0]
check("season_id", r["season_id"], "2025-26")
check("start_date", r["start_date"], "2025-10-15")

g = q("select * from games where game_id='2025-10-16-LIC-AGU-1'")[0]
check("innings extra calculados del boxscore", g["innings_played"], 10)
check("status pospuesto no sobrevive a la colisión", n("games where status='postponed'"), 0)

check("slug con acento normalizado",
      q("select player_id from players where mlb_id=103")[0][0],
      "jose-manuel-fernandez-1996-04-02")
check("nacionalidad no dominicana", q("select nationality from players where mlb_id=111")[0][0], "DOM")
check("nacionalidad USA", q("select nationality from players where mlb_id=211")[0][0], "USA")

check("decisión W", q("select decision from pitching_lines where player_id like 'j-c-mejia%'")[0][0], "W")
check("decisión SV", q("select decision from pitching_lines where player_id like 'jorge-tavarez%'")[0][0], "SV")
check("decisión HLD", q("select decision from pitching_lines where player_id like 'gerson-moreno%'")[0][0], "HLD")
check("abridor marcado", q("select is_starter from pitching_lines where player_id like 'patrick-weigel%'")[0][0], 1)
check("orden de pitcheo del relevista", q("select pitching_order from pitching_lines where player_id like 'jorge-tavarez%'")[0][0], 2)

print("\n━━━ VISTAS ━━━")
check("v_standings: 5 equipos aparecen en los 3 juegos", n("v_standings"), 5)
check("v_batting_season: 8 líneas → 7 filas (2 jugadores cambiaron de equipo)", n("v_batting_season"), 7)
check("v_pitching_season: 8 líneas → 7 filas", n("v_pitching_season"), 7)

print("\n  v_standings:")
for r in q("select * from v_standings"):
    print(f"    {r['team_code']} {r['wins']}-{r['losses']} pct={r['win_loss_pct']} RF={r['runs_for']} RA={r['runs_against']}")

print("\n  Munguía en las dos vistas (jugó para dos equipos):")
for r in q("select * from v_batting_season where player_id like 'ismael-munguia%'"):
    print(f"    {r['team_code']}: AB={r['ab']} H={r['h']} AVG={r['avg']} OBP={r['obp']} SLG={r['slg']}")

print("\n  v_pitching_season:")
for r in q("select full_name,innings_pitched,era,whip,wins,saves from v_pitching_season order by era"):
    print(f"    {r['full_name']:24} IP={r['innings_pitched']:<5} ERA={r['era']:<6} WHIP={r['whip']:<5} W={r['wins']} SV={r['saves']}")

print("\n━━━ COMPROBACIÓN ARITMÉTICA ━━━")
# Mejía: 18 outs = 6.0 IP, 2 ER → ERA = 2*27/18 = 3.00 ; WHIP = (1+4)*3/18 = 0.83
r = q("select * from v_pitching_season where full_name like 'J.C.%'")[0]
check("IP de Mejía (18 outs / 3)", r["innings_pitched"], 6.0)
check("ERA de Mejía (2*27/18)", r["era"], 3.0)
check("WHIP de Mejía ((1+4)*3/18)", r["whip"], 0.83)
# Munguía con AGU: 5 AB, 3 H, 1 triple → AVG .600, SLG (2*1+3*1)/5 = 1.000
r = q("select * from v_batting_season where player_id like 'ismael-munguia%' and team_code='LIC'")[0]
check("AVG de Munguía (3/5)", r["avg"], 0.6)
check("SLG de Munguía (2 sencillos + 1 triple)", r["slg"], 1.0)
check("regla 3: batting_lines no guarda AVG",
      "avg" in [d[1] for d in q("pragma table_info(batting_lines)")], False)

print()
if fails:
    print(f"❌ {len(fails)} comprobaciones fallaron: {fails}")
    sys.exit(1)
print("✅ Todas las comprobaciones pasaron")
