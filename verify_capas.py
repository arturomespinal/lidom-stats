"""Validación cruzada de las dos capas, temporada por temporada, contra la base real.

Las comprobaciones viven en `src/validacion.py`, junto con las diferencias
conocidas (forfeits y discrepancias de la propia /stats) y por qué existen.
La orquestación (`orquestacion/`) corre las mismas como asset checks después
de cargar cada temporada: una sola definición de "las capas coinciden".

Esta suite las corre sobre TODAS las temporadas que estén en las dos capas e
imprime cada comprobación.

Uso:  python verify_capas.py            (usa data/lidom_stats.db)
      python verify_capas.py otra.db
"""
import sys

from src.validacion import FORFEITS, comparar_temporada, conectar, juegos_descuadrados, season_id, temporadas

DB = sys.argv[1] if len(sys.argv) > 1 else "data/lidom_stats.db"

fails: list[str] = []


def check(label: str, ok: bool, detalle: str = "") -> None:
    if not ok:
        fails.append(label)
    print(f"  {'✓' if ok else '✗'} {label}{'' if ok else '  → ' + detalle}")


con = conectar(DB)
comunes, sin_planas = temporadas(con)

print(f"Base: {DB}")
print(f"Temporadas en las dos capas: {len(comunes)}  ({', '.join(season_id(s) for s in comunes)})")
if sin_planas:
    print(f"Solo en el esquema de juego (falta `python main.py ingest <año>`): {', '.join(sin_planas)}")

# Antes que nada: cada juego cuadra consigo mismo. Si no, ninguna comparación
# de abajo significa nada.
print("\n━━━ Las líneas de cada juego suman su marcador ━━━")
finales, descuadres = juegos_descuadrados(con)
check(f"los {finales:,} juegos finales cuadran: bateo y pitcheo suman el marcador",
      not descuadres, f"{len(descuadres)} descuadrados, p. ej. {descuadres[:3]}")

for s in comunes:
    sid = season_id(s)
    forfeit = FORFEITS.get(sid, set())
    print(f"\n━━━ {sid} {'(forfeit: ' + '-'.join(sorted(forfeit)) + ')' if forfeit else ''} ━━━")
    resultado = comparar_temporada(con, s)
    for c in resultado.comprobaciones:
        check(c.etiqueta, c.ok, c.detalle)
    for nota in resultado.notas:
        print(f"    ({nota})")

print()
if not comunes:
    fails.append("no hay ninguna temporada en las dos capas")
if fails:
    print(f"❌ {len(fails)} comprobaciones fallaron:")
    for f in fails:
        print(f"   - {f}")
    sys.exit(1)
print(f"✅ Todas las comprobaciones pasaron ({len(comunes)} temporadas)")
