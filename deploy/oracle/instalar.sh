#!/usr/bin/env bash
# deploy/oracle/instalar.sh — Deja la API de Deportiv corriendo con HTTPS en
# una instancia de Ubuntu 24.04 (Oracle Cloud, A1 ARM). Ver GUIA.md.
#
#   sudo bash /opt/deportiv/lidom-stats/deploy/oracle/instalar.sh DOMINIO ORIGENES_WEB
#
#   DOMINIO       el nombre que apunta a la IP del servidor
#                 (por ejemplo deportiv.duckdns.org)
#   ORIGENES_WEB  los orígenes de la web, separados por comas
#                 (por ejemplo https://deportiv.vercel.app)
#
# Antes: el repositorio clonado en /opt/deportiv/lidom-stats y la base
# subida a tu carpeta del servidor (~/lidom_stats.db). GUIA.md, pasos 7 y 8.
#
# Se puede correr otra vez: lo hecho se deja como está, las claves NO se
# regeneran, y los orígenes se actualizan a los que se pasen.

set -euo pipefail

RAIZ=/opt/deportiv
REPO=$RAIZ/lidom-stats
VENV=$RAIZ/venv
RESPALDOS=$RAIZ/respaldos
BASE=$REPO/data/lidom_stats.db
ENV_DIR=/etc/deportiv
ENV_FILE=$ENV_DIR/api.env
USUARIO=deportiv
AQUI=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

paso()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
falla() { printf '\033[1;31mxx  %s\033[0m\n' "$*" >&2; exit 1; }

# ── Comprobaciones antes de tocar nada ──────────────────────────────────────

[[ $EUID -eq 0 ]] || falla "Córrelo con sudo."
[[ $# -eq 2 ]] || falla "Uso: sudo bash $0 DOMINIO ORIGENES_WEB   (ver GUIA.md)"
DOMINIO=$1
ORIGENES=$2

[[ $DOMINIO =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]] \
  || falla "DOMINIO no parece un nombre: '$DOMINIO' (va sin https:// ni /)."
[[ $ORIGENES != *'*'* ]] || falla "ORIGENES_WEB no puede llevar '*'."
for o in ${ORIGENES//,/ }; do
  [[ $o =~ ^https?://[A-Za-z0-9.:-]+$ ]] \
    || falla "Origen inválido: '$o'. Forma: https://deportiv.vercel.app (sin / al final)."
done
[[ $AQUI == "$REPO/deploy/oracle" ]] \
  || falla "El repositorio tiene que estar en $REPO (GUIA.md, paso 8)."

# La base: o ya está en su sitio, o la subiste a tu carpeta del servidor.
BASE_NUEVA=""
if [[ ! -s $BASE ]]; then
  HOME_SUDO=$(getent passwd "${SUDO_USER:-root}" | cut -d: -f6)
  [[ -s $HOME_SUDO/lidom_stats.db ]] \
    || falla "No encuentro la base. Súbela desde la PC (GUIA.md, paso 7) y vuelve a correr esto."
  BASE_NUEVA=$HOME_SUDO/lidom_stats.db
  # Una subida cortada deja un archivo que SQLite no abre o una base vacía.
  JUEGOS=$(python3 - "$BASE_NUEVA" <<'PY'
import sqlite3, sys
con = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
if con.execute("PRAGMA quick_check").fetchone()[0] != "ok":
    sys.exit("la base no pasa quick_check")
print(con.execute("SELECT COUNT(*) FROM games WHERE status = 'final'").fetchone()[0])
PY
  ) || falla "$BASE_NUEVA está dañada o incompleta. Súbela otra vez."
  [[ $JUEGOS -gt 0 ]] || falla "$BASE_NUEVA no tiene juegos. ¿Es la base buena?"
fi

# ── Paquetes ────────────────────────────────────────────────────────────────

paso "Paquetes del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3-venv git curl gnupg \
  debian-keyring debian-archive-keyring apt-transport-https

if ! command -v caddy >/dev/null 2>&1; then
  # El repositorio oficial de Caddy, como lo indica caddyserver.com/docs/install.
  # El de Ubuntu trae una versión de 2022.
  paso "Caddy (repositorio oficial)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

# ── Usuario, carpetas y base ────────────────────────────────────────────────

paso "Usuario de servicio '$USUARIO' y carpetas"
id -u "$USUARIO" >/dev/null 2>&1 \
  || useradd --system --home-dir "$RAIZ" --shell /usr/sbin/nologin "$USUARIO"
mkdir -p "$REPO/data" "$RESPALDOS"
chown -R "$USUARIO:$USUARIO" "$RAIZ"
chmod 755 "$RAIZ" "$RESPALDOS"   # para poder bajar los respaldos con scp

if [[ -n $BASE_NUEVA ]]; then
  paso "Base: $BASE_NUEVA ($JUEGOS juegos) → $BASE"
  install -o "$USUARIO" -g "$USUARIO" -m 640 "$BASE_NUEVA" "$BASE"
  rm -f "$BASE_NUEVA"
fi

# ── Python ──────────────────────────────────────────────────────────────────

paso "Entorno de Python ($VENV)"
[[ -x $VENV/bin/python ]] || sudo -u "$USUARIO" -H python3 -m venv "$VENV"
sudo -u "$USUARIO" -H "$VENV/bin/pip" install -q --upgrade pip
sudo -u "$USUARIO" -H "$VENV/bin/pip" install -q -r "$REPO/requirements.txt"

# ── Configuración de producción ─────────────────────────────────────────────

paso "Configuración de producción ($ENV_FILE)"
mkdir -p "$ENV_DIR"
if [[ -f $ENV_FILE ]]; then
  sed -i "s#^LIDOM_CORS_ORIGINS=.*#LIDOM_CORS_ORIGINS=$ORIGENES#" "$ENV_FILE"
  echo "Ya existía: se conservan las claves; orígenes = $ORIGENES"
else
  # Claves de 43 caracteres, distintas entre sí (api/seguridad.py exige 24+).
  clave() { python3 -c 'import secrets; print(secrets.token_urlsafe(32))'; }
  DIAG=$(clave)
  SERV=$(clave)
  [[ $DIAG != "$SERV" ]] || falla "Salieron dos claves iguales; vuelve a correrlo."
  (
    umask 027
    cat > "$ENV_FILE" <<EOF
# Configuración de producción de la API. La genera instalar.sh y NO va al
# repositorio. Qué hace cada variable: .env.example en el repositorio.
# Después de cambiar algo: sudo systemctl restart deportiv-api

LIDOM_ENTORNO=produccion
LIDOM_CORS_ORIGINS=$ORIGENES
LIDOM_LIMITE_POR_MINUTO=300

# Caddy va delante y escribe la IP real en X-Forwarded-For. La API solo
# escucha en 127.0.0.1, así que nadie llega a ella sin pasar por Caddy.
LIDOM_CONFIAR_PROXY=1

LIDOM_CLAVE_DIAGNOSTICO=$DIAG
# Esta va TAMBIÉN en Vercel, como LIDOM_CLAVE_SERVIDOR (sin NEXT_PUBLIC_).
LIDOM_CLAVE_SERVIDOR=$SERV

LIDOM_LIVE_POLLER=1
EOF
  )
  echo "Creada con claves nuevas."
fi
chown "root:$USUARIO" "$ENV_FILE"
chmod 640 "$ENV_FILE"

# ── Servicios ───────────────────────────────────────────────────────────────

paso "Servicios de systemd"
install -m 644 "$AQUI/deportiv-api.service" "$AQUI/deportiv-respaldo.service" \
  "$AQUI/deportiv-respaldo.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --quiet deportiv-api deportiv-respaldo.timer
systemctl restart deportiv-api
systemctl start deportiv-respaldo.timer

# ── Cortafuegos de la máquina ───────────────────────────────────────────────
# Las imágenes de Ubuntu de Oracle traen iptables que rechaza todo menos SSH.
# Esto abre 80 y 443 DENTRO de la máquina; en la consola de Oracle también
# hay que abrirlos en la Security List (GUIA.md, paso 5).

paso "Cortafuegos: puertos 80 y 443"
for puerto in 80 443; do
  if iptables -C INPUT -p tcp -m conntrack --ctstate NEW --dport "$puerto" -j ACCEPT 2>/dev/null; then
    echo "  $puerto ya estaba abierto"
    continue
  fi
  pos=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')
  if [[ -n $pos ]]; then
    # Antes de la regla que rechaza; al final no serviría.
    iptables -I INPUT "$pos" -p tcp -m conntrack --ctstate NEW --dport "$puerto" -j ACCEPT
    echo "  $puerto abierto"
  else
    echo "  no hay regla que rechace: $puerto ya pasa"
  fi
done
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save >/dev/null 2>&1 && echo "  guardado para los reinicios"
else
  aviso "Sin netfilter-persistent: las reglas se pierden al reiniciar. apt-get install iptables-persistent"
fi

# ── Caddy ───────────────────────────────────────────────────────────────────

paso "Caddy para $DOMINIO"
sed "s/^DOMINIO {/$DOMINIO {/" "$AQUI/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl enable --quiet caddy
systemctl reload-or-restart caddy

# ── Comprobación ────────────────────────────────────────────────────────────

paso "Comprobación"
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1 && break
  sleep 1
done
if ! curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
  journalctl -u deportiv-api -n 40 --no-pager
  falla "La API no respondió. Arriba están sus últimas líneas de registro."
fi
echo "  API en 127.0.0.1:8000: bien"

# El certificado lo pide Caddy al primer arranque; tarda unos segundos, y
# solo sale si el nombre ya apunta a esta IP y el 80/443 están abiertos en la
# Security List.
HTTPS_OK=0
for _ in $(seq 1 12); do
  if curl -fsS --max-time 10 "https://$DOMINIO/health" >/dev/null 2>&1; then
    HTTPS_OK=1
    break
  fi
  sleep 5
done
if [[ $HTTPS_OK -eq 1 ]]; then
  echo "  https://$DOMINIO/health: bien"
else
  aviso "https://$DOMINIO todavía no responde. Revisa que el nombre apunte a la IP"
  aviso "pública y que la Security List tenga el 80 y el 443 (GUIA.md, pasos 5 y 6)."
  aviso "Caddy reintenta solo; para ver qué pasa: journalctl -u caddy -n 50 --no-pager"
fi

cat <<EOF

Listo.
  API:          https://$DOMINIO
  Registros:    journalctl -u deportiv-api -f
  Clave para Vercel (LIDOM_CLAVE_SERVIDOR):
                sudo grep LIDOM_CLAVE_SERVIDOR $ENV_FILE
  Actualizar:   sudo bash $AQUI/actualizar.sh
EOF
