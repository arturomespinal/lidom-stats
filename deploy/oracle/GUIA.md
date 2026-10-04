# La API en Oracle Cloud (Always Free)

Cómo dejar la API, la base y el motor en vivo corriendo en un servidor gratis,
con HTTPS, para que la app y la web funcionen sin la PC encendida.

Lo que queda dónde:

| Pieza | Dónde | Costo |
|-------|-------|-------|
| API, base SQLite y motor en vivo | Oracle Cloud, instancia A1 (ARM) de Always Free | 0 |
| HTTPS | Caddy en la misma instancia, certificado de Let's Encrypt | 0 |
| Nombre | Un subdominio de DuckDNS (`algo.duckdns.org`) | 0 |
| Web | Vercel, plan Hobby | 0 (no comercial; ver el final) |
| App | Apunta a la API con `EXPO_PUBLIC_API_URL` | 0 |

Los archivos de esta carpeta:

- `instalar.sh` deja todo listo en una instancia nueva: paquetes, usuario de servicio, Python, claves, systemd, cortafuegos, Caddy y una comprobación final. Se puede correr más de una vez.
- `actualizar.sh` trae lo último de GitHub y reinicia la API.
- `correr.sh` corre `main.py` en el servidor (por ejemplo `ingest 2026`).
- `respaldo.py` y `deportiv-respaldo.*` hacen una copia diaria de la base a las 4:30 a. m. de RD y conservan 14.
- `deportiv-api.service` es la API como servicio: un solo worker, solo en 127.0.0.1, con el sistema de archivos en solo lectura salvo `data/`.
- `Caddyfile` es el HTTPS delante de la API.

Todo esto se probó de punta a punta en un Ubuntu 24.04 con la API en modo producción detrás de Caddy (3-oct-2026). Quedó comprobado que:

- un `X-Forwarded-For` inventado no esquiva el límite;
- la clave del servidor sí lo exime;
- el JSON llega comprimido;
- el flujo en vivo pasa sin retraso y sin comprimir.

---

## 1. Crear la cuenta de Oracle

En oracle.com/cloud/free, "Start for free". Pide una tarjeta para verificar
identidad; con Always Free no se cobra nada.

**La región de inicio (home region) no se puede cambiar después**, y los
recursos gratis de A1 solo existen en ella. Elige **US East (Ashburn)**: es la
más cercana a RD y la de Vercel está al lado. Si al crear la instancia (paso 4)
dice que no hay capacidad, se reintenta; no hace falta otra cuenta.

## 2. Pasar la cuenta a Pay As You Go (importante)

Oracle puede **reclamar** una instancia gratis que considere ociosa: si en 7
días el CPU (percentil 95), la red y la memoria quedan todos por debajo del
20%. La API usa unos 100 MB de los 12 GB, así que caería siempre en esa regla.

La documentación de Oracle aplica esa regla a las cuentas "Always Free"; quien
pasa la cuenta a Pay As You Go reporta que deja de aplicarse, y los recursos de
Always Free siguen sin cobrarse. Oracle no lo dice con todas las letras, así
que además: **respaldos** (el paso 12) y esta guía, que reconstruye todo en
media hora.

- Menú → Billing & Cost Management → Upgrade and Manage Payment → Pay As You Go.
  Puede hacer una retención temporal en la tarjeta, que luego se libera.
- Después, **un presupuesto con alerta**, para enterarte si algo empieza a
  cobrar: Billing & Cost Management → Budgets → Create Budget, 1 USD al mes,
  con alerta al correo cuando el gasto real pase del 1%.
- Regla: no crear nada fuera de lo de esta guía. Una instancia de otra forma,
  más disco o una base de datos administrada sí cobran.

## 3. Una llave SSH en la PC

En CMD:

```
if not exist "%USERPROFILE%\.ssh" mkdir "%USERPROFILE%\.ssh"
ssh-keygen -t ed25519 -f "%USERPROFILE%\.ssh\deportiv" -C deportiv
type "%USERPROFILE%\.ssh\deportiv.pub"
```

Cuando pida frase de paso puedes dejarla vacía (Enter dos veces). La última
línea muestra la llave **pública** (`ssh-ed25519 AAAA… deportiv`): esa es la que
se pega en Oracle. El archivo sin `.pub` es la privada y no sale de la PC.

## 4. Crear la instancia

Menú → Compute → Instances → Create instance.

- **Image**: Canonical Ubuntu 24.04 (no la "Minimal"). Al elegir la forma de
  abajo, Oracle toma sola la versión para ARM.
- **Shape**: Change shape → Ampere → `VM.Standard.A1.Flex`, **2 OCPU y 12 GB**
  (lo máximo gratis).
- **Networking**: crear una red nueva (VCN) con subred **pública**, y que asigne
  una IPv4 pública.
- **Add SSH keys**: "Paste public keys" y pega la línea del paso 3.
- **Boot volume**: el de fábrica (unos 50 GB; hay 200 GB gratis).

Create. A los pocos minutos queda "Running" y muestra la **Public IP address**:
anótala.

Si sale "Out of capacity" / "Out of host capacity": prueba otro Availability
Domain en la misma pantalla, o vuelve a intentar más tarde. Es falta de
máquinas libres en la región, no un error tuyo.

## 5. Abrir los puertos 80 y 443 en Oracle

Oracle tiene un cortafuegos fuera de la máquina (la Security List) y otro
dentro (iptables). El de dentro lo abre `instalar.sh`; este hay que abrirlo en
la consola:

Networking → Virtual cloud networks → tu VCN → Subnets → la subred pública →
Security → la Default Security List → Add Ingress Rules. Dos reglas:

- Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port Range `80`
- Source CIDR `0.0.0.0/0`, IP Protocol TCP, Destination Port Range `443`

El 80 hace falta aunque todo vaya por HTTPS: es por donde Let's Encrypt
comprueba que el nombre es tuyo, y por donde Caddy redirige a HTTPS.

## 6. Un nombre para la IP (DuckDNS)

HTTPS necesita un nombre, no una IP. En duckdns.org, entra con GitHub o
Google, crea un subdominio (por ejemplo `deportiv`, si está libre) y en
"current ip" pon la IP pública del paso 4 → update ip.

Desde la PC, comprueba que ya apunta (puede tardar un minuto):

```
nslookup deportiv.duckdns.org
```

Más adelante, con dominio propio, solo cambia este nombre (ver el final).

## 7. Subir la base

Desde la PC, en CMD, con la API de la PC apagada:

```
cd C:\Users\Arturo\Desktop\Trabajos\lidom-stats
scp -i "%USERPROFILE%\.ssh\deportiv" data\lidom_stats.db ubuntu@IP_DEL_SERVIDOR:~/
```

La primera vez pregunta si confías en el servidor: `yes`. Son unos 20 MB.

## 8. Instalar

Entra al servidor:

```
ssh -i "%USERPROFILE%\.ssh\deportiv" ubuntu@IP_DEL_SERVIDOR
```

Y ahí (ya es Linux):

```
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/arturomespinal/lidom-stats.git /opt/deportiv/lidom-stats
sudo bash /opt/deportiv/lidom-stats/deploy/oracle/instalar.sh deportiv.duckdns.org https://deportiv.vercel.app
```

El primer argumento es el nombre del paso 6. El segundo, la dirección que
tendrá la web en Vercel (paso 10): decide ahora el nombre del proyecto de
Vercel, o pon uno y lo corriges después volviendo a correr el instalador con
el bueno (conserva las claves y solo cambia los orígenes).

Tarda unos minutos. Al final dice "Listo" con la dirección de la API. Si
algo falla, dice qué y dónde mirar.

Qué deja hecho:

- Usuario `deportiv` sin login que corre la API. El código está en `/opt/deportiv/lidom-stats` y el Python en `/opt/deportiv/venv`.
- La base en `data/`, comprobada antes de instalarla: si la subida se cortó, lo dice.
- `/etc/deportiv/api.env` con la configuración de producción. Las claves son nuevas, de 43 caracteres y distintas entre sí. El archivo lo lee solo root y el grupo `deportiv`, y no va al repositorio.
- La API como servicio: arranca sola al encender la máquina y se reinicia si cae. Escucha solo en 127.0.0.1, así que desde fuera solo se llega por Caddy.
- El motor en vivo encendido (`LIDOM_LIVE_POLLER=1`). Fuera de temporada solo mira el calendario de vez en cuando.
- Caddy con HTTPS, con el certificado y su renovación automáticos.

## 9. Probar

Desde el navegador del teléfono, con datos móviles (no la WiFi de la casa):

- `https://deportiv.duckdns.org/health` → `{"status":"ok"}`
- `https://deportiv.duckdns.org/standings?season=2025` → la tabla de 2025-26

`/docs` da 404 a propósito: en producción no se publica.

## 10. La web en Vercel

1. vercel.com → entra con GitHub → Add New → Project → importa `lidom-stats`.
2. **Root Directory**: `frontend`. El framework (Next.js) lo detecta solo.
3. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = `https://deportiv.duckdns.org`
   - `LIDOM_CLAVE_SERVIDOR` = la clave del servidor. Para verla, en el servidor:
     `sudo grep LIDOM_CLAVE_SERVIDOR /etc/deportiv/api.env` y copia lo que va
     después del `=`.
4. Deploy.

`LIDOM_CLAVE_SERVIDOR` va **sin** `NEXT_PUBLIC_`: con ese prefijo Next la mete
en el código que baja el navegador y deja de ser secreta. Sin la clave, todas
las páginas que arma el servidor de Vercel contarían como una sola IP y
chocarían con el límite de 300 por minuto.

Si la dirección que te dio Vercel no es la que pusiste en el paso 8, corre el
instalador otra vez con la buena (los orígenes son los que dejan al navegador
llamar a la API, por ejemplo en la página En Vivo).

## 11. La app

Crea el archivo `mobile\.env` (con VS Code, por ejemplo) con una línea:

```
EXPO_PUBLIC_API_URL=https://deportiv.duckdns.org
```

Y desde `mobile`:

```
npx expo start --clear
```

El `--clear` hace falta la primera vez: Expo mete esa variable en el código al
empaquetar. Ahora la app funciona con datos móviles, lejos de la casa y con la
PC apagada. `.env` está en `.gitignore`; de todas formas esa dirección no es
secreta.

Para volver a usar la API de la PC, borra la línea (o el archivo) y repite el
`--clear`.

## 12. El día a día

Todo en el servidor (`ssh -i … ubuntu@IP`):

| Para | Comando |
|------|---------|
| Subir lo último de GitHub | `sudo bash /opt/deportiv/lidom-stats/deploy/oracle/actualizar.sh` |
| Ver los registros en vivo | `journalctl -u deportiv-api -f` (Ctrl+C para salir) |
| Ver si está corriendo | `systemctl status deportiv-api` |
| Reiniciar | `sudo systemctl restart deportiv-api` |
| Correr `main.py` | `sudo bash /opt/deportiv/lidom-stats/deploy/oracle/correr.sh ingest 2026` |
| Estado del motor en vivo | ver abajo |

El estado completo del motor en vivo pide la clave de diagnóstico. Así no sale
del servidor:

```
curl -s -H "X-Clave-Diagnostico: $(sudo sed -n 's/^LIDOM_CLAVE_DIAGNOSTICO=//p' /etc/deportiv/api.env)" http://127.0.0.1:8000/live/status
```

`actualizar.sh` hace `git pull`, instala dependencias nuevas si las hay y
reinicia. Si la API no vuelve a levantar, lo dice y deja escrito cómo volver al
código anterior.

**Durante la temporada no hay que hacer nada a mano**: al terminar cada juego,
el motor lo ingesta y pone al día Posiciones, Bateo y Pitcheo. La 2026-27
aparece en el selector cuando termina el primer juego; para que aparezca
antes, `correr.sh ingest 2026`.

**No vuelvas a subir la base de la PC con la temporada en marcha**: la del
servidor tiene juegos que la de la PC no tiene. Si alguna vez hace falta
reemplazarla, primero baja un respaldo, y después:

```
sudo systemctl stop deportiv-api
sudo install -o deportiv -g deportiv -m 640 ~/lidom_stats.db /opt/deportiv/lidom-stats/data/lidom_stats.db
sudo systemctl start deportiv-api
```

### Respaldos

Cada madrugada queda una copia comprimida (unos 4 MB) en
`/opt/deportiv/respaldos/`, comprobada con `integrity_check`, y se conservan
las 14 últimas. Viven en el mismo disco: protegen de una ingesta que salga mal,
no de perder la máquina. **Una vez por semana**, bájate la última a la PC:

```
scp -i "%USERPROFILE%\.ssh\deportiv" ubuntu@IP_DEL_SERVIDOR:/opt/deportiv/respaldos/lidom_stats-AAAAMMDD-HHMM.db.gz .
```

(En el servidor, `ls /opt/deportiv/respaldos` dice cómo se llaman.) Para
abrirla en la PC como base, desde la carpeta del repo:

```
python -c "import gzip, shutil; shutil.copyfileobj(gzip.open('lidom_stats-AAAAMMDD-HHMM.db.gz'), open('data/lidom_stats.db', 'wb'))"
```

## Si algo falla

| Síntoma | Qué mirar |
|---------|-----------|
| El instalador dice que `https://…` no responde | `nslookup` del nombre (¿apunta a la IP?) y las dos reglas del paso 5. Caddy reintenta solo; `journalctl -u caddy -n 50 --no-pager` dice por qué no saca el certificado. |
| La API no arranca | `journalctl -u deportiv-api -n 50 --no-pager`. Una configuración insegura (orígenes vacíos o con `*`, claves cortas o iguales) no arranca a propósito y lo dice ahí. |
| La web carga pero En Vivo o el buscador fallan | El origen de la web no está en `LIDOM_CORS_ORIGINS`. Corre el instalador con el bueno. |
| La web da error en todas las páginas | `NEXT_PUBLIC_API_URL` en Vercel, y que `LIDOM_CLAVE_SERVIDOR` sea idéntica a la del servidor. Después de cambiar variables en Vercel hay que volver a desplegar. |
| Cambió la IP pública | Ponla en DuckDNS. Pasa solo si la instancia se termina y se crea otra. |
| Oracle reclamó la instancia | Pasos 4 a 8 con una instancia nueva, y en el 7 sube el último respaldo descomprimido en vez de la base de la PC. |

## Más adelante

- **Con anuncios**, Vercel Hobby deja de servir: es solo para uso no comercial.
  Las opciones son Vercel Pro (de pago) o correr la web en esta misma
  instancia, que tiene memoria de sobra. Antes de eso, la guía legal del
  proyecto (`claude/guia-legal-ads.md`).
- **Dominio propio**: cambia el nombre en el instalador (`instalar.sh
  midominio.com …`), en Vercel y en `mobile/.env`. Caddy saca el certificado
  nuevo solo.
- **Más de un worker** obligaría a sacar el límite por IP y la caché en vivo a
  Redis. Con lo que pide hoy la app, uno sobra.
