"""
La temporada de un equipo contada juego a juego: la carrera por el banderín,
los últimos diez y los titulares de su ficha.

Funciones puras sobre filas de `games`. Solo juegos finales de temporada
regular, en orden de fecha y hora: una doble cartelera son dos puntos, en el
orden en que se jugaron.
"""

from __future__ import annotations

from typing import Any, Iterable

from src.live.gumbo import ordinal_es

EQUIPOS = ("AGU", "TOR", "EST", "GIG", "ESC", "LIC")


def _resultados(juegos: Iterable[dict], equipo: str) -> list[dict[str, Any]]:
    """Los juegos del equipo, en orden, desde su lado. Los empates no cuentan."""
    salida = []
    for g in juegos:
        if g["home_score"] == g["away_score"]:
            continue
        if g["home_team_code"] == equipo:
            rf, ra, rival, local = g["home_score"], g["away_score"], g["away_team_code"], True
        elif g["away_team_code"] == equipo:
            rf, ra, rival, local = g["away_score"], g["home_score"], g["home_team_code"], False
        else:
            continue
        salida.append({
            "result": "G" if rf > ra else "P",
            "opponent": rival,
            "runs_for": rf,
            "runs_against": ra,
            "home": local,
            "date": g["game_date"],
            # Para abrir el juego: la página de un juego terminado se pide por
            # game_id (GET /games/{id}/detail).
            "game_id": g.get("game_id"),
        })
    return salida


def serie_sobre_500(resultados: list[dict]) -> list[int]:
    """Juegos sobre .500 tras cada juego. Empieza en 0, antes del primero."""
    s = [0]
    for r in resultados:
        s.append(s[-1] + (1 if r["result"] == "G" else -1))
    return s


def carrera_por_el_banderin(juegos: list[dict]) -> list[dict]:
    """Una serie por equipo. El cliente resalta el suyo y pinta el resto de contexto."""
    return [{"team_code": t, "series": serie_sobre_500(_resultados(juegos, t))} for t in EQUIPOS]


def ultimos_diez(juegos: list[dict], equipo: str) -> list[dict]:
    """Los diez más recientes, del más viejo al más nuevo: se leen de izquierda a derecha."""
    return _resultados(juegos, equipo)[-10:]


def _record(juegos: int, sobre: int) -> str:
    """Juegos jugados y juegos sobre .500 → "21-4"."""
    return f"{(juegos + sobre) // 2}-{(juegos - sobre) // 2}"


def _pct(juegos: int, sobre: int) -> float:
    return (juegos + sobre) / 2 / juegos if juegos else 0.0


def titular_banderin(serie: list[int]) -> str | None:
    """
    Una frase sobre la forma de la temporada, en tres casos:

    - Se enfriaron después de un pico: "Llegaron a 21-4 y cerraron 11-13."
    - Remontaron desde un pozo: "Estuvieron 17-25 y cerraron 7-1."
    - Terminaron arriba de todo: "Cerraron en su mejor momento: 32-17."

    El cambio se mide en RITMO (porcentaje de victorias antes y después del
    punto), no en juegos sobre .500. Las Águilas de 2025-26 solo bajaron de +17
    a +15, pero pasaron de ganar el 84% a ganar el 46%: eso es lo que la frase
    cuenta. Umbrales para que no hable de ruido: un pico de +4 no es un pico,
    menos de 5 juegos después no es un tramo, y 20 puntos de porcentaje es la
    diferencia entre un líder y uno del montón. Si nada cumple, no hay titular.
    Plural a propósito: los seis clubes se nombran en plural.
    """
    n = len(serie) - 1
    if n < 10:
        return None
    fin = serie[-1]
    pico = max(serie)
    ip = serie.index(pico)
    if pico >= 5 and n - ip >= 5 and _pct(ip, pico) - _pct(n - ip, fin - pico) >= 0.2:
        return f"Llegaron a {_record(ip, pico)} y cerraron {_record(n - ip, fin - pico)}."
    pozo = min(serie)
    iz = serie.index(pozo)
    if pozo <= -5 and n - iz >= 5 and _pct(n - iz, fin - pozo) - _pct(iz, pozo) >= 0.2:
        return f"Estuvieron {_record(iz, pozo)} y cerraron {_record(n - iz, fin - pozo)}."
    if fin == pico and fin >= 5:
        return f"Cerraron en su mejor momento: {_record(n, fin)}."
    return None


def _juegos(x: float) -> str:
    """5.0 → "5 juegos", 1.0 → "1 juego", 8.5 → "8.5 juegos"."""
    n = f"{x:g}"
    return f"{n} juego" if x == 1 else f"{n} juegos"


def posicion_en_la_tabla(carrera: list[dict], equipo: str) -> dict | None:
    """
    El puesto del equipo en esa temporada, sacado de la MISMA serie que la
    carrera por el banderín —y no de /standings— para que la cabecera y la
    gráfica de la ficha nunca cuenten dos cosas distintas.

    Orden por porcentaje, como /standings. `label` viene compuesto: "1ro · 5
    juegos de ventaja" o "3ro · a 8.5 del primero".
    """
    tabla = []
    for c in carrera:
        s = c["series"]
        n, sobre = len(s) - 1, s[-1]
        g, p = (n + sobre) // 2, (n - sobre) // 2
        if n:
            tabla.append({"team_code": c["team_code"], "wins": g, "losses": p, "pct": g / n})
    if not tabla:
        return None
    tabla.sort(key=lambda t: -t["pct"])
    yo = next((t for t in tabla if t["team_code"] == equipo), None)
    if yo is None:
        return None
    lugar = tabla.index(yo) + 1
    lider = tabla[0]
    if lugar == 1 and len(tabla) > 1:
        segundo = tabla[1]
        ventaja = ((yo["wins"] - segundo["wins"]) + (segundo["losses"] - yo["losses"])) / 2
        detalle = f"{_juegos(ventaja)} de ventaja" if ventaja > 0 else "empatados en la cima"
    else:
        atraso = ((lider["wins"] - yo["wins"]) + (yo["losses"] - lider["losses"])) / 2
        detalle = f"a {_juegos(atraso).replace(' juegos', '').replace(' juego', '')} del primero"
    return {"position": lugar, "teams": len(tabla), "label": f"{ordinal_es(lugar)} · {detalle}"}


def titular_historial(historial: list[dict]) -> str | None:
    """ "9 de 14 con más carreras anotadas que permitidas." """
    if len(historial) < 2:
        return None
    positivas = sum(1 for h in historial if (h.get("run_diff") or 0) > 0)
    return f"{positivas} de {len(historial)} con más carreras anotadas que permitidas."
