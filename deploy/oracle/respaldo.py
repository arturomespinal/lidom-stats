"""
deploy/oracle/respaldo.py — Copia diaria de la base, en el servidor.

Durante la temporada la base del servidor deja de ser reconstruible desde la
PC: el motor en vivo ingesta cada juego al terminar. Esto guarda una copia
comprimida por día y conserva las últimas CONSERVAR.

Usa la API de respaldo de SQLite, no una copia del archivo: copiar el .db
mientras la API escribe puede dar una copia a medias. La API de respaldo lee
una foto consistente aunque haya escrituras en curso.

Lo corre deportiv-respaldo.timer cada madrugada. A mano:

    sudo -u deportiv /opt/deportiv/venv/bin/python deploy/oracle/respaldo.py

Esto protege de una ingesta que salga mal o de una base dañada, NO de perder
la máquina: las copias viven en el mismo disco. Para eso, bajarlas de vez en
cuando a la PC (ver GUIA.md, "Respaldos").
"""

from __future__ import annotations

import gzip
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE = Path("/opt/deportiv/lidom-stats/data/lidom_stats.db")
DESTINO = Path("/opt/deportiv/respaldos")
CONSERVAR = 14
RD = timezone(timedelta(hours=-4))


def respaldar(base: Path = BASE, destino: Path = DESTINO, conservar: int = CONSERVAR) -> Path:
    """Copia consistente de `base`, comprimida, en `destino`. Devuelve la ruta."""
    if not base.exists():
        raise FileNotFoundError(f"No existe la base: {base}")
    destino.mkdir(parents=True, exist_ok=True)

    sello = datetime.now(RD).strftime("%Y%m%d-%H%M")
    final = destino / f"lidom_stats-{sello}.db.gz"

    # 1. Foto consistente a un archivo temporal, con la API de respaldo.
    with tempfile.TemporaryDirectory(dir=destino) as tmp:
        copia = Path(tmp) / "copia.db"
        origen = sqlite3.connect(f"file:{base}?mode=ro", uri=True)
        try:
            dest = sqlite3.connect(copia)
            try:
                origen.backup(dest)
            finally:
                dest.close()
        finally:
            origen.close()

        # 2. Comprobar la copia antes de darla por buena.
        con = sqlite3.connect(copia)
        try:
            estado = con.execute("PRAGMA integrity_check").fetchone()[0]
        finally:
            con.close()
        if estado != "ok":
            raise RuntimeError(f"La copia no pasó integrity_check: {estado}")

        # 3. Comprimir (la base comprime a la cuarta parte, más o menos).
        parcial = final.with_suffix(".gz.parcial")
        with open(copia, "rb") as f_in, gzip.open(parcial, "wb", compresslevel=6) as f_out:
            shutil.copyfileobj(f_in, f_out)
        parcial.rename(final)

    # 4. Borrar las más viejas. El nombre lleva la fecha, así que el orden
    #    alfabético es el cronológico.
    copias = sorted(destino.glob("lidom_stats-*.db.gz"))
    for vieja in copias[:-conservar]:
        vieja.unlink()

    return final


if __name__ == "__main__":
    try:
        ruta = respaldar()
    except Exception as exc:  # noqa: BLE001 — que el timer lo registre como fallo
        print(f"Respaldo FALLÓ: {exc}", file=sys.stderr)
        sys.exit(1)
    print(f"Respaldo listo: {ruta} ({ruta.stat().st_size / 1e6:.1f} MB)")
