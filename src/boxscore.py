"""
El boxscore de un juego terminado, armado desde la base, con la MISMA forma
que el detalle en vivo (`TeamDetail` en src/live/detail.py).

Por qué la misma forma: los dos clientes ya tienen un componente de boxscore
probado contra el detalle en vivo, con filas tocables que llevan a la ficha.
Una segunda forma para lo mismo obligaría a mantener dos componentes que un
día pintarían distinto la misma línea.

Lo que la base NO tiene y por eso no viaja:

- **Errores del equipo.** `batting_lines` guarda lo que hizo cada bateador,
  no las jugadas defensivas. `errors` va en `None` y los clientes omiten la
  "E" en vez de pintar un cero que sería mentira.
- **Línea por entradas y relato.** Solo existen para los juegos que el motor
  en vivo siguió. `innings` y `plays` van vacíos.
- **Corredores dejados en base del equipo**, que no es la suma de los
  individuales. `left_on_base` va en `None`.
- **Banca y bullpen sin usar.** La base solo guarda a quien jugó.

Funciones puras sobre filas: la ruta hace el SQL.
"""

from __future__ import annotations

from typing import Any, Optional

from src.jornada import entradas

DECISION_NOTA = {"W": "(G)", "L": "(P)", "SV": "(SV)", "HLD": "(HLD)", "BS": "(SV fallido)"}


def linea_bateador(b: dict, k: int) -> dict[str, Any]:
    """Una fila de `batting_lines` en la forma de `BatterLine`."""
    orden = b.get("batting_order")
    return {
        # En el detalle en vivo `player_id` es el número de la MLB; aquí se
        # usa el mismo campo, y si faltara, la posición en la lista: los
        # clientes lo usan solo como llave de fila.
        "player_id": b.get("mlb_id") or k,
        "name": b["full_name"],
        "profile_id": b["player_id"],
        "position": b.get("position"),
        "batting_order": orden,
        # 100, 200… son titulares; 101, 102, quienes entraron por ellos.
        "is_starter": bool(orden) and orden % 100 == 0,
        "summary": None,
        "at_bats": b["at_bats"],
        "runs": b["runs"],
        "hits": b["hits"],
        "doubles": b["doubles"],
        "triples": b["triples"],
        "home_runs": b["home_runs"],
        "rbi": b["rbi"],
        "walks": b["walks"],
        "strikeouts": b["strikeouts"],
        "stolen_bases": b.get("stolen_bases", 0),
        "left_on_base": b.get("left_on_base", 0),
    }


def linea_lanzador(p: dict, k: int) -> dict[str, Any]:
    """Una fila de `pitching_lines` en la forma de `PitcherLine`."""
    return {
        "player_id": p.get("mlb_id") or k,
        "name": p["full_name"],
        "profile_id": p["player_id"],
        "order": p.get("pitching_order") or k,
        "is_starter": bool(p.get("is_starter")),
        "note": DECISION_NOTA.get(p.get("decision") or ""),
        "summary": None,
        # String en notación de béisbol, como lo manda la MLB en vivo: "5.1".
        "innings_pitched": entradas(p["outs_recorded"]),
        "hits": p["hits_allowed"],
        "runs": p["runs_allowed"],
        "earned_runs": p["earned_runs"],
        "walks": p["walks_allowed"],
        "strikeouts": p["strikeouts"],
        "home_runs": p["home_runs_allowed"],
        "pitches": p.get("pitches_thrown") or 0,
        "strikes": p.get("strikes") or 0,
    }


def equipo_detalle(
    code: str,
    nombre: str,
    carreras: Optional[int],
    bateo: list[dict],
    pitcheo: list[dict],
) -> dict[str, Any]:
    """Un equipo en la forma de `TeamDetail`, con los hits sumados de sus líneas."""
    bateadores = sorted(
        (b for b in bateo if b["team_code"] == code),
        key=lambda b: (b.get("batting_order") is None, b.get("batting_order") or 0, b["full_name"]),
    )
    lanzadores = sorted(
        (p for p in pitcheo if p["team_code"] == code),
        key=lambda p: (p.get("pitching_order") is None, p.get("pitching_order") or 0, p["full_name"]),
    )
    return {
        "team_code": code,
        "team_name": nombre,
        "runs": carreras or 0,
        "hits": sum(b["hits"] for b in bateadores),
        "errors": None,
        # El LOB del equipo NO es la suma de los individuales: un corredor
        # que se queda en base cuenta para cada bateador que no lo impulsó.
        # La base no guarda el del equipo, así que no se inventa.
        "left_on_base": None,
        "batters": [linea_bateador(b, k) for k, b in enumerate(bateadores, 1)],
        "pitchers": [linea_lanzador(p, k) for k, p in enumerate(lanzadores, 1)],
        "bench": [],
        "bullpen": [],
    }
