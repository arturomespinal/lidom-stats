"""
Dos jugadores lado a lado: las líneas de cada uno, quién gana cada renglón y
la frase que lo resume.

Se compone en el servidor por la misma razón que `carrera.py` y
`contexto.py`: las tasas de una temporada con dos equipos, o de una carrera,
se RECOMPONEN de los conteos sumados (nunca se promedian), y quién va
adelante en efectividad (la MÁS BAJA) es un criterio que, escrito dos veces,
un día diverge. Los clientes dibujan las barras; no deciden quién gana.

Funciones puras sobre filas ya leídas de las vistas (y de DIGIMETRICS, para
los años anteriores a 2012-13). La ruta hace las consultas.
"""

from __future__ import annotations

from typing import Any, Iterable

from src.carrera import carrera_bateo, carrera_pitcheo, edad
from src.contexto import MUESTRA_CHICA_OUTS, MUESTRA_CHICA_PA, edad_en_temporada
from src.jornada import entradas

CARRERA = "career"

# (clave, etiqueta, mejor, formato). `mejor` es "mayor", "menor" o None: los
# renglones de volumen (juegos, apariciones, aperturas) se muestran pero no
# se ganan, porque más juegos no es jugar mejor. El orden es FIJO, el mismo
# para todos: así se ve también dónde flojea cada uno.
FILAS_BATEO: list[tuple[str, str, str | None, str]] = [
    ("games", "Juegos", None, "int"),
    ("pa", "Apariciones", None, "int"),
    ("avg", "Promedio", "mayor", "rate3"),
    ("obp", "Embasado", "mayor", "rate3"),
    ("slg", "Slugging", "mayor", "rate3"),
    ("ops", "OPS", "mayor", "rate3"),
    ("h", "Hits", "mayor", "int"),
    ("doubles", "Dobles", "mayor", "int"),
    ("hr", "Jonrones", "mayor", "int"),
    ("rbi", "Impulsadas", "mayor", "int"),
    ("r", "Anotadas", "mayor", "int"),
    ("sb", "Robos", "mayor", "int"),
    ("bb_pct", "Boletos por aparición", "mayor", "pct1"),
    ("so_pct", "Ponches por aparición", "menor", "pct1"),
]
FILAS_PITCHEO: list[tuple[str, str, str | None, str]] = [
    ("games", "Juegos", None, "int"),
    ("games_started", "Aperturas", None, "int"),
    ("outs", "Entradas", "mayor", "ip"),
    ("era", "Efectividad", "menor", "dec2"),
    ("whip", "WHIP", "menor", "dec2"),
    ("k9", "Ponches por 9", "mayor", "dec2"),
    ("bb9", "Boletos por 9", "menor", "dec2"),
    ("so", "Ponches", "mayor", "int"),
    ("wins", "Ganados", "mayor", "int"),
    ("saves", "Salvados", "mayor", "int"),
]

# Precisión con la que se decide: la que se ve. Dos .312 empatan aunque en el
# decimal doce no coincidan; si no, la barra "ganadora" no se explicaría.
_PRECISION = {"rate3": 3, "pct1": 3, "dec2": 2, "int": 0, "ip": 0}


def linea(filas: list[dict], rol: str) -> dict[str, Any] | None:
    """
    La línea de un jugador sobre unas filas: una temporada (con uno o varios
    equipos) o la carrera entera. Conteos sumados y tasas recompuestas
    (`carrera.py`), más las tasas por aparición y por nueve entradas.
    """
    if not filas:
        return None
    if rol == "batting":
        total = carrera_bateo(filas)
        pa = total["pa"]
        total["bb_pct"] = total["bb"] / pa if pa else None
        total["so_pct"] = total["so"] / pa if pa else None
    else:
        total = carrera_pitcheo(filas)
        outs = total["outs"]
        total["k9"] = round(total["so"] * 27 / outs, 2) if outs else None
        total["bb9"] = round(total["bb"] * 27 / outs, 2) if outs else None
    return total


def texto(valor: float | int | None, formato: str) -> str:
    """El valor como se pinta: .312, 3.45, 12.3%, 45.1 (entradas), 12."""
    if valor is None:
        return "—"
    if formato == "rate3":
        s = f"{valor:.3f}"
        return s[1:] if s.startswith("0") else s
    if formato == "dec2":
        return f"{valor:.2f}"
    if formato == "pct1":
        return f"{valor * 100:.1f}%"
    if formato == "ip":
        return entradas(int(valor))
    return str(int(valor))


def _quien_gana(a: float | None, b: float | None, mejor: str | None, formato: str) -> str | None:
    """"a", "b" o None (empate, renglón de volumen, o falta uno de los dos)."""
    if mejor is None or a is None or b is None:
        return None
    pa, pb = round(a, _PRECISION[formato]), round(b, _PRECISION[formato])
    if pa == pb:
        return None
    a_mayor = pa > pb
    return "a" if a_mayor == (mejor == "mayor") else "b"


def renglones(la: dict | None, lb: dict | None, rol: str) -> list[dict]:
    """Cada renglón con los dos valores crudos (para las barras), su texto y quién gana."""
    filas = FILAS_BATEO if rol == "batting" else FILAS_PITCHEO
    out = []
    for clave, etiqueta, mejor, formato in filas:
        va = la.get(clave) if la else None
        vb = lb.get(clave) if lb else None
        out.append({
            "key": clave,
            "label": etiqueta,
            "format": formato,
            # Los de volumen se muestran sin barra ganadora: no se ganan.
            "decides": mejor is not None,
            "lower_is_better": mejor == "menor",
            "a": va,
            "b": vb,
            "a_text": texto(va, formato),
            "b_text": texto(vb, formato),
            "better": _quien_gana(va, vb, mejor, formato),
        })
    return out


def volumen(l: dict | None, rol: str) -> str | None:
    """"412 AP" o "45.1 IP": el tamaño de la muestra, bajo el nombre."""
    if not l:
        return None
    if rol == "batting":
        return f"{l['pa']} AP"
    return f"{entradas(l['outs'])} IP"


def muestra_chica(l: dict | None, rol: str) -> bool:
    """El mismo listón que pinta hueco un punto de la curva: 50 AP o 10 entradas."""
    if not l:
        return False
    return l["pa"] < MUESTRA_CHICA_PA if rol == "batting" else l["outs"] < MUESTRA_CHICA_OUTS


def titular(nombre_a: str, nombre_b: str, filas: list[dict]) -> str | None:
    """
    "Juan Soto sale arriba en 7 de 11."

    Cuenta solo los renglones que se ganan (no los de volumen) y que tienen
    valor en los dos. Un empate en el conteo se dice como empate.
    """
    comparables = [f for f in filas if f["decides"] and f["a"] is not None and f["b"] is not None]
    if not comparables:
        return None
    ga = sum(1 for f in comparables if f["better"] == "a")
    gb = sum(1 for f in comparables if f["better"] == "b")
    if ga == gb:
        return f"Parejos: {ga} renglones cada uno." if ga else "Parejos en todo."
    nombre, gana = (nombre_a, ga) if ga > gb else (nombre_b, gb)
    return f"{nombre} sale arriba en {gana} de {len(comparables)}."


def nota(nombres: tuple[str, str], lineas: tuple[dict | None, dict | None], rol: str) -> str | None:
    """
    Lo que hay que saber antes de leer la tabla:

    - Si a uno (o a los dos) le faltan cifras en este papel: "Sauryn Lao no
      tiene cifras de bateo." Un lanzador contra un bateador no se compara
      renglón por renglón; una tabla de rayas de un lado parecía un error
      (Sauryn Lao contra Jansel Luis, 16-nov-2026).
    - Si no, con muestras chicas: "Ojo: Fulano tiene solo 23 AP." Ahí el
      titular engaña.
    """
    papel = "bateo" if rol == "batting" else "pitcheo"
    sin = [n for n, l in zip(nombres, lineas) if l is None]
    if len(sin) == 2:
        return f"Ninguno de los dos tiene cifras de {papel}."
    if sin:
        return f"{sin[0]} no tiene cifras de {papel}."
    chicos = [(n, l) for n, l in zip(nombres, lineas) if muestra_chica(l, rol)]
    if not chicos:
        return None
    partes = [f"{n} tiene solo {volumen(l, rol)}" for n, l in chicos]
    return "Ojo: " + " y ".join(partes) + "."


def temporadas_de(filas: Iterable[dict]) -> set[str]:
    return {f["season_id"] for f in filas}


def ultimo_equipo(filas: list[dict]) -> str | None:
    """El equipo de su temporada más reciente (el de más juegos si fueron dos)."""
    if not filas:
        return None
    ultima = max(f["season_id"] for f in filas)
    return max((f for f in filas if f["season_id"] == ultima), key=lambda f: f.get("games") or 0)["team_code"]


def equipo_principal(filas: list[dict], rol: str) -> str | None:
    """El equipo de más volumen en esas filas: la teja que va junto al nombre."""
    if not filas:
        return None
    campo = "pa" if rol == "batting" else "outs"
    por_equipo: dict[str, int] = {}
    for f in filas:
        por_equipo[f["team_code"]] = por_equipo.get(f["team_code"], 0) + (f.get(campo) or 0)
    return max(por_equipo.items(), key=lambda kv: (kv[1], kv[0]))[0]


def edad_para(fecha_nacimiento: str | None, temporada: str) -> int | None:
    """La edad de hoy en la carrera; la de ESA temporada si se compara una."""
    if temporada == CARRERA:
        return edad(fecha_nacimiento)
    return edad_en_temporada(fecha_nacimiento, temporada)
