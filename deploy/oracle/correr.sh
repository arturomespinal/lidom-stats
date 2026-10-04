#!/usr/bin/env bash
# deploy/oracle/correr.sh — Corre main.py en el servidor, como el usuario de
# la API, con su entorno de Python y contra la base de producción.
#
#   sudo bash /opt/deportiv/lidom-stats/deploy/oracle/correr.sh ingest 2026
#   sudo bash /opt/deportiv/lidom-stats/deploy/oracle/correr.sh ingest-game 826343
#
# Como el usuario de la API y no como root: un archivo creado por root en
# data/ (el diario de SQLite, por ejemplo) dejaría a la API sin poder escribir.

set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Córrelo con sudo." >&2; exit 1; }
[[ $# -ge 1 ]] || { echo "Uso: sudo bash $0 <comando de main.py> [argumentos]" >&2; exit 1; }

cd /opt/deportiv/lidom-stats
exec sudo -u deportiv -H env TZ=America/Santo_Domingo \
  /opt/deportiv/venv/bin/python main.py "$@"
