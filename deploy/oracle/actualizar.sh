#!/usr/bin/env bash
# deploy/oracle/actualizar.sh — Trae lo último de GitHub y reinicia la API.
#
#   sudo bash /opt/deportiv/lidom-stats/deploy/oracle/actualizar.sh
#
# Todo va dentro de main(): el git pull puede cambiar este mismo archivo, y
# bash lee los scripts a medida que avanza. Con la función, bash ya leyó todo
# antes de que el pull lo toque.

set -euo pipefail

main() {
  local REPO=/opt/deportiv/lidom-stats
  local VENV=/opt/deportiv/venv
  local USUARIO=deportiv
  local AQUI=$REPO/deploy/oracle

  [[ $EUID -eq 0 ]] || { echo "Córrelo con sudo." >&2; exit 1; }

  local antes despues
  antes=$(sudo -u "$USUARIO" -H git -C "$REPO" rev-parse --short HEAD)
  sudo -u "$USUARIO" -H git -C "$REPO" pull --ff-only --quiet
  despues=$(sudo -u "$USUARIO" -H git -C "$REPO" rev-parse --short HEAD)

  if [[ $antes == "$despues" ]]; then
    echo "Ya estaba al día ($antes). Reinicio igual."
  else
    echo "Código: $antes → $despues"
    sudo -u "$USUARIO" -H git -C "$REPO" log --oneline "$antes..$despues" | head -20
  fi

  sudo -u "$USUARIO" -H "$VENV/bin/pip" install -q -r "$REPO/requirements.txt"

  # Por si cambiaron los servicios.
  install -m 644 "$AQUI/deportiv-api.service" "$AQUI/deportiv-respaldo.service" \
    "$AQUI/deportiv-respaldo.timer" /etc/systemd/system/
  systemctl daemon-reload
  systemctl restart deportiv-api

  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
      echo "API arriba."
      return 0
    fi
    sleep 1
  done
  journalctl -u deportiv-api -n 40 --no-pager
  echo "La API no respondió después de reiniciar. Arriba, sus últimas líneas." >&2
  echo "Para volver al código anterior: sudo -u $USUARIO -H git -C $REPO reset --hard $antes" >&2
  echo "y otra vez: sudo systemctl restart deportiv-api" >&2
  exit 1
}

main "$@"
exit $?
