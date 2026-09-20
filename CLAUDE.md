# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Pipeline de datos + API + dashboard visual para estadísticas de LIDOM (béisbol profesional dominicano). Objetivo comercial: producto tipo SofaScore. Proyecto de pasantía.

## Fuente de datos canónica

**MLB Stats API** — `statsapi.mlb.com/api/v1` — pública, sin autenticación.
- `leagueId=131` (LIDOM), `sportId=17` (Winter Leagues)
- IDs de equipos LIDOM: 667–672 (AGU, TOR, EST, GIG, ESC, LIC) — ver `src/constants.py`
- **No usar Baseball-Reference.** Los scrapers BR se eliminaron del repositorio;
  están en el historial de git si algún día hacen falta.

### Etiquetado de temporada — OJO

La MLB API nombra la temporada invernal por el año en que **empieza**, no por el que termina:

| `season=` | Campaña LIDOM | Primer juego |
|-----------|---------------|--------------|
| `"2024"`  | 2024-25       | 2024-10-16   |
| `"2025"`  | 2025-26       | 2025-10-15   |

Verificado contra `/schedule`. `mlb_season_to_season_id()` en `boxscore_ingestor.py` hace la conversión a `season_id` ("2025" → "2025-26"). Las tablas planas guardan el string crudo de la API (`season="2025"`); el esquema de juego guarda `season_id="2025-26"`. Son la misma campaña.

## Comandos

### Backend (Python) — desde raíz del repo

```bash
# Instalar dependencias
pip install -r requirements.txt

# Tablas planas: agregados de temporada desde /stats
python main.py ingest 2025

# Esquema de granularidad de juego: /schedule + /boxscore
python main.py ingest-games 2025
python main.py ingest-games 2025 --smoke      # solo 3 juegos, para validar el parser
python main.py ingest-games 2025 --refresh    # re-procesa juegos ya ingestados

# Levantar la API
uvicorn api.main:app --reload          # http://localhost:8000
# Docs interactivas: http://localhost:8000/docs

# Las seis suites. Ninguna necesita red: corren contra fixtures, un cliente
# MLB simulado o la base local. Son scripts, no pytest — salen con código 0
# si todo pasa, así que encadenarlas con && funciona.
python verify_game_routes.py         # endpoints del esquema de juego
python verify_live_detail.py         # parser del detalle
python verify_live_parser.py         # parser de la tarjeta
python verify_live_poller.py         # poller y cadena de parches
python verify_boxscore_ingestor.py   # ingestor contra boxscore sintético
python verify_api_models.py          # modelos Pydantic contra JSON real
```

**No hay pruebas de pytest.** El `pytest` que estuvo documentado aquí no corría
nada: el único archivo `test_*.py` era un script de prints sin funciones de
prueba, así que pytest lo recogía y reportaba "no tests ran" — verde por vacío,
que es peor que rojo. Ese archivo es ahora `verify_api_models.py` y corre con
las demás. Si algún día se añaden pruebas de verdad, pytest vuelve.

### Frontend (Next.js) — desde `frontend/`

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint     # `eslint .` — `next lint` ya no existe en Next 16
```

### Mobile (Expo / React Native) — desde `mobile/`

```bash
npm install
npx expo start
```

## Arquitectura

Conviven **dos capas de almacenamiento** que se alimentan de la misma API por caminos distintos. No es deuda técnica: sirven a propósitos diferentes y se validan mutuamente.

```
MLB Stats API (statsapi.mlb.com)
        │
        ▼
src/clients/mlb_api.py (MLBAPIClient — httpx + retry + rate limit 100ms)
        │
        ├──────────────────────────────┬──────────────────────────────────┐
        ▼                              ▼                                  ▼
  /stats (agregados)            /schedule + /boxscore            /people?personIds=
        │                              │                          (lotes de 100)
        ▼                              ▼                                  │
src/pipeline/mlb_ingestor.py   src/pipeline/boxscore_ingestor.py ◄─────────┘
        │                              │
        ▼                              ▼
   TABLAS PLANAS                 ESQUEMA DE JUEGO
   standings                     teams / players / seasons
   batting_stats                 games
   pitching_stats                batting_lines / pitching_lines
        │                              │
        │                              ▼
        │                        vistas SQL (agregación on-demand)
        │                        v_standings / v_batting_season / v_pitching_season
        │                              │
        └──────────────┬───────────────┘
                       ▼
        api/main.py (FastAPI — :8000 — CORS para :3000)
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
   frontend/ (Next.js 16)         mobile/ (Expo)
   /          → posiciones
   /batting   → líderes de bateo
   /pitching  → líderes de pitcheo
```

**Estado actual:** el esquema de juego cubre **14 temporadas, de la 2012-13 a la
2025-26** — 2.014 juegos, 2.253 jugadores, 45.029 líneas de bateo y 24.729 de
pitcheo. Las tablas planas, en cambio, solo tienen 2024 y 2025: el backfill se
corrió con `ingest-games` por temporada pero el `ingest` de los agregados se
quedó atrás. Hasta que se complete, `/standings`, `/batting` y `/pitching`
—que leen las planas— solo responden para esas dos.

Dos temporadas salen cortas y **no es un fallo de ingesta**: 91 juegos en
2020-21 y 120 en 2021-22, las campañas recortadas por la pandemia.

**El `player_id` es el slug `nombre-fechanacimiento`, no un autoincremental**, y
esa decisión es la que hace posible la ficha multi-temporada: un jugador de 2012
y el mismo de 2025 caen en la misma fila solos, sin código de reconciliación.
Alfredo Marte sale con 14 temporadas y 4 equipos, incluido un cambio a mitad de
la 2015-16. No cambiar esa clave.

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `src/clients/mlb_api.py` | Cliente HTTP (retry exponencial, throttle 100ms, `get_people` en lote) |
| `src/models/flat_models.py` | ORM de las tablas planas: `Standing`, `BattingStats`, `PitchingStats` (PK compuestas) |
| `src/models/database.py` | ORM normalizado con granularidad de juego + `VIEW_STATEMENTS` |
| `src/models/api_models.py` | Pydantic: validación de respuestas MLB (maneja strings ".368") |
| `src/pipeline/mlb_ingestor.py` | `MLBIngestor.ingest(season)` — puebla las 3 tablas planas |
| `src/pipeline/boxscore_ingestor.py` | `BoxscoreIngestor.ingest(season)` — puebla el esquema de juego |
| `api/main.py` | Endpoints sobre tablas planas: `/standings`, `/batting`, `/pitching`, `/player/{name}`, `/seasons` |
| `api/game_routes.py` | Endpoints sobre el esquema de juego (router aparte, ver abajo) |
| `src/constants.py` | `LIDOM_TEAMS` (IDs MLB → códigos), `LIDOM_LEAGUE_ID`, `LIDOM_SPORT_ID` |
| `src/qualification.py` | Mínimos de calificación (PA/IP), compartidos por las dos capas |
| `src/playoffs.py` | `PLAYOFF_SPOTS` y la distancia con signo a la línea de clasificación |
| `verify_boxscore_ingestor.py` | 34 comprobaciones del ingestor contra un boxscore sintético |
| `verify_game_routes.py` | 87 comprobaciones de los endpoints contra la base real |
| `src/live/detail.py` | Proyección detallada de un juego: relato, línea, boxscore, alineaciones |

Las cinco suites (`verify_game_routes`, `verify_live_poller`, `verify_live_parser`,
`verify_live_detail`, `verify_boxscore_ingestor`) suman **288 comprobaciones** y
corren sin red.

## Endpoints

### Tablas planas (`api/main.py`) — los que consumen el frontend y el mobile

`/standings` · `/batting` · `/pitching` · `/player/{name}` · `/seasons`

Parámetro `season` en formato crudo de la MLB API (`"2025"`).

`/standings` ordena por PCT y añade, sobre lo que guarda la tabla: `short_name`
(del catálogo canónico, para pantallas angostas), `playoff_spot`, `playoff_games`
y `playoff_games_back`. Ver "La línea de clasificación", más abajo.

### Esquema de juego (`api/game_routes.py`)

| Endpoint | Qué da |
|----------|--------|
| `GET /games` | Listado con filtros: `team`, `opponent`, `stage`, `status`, `date_from`, `date_to`, `order`, paginado con `limit`/`offset` |
| `GET /games/{game_id}` | Boxscore completo: las dos alineaciones con líneas de bateo y pitcheo |
| `GET /players/search?q=` | Busca por nombre, devuelve `player_id` |
| `GET /players/{player_id}` | Perfil biográfico + temporadas desde las vistas |
| `GET /players/{player_id}/gamelog` | Juego por juego — lo que las tablas planas no pueden dar |
| `GET /leaderboards/batting` | Líderes con calificación por PA |
| `GET /leaderboards/pitching` | Líderes con calificación por IP |
| `GET /teams/{code}/h2h/{rival}` | Historial entre dos equipos, con desglose local/visitante |

`season` acepta ambos formatos: `"2025"` o `"2025-26"`. `normalize_season_id()` traduce.

En `/players/search` el orden de declaración importa: la ruta estática va **antes** de `/players/{player_id}`, porque FastAPI resuelve en orden y si no `"search"` entraría como un `player_id`.

## Reglas críticas

1. **Idempotencia obligatoria**: `session.merge()` por PK compuesta — `(season, team_id)` y `(season, mlb_player_id)` en las planas, `(game_id, player_id)` en las líneas. Re-ejecutar nunca duplica.

2. **Validación defensiva**: todo `team_id` se valida contra `LIDOM_TEAMS` (667–672) antes de insertar. No quitar este check.

3. **Stats agregadas NO se guardan** en `batting_lines` / `pitching_lines`. Solo conteos atómicos; AVG, ERA y WHIP salen de las vistas. Las tablas planas son la excepción deliberada: almacenan los agregados que devuelve `/stats`.

4. **`playerPool="All"` en `/stats`**: sin ese parámetro la MLB API asume `QUALIFIED` y devuelve solo a quienes alcanzan el mínimo de apariciones. En una liga invernal corta eso reduce 206 bateadores a 22 y 251 lanzadores a 5. El default del cliente ya es `"All"`; pasar `"QUALIFIED"` explícitamente solo para tablas de líderes.

5. **Las vistas se recrean en cada `init_db()`** (DROP + CREATE). Con `CREATE VIEW IF NOT EXISTS` una base existente conservaba la definición vieja y los cambios al SQL no surtían efecto. Las vistas no guardan datos, así que recrearlas es gratis.

6. **La decisión del lanzador sale de `stats.pitching`, no de `seasonStats`**: en el boxscore `stats` es lo del juego (`wins` vale 0 ó 1) y `seasonStats` el acumulado. No parsear el string `note` — no siempre viene.

7. **Colisiones de `game_id`**: `/schedule` lista juegos pospuestos junto a su reposición con la misma fecha y equipos, así que varias entradas caen en el mismo `game_id`. La precedencia es determinista (final > con marcador > gamePk mayor). No volver a last-write-wins: una entrada pospuesta procesada después borraría el marcador de un juego ya jugado, y el checkpoint impediría recuperarlo.

8. **`innings_played` se calcula de los outs reales** del boxscore, no de `scheduledInnings`. Y `_upsert_games` preserva el valor existente: si lo re-sembrara con 9 en cada corrida, los juegos de entradas extra se corromperían en la segunda ejecución.

9. **`games` vs `games_batted`** en `v_batting_season`: `games` cuenta cualquier aparición (convención oficial, incluye corredores emergentes y sustitutos defensivos con 0 turnos); `games_batted` solo juegos con al menos una aparición al plato. Usar `games_batted` para filtrar tablas de líderes.

10. **El mínimo de calificación solo aplica a estadísticas de tasa**, y rige en las DOS capas — endpoints planos y vistas. AVG, OBP, SLG, OPS, ERA y WHIP lo llevan; jonrones, ponches, victorias y salvados no — nadie exige un mínimo para liderar una acumulada. Y el estándar de la MLB no es trasladable al pitcheo invernal: 1.0 IP por juego de equipo deja **un solo** calificado en LIDOM, porque un abridor de aquí hace 8–14 aperturas contra las ~32 de Grandes Ligas. Usamos 0.6 (30 IP), que deja 14 — la misma proporción por equipo que el 3.1 PA/juego del bateo. Los mínimos viven en `src/qualification.py`, compartidos por `api/main.py` y `api/game_routes.py`: duplicarlos garantizaría que un día muestren líderes distintos.

11. **No migrar a PostgreSQL aún** — Alembic se agregará cuando se decida migrar.

12. **`bats` y `throws` admiten los TRES códigos: 'L', 'R' y 'S'.** Y lo de
    `throws` no es teórico — Anthony Seigler lanza con las dos manos. La
    traducción vive en `src/lateralidad.py` y la API devuelve `bats_label` y
    `throws_label` ya compuestos; **el cliente nunca traduce**. Un
    `bats === "L" ? "Zurdo" : "Derecho"` en el frontend etiqueta mal a los 198
    ambidiestros de la base, sin error y sin que nadie lo note. Misma lógica
    que `ordinal_es()`: un solo lugar donde traducir es un solo lugar donde
    equivocarse.

## Validación cruzada

Las dos capas nacen de la misma API por caminos independientes, así que deben coincidir. Para 2025-26 coinciden al dígito: 9.998 AB, 2.472 H, 195 HR, 1.209 ER, 2.351 K, 149 W, 149 L, 72 SV, y los seis equipos de `v_standings` reproducen exacto la tabla `standings`.

Única diferencia conocida: **Enmanuel Mejía**, 5 juegos en la vista contra 4 en la tabla plana. No es un bug — sus IP coinciden (10 outs = 3.33). La tabla plana lee `gamesPlayed` de `/stats`, que para lanzadores no cuenta igual que las apariciones reales en boxscores. La vista es la correcta.

Nota de alcance: esto prueba que la agregación es correcta, **no** que los datos de la MLB lo sean. Contrastar contra el portal de LIDOM requeriría el scraper secundario.

## Frontend

- `NEXT_PUBLIC_API_URL` en `frontend/.env.local` apunta al backend (default: `http://localhost:8000`)
- Tema oscuro fijo, colores de equipos en `frontend/lib/constants.ts`
- Tablas sortables por clic en columna (client components), fetch en server components
- Empty state visible cuando la DB está vacía (muestra el comando `python main.py ingest`)

### Next.js 16 — lo que cambió y por qué importa

La web corre en **Next 16.3.5 con React 19.3**. Cuatro cosas de la migración que
hay que tener en la cabeza al escribir código nuevo:

1. **`params` y `searchParams` son promesas.** Una página que los reciba tiene que
   `await`-earlos antes de leer un campo. Las cinco páginas ya están así:

   ```tsx
   export default async function BattingPage(props: Props) {
     const searchParams = await props.searchParams;   // ← sin esto, undefined
     const season = searchParams.season ?? DEFAULT_SEASON;
   }
   ```

   El tipo también cambia: `searchParams: Promise<{ season?: string }>`. Si se
   declara sin `Promise`, TypeScript pasa y la página falla en tiempo de
   ejecución — por eso el tipo es parte del contrato, no adorno.

2. **Turbopack es el empaquetador por defecto**, en `dev` y en `build`. No hay
   configuración de webpack que mantener; si algún día hace falta un loader, se
   escribe contra Turbopack o se vuelve a webpack explícitamente.

3. **`next lint` desapareció.** El script `lint` llama a `eslint .` y la
   configuración vive en `eslint.config.mjs` (formato plano). `.eslintrc.json`
   ya no se lee.

   **ESLint queda clavado en 9.x a propósito.** `eslint-config-next@16` arrastra
   `eslint-plugin-react@7.37`, que todavía no habla la API de ESLint 10 y revienta
   al arrancar. No subir a 10 hasta que ese plugin lo soporte.

4. **Cache Components (PPR) está APAGADO.** El codemod había sembrado
   `export const instant = false;` en seis archivos, y eso no compila si
   `nextConfig.cacheComponents` no está encendido. Se quitaron los seis. Si algún
   día se enciende PPR, es una decisión aparte y hay que medirla: el valor de la
   página en vivo lo pone el cliente sondeando, no el render del servidor.

`react-hooks/immutability` del nuevo linter **encontró un error real** en
`PlayByPlay.tsx`: se mutaba un acumulador dentro del callback de `.map()` durante
el render. Con React 19 eso no es manía del linter — el render se puede
interrumpir y reiniciar, y el acumulador queda con el valor de la pasada
abortada. El corte de media entrada ahora se precalcula con un `reduce` antes de
renderizar. Si aparece esa regla de nuevo, es lo mismo: sacar el cálculo del
render.

Las cinco páginas se compararon en captura antes y después de migrar. Posiciones,
Bateo y Pitcheo salen idénticas píxel a píxel; las dos de En Vivo difieren solo
porque la repetición avanzó entre una captura y otra.

## Escudos de los equipos

`static/crests/{CODIGO}.png`, servidos por el backend en
`/static/crests/AGU.png`. **No se empaquetan en los clientes**, por tres razones:

1. Un solo lugar para los seis archivos, compartido por la web y el móvil.
2. Cambiar un escudo no obliga a recompilar ni a publicar versión nueva en Expo.
3. En React Native, `require()` de un archivo que no existe **revienta el
   empaquetado de Metro**. Por URL, un escudo que falta simplemente no carga.

`TeamBadge` cae a las siglas sobre el color del equipo cuando el escudo no está,
así que la carpeta puede estar vacía o a medias sin que nada se rompa.

**En la web, `onError` NO basta.** El HTML llega renderizado desde el servidor,
así que el navegador empieza a cargar la imagen antes de que React hidrate: si
da 404 en esa ventana, el evento se dispara sin manejador escuchando y se
pierde — se veía el icono de imagen rota en vez del respaldo. El `ref` comprueba
al montar si la imagen ya terminó con `naturalWidth === 0`, que es la única
forma de enterarse de ese caso. En el móvil no pasa: no hay render de servidor.

Los archivos están en `.gitignore` (ver `static/crests/README.md`): son marcas
registradas de los seis clubes y el repositorio es público. Quitar esas dos
líneas es una decisión de una sola edición.

**Los colores de equipo se ajustaron al escudo, pero no ciegamente.**
`TEAM_STYLES.primary` pinta la franja de 3 px de la fila; con los escudos
puestos, Águilas tenía franja amarilla y escudo naranja, y Gigantes franja azul
y escudo magenta. Solo esos dos cambiaron.

En los otros cuatro el tono dominante del escudo es **más oscuro** que el color
del uniforme —el verde de Estrellas sale #004818, el azul de Licey casi
negro— y no se ve como franja sobre `#0B0B0C`. Ahí gana el color del club. Por
eso los valores llevan un piso de luminosidad y no salen tal cual del PNG.

Toros es monocromo: el escudo no tiene ningún color del que extraer, y conserva
su rojo.

## La paleta

**La app no tiene color de marca.** Los seis equipos ya ocupan el amarillo, el
rojo, el verde y el azul —casi todo el círculo cromático útil— y cualquier
acento que eligiéramos competiría con alguno: las filas se leerían como si
pertenecieran a un equipo. El acento es el mismo blanco del texto (`#F4F4F5`) y
la jerarquía la cargan el tamaño y el peso.

Fuente única por plataforma. **Ningún componente escribe un hex a mano**; si un
color no está en estos archivos, o es de equipo o falta un token:

| Plataforma | Dónde | Cómo |
|-----------|-------|------|
| Web | `frontend/app/globals.css` + `tailwind.config.ts` | Variables CSS con **canales RGB** (`--card: 21 21 23`), expuestas como `rgb(var(--card) / <alpha-value>)`. Así `bg-card/50` compone opacidad sobre el token, cosa que con un hex no se puede. Se usan por nombre: `bg-card`, `text-dim`, `border-line`. |
| Móvil | `mobile/src/constants.ts` | `COLORS` y `ALPHA`. |

**Corolario que no se puede olvidar: el color ya no distingue lo activo de lo
inactivo.** Un fondo tenue del acento sobre una tarjeta es invisible cuando el
acento es el blanco del texto. Lo seleccionado se **invierte** —relleno claro,
texto `accentOn` / `--accent-on`— o se marca con una regla, como la columna
ordenada de las tablas web (`shadow-[inset_0_-2px_0_rgb(var(--accent))]`). Si
algún día una pestaña activa vuelve a ser "accent sobre card", va a desaparecer.

Los semánticos (`pos`, `neg`, `warn`, `live`) están **separados del acento** a
propósito: significan algo, así que sobreviven a cualquier cambio de paleta. Los
de equipo viven aparte (`TEAM_STYLES`) porque son de los clubes.

### Un mínimo explícito MANDA sobre el calculado

`/batting` y `/pitching` calculan el mínimo de calificación salvo que el cliente
mande uno. `app/batting/page.tsx` hacía `parseInt(searchParams.min_pa ?? "0") || 0`,
que convierte "el usuario no pidió mínimo" en **"mínimo cero"** — y la web siguió
encabezada por un OPS de 4.000 en un turno meses después de que la API ya
calificara. El móvil no tenía el bug porque nunca mandaba el parámetro.

La regla: **omitir el parámetro, no mandar cero.** `undefined` significa "que
decida la API"; `0` significa "sin mínimo" y es una decisión, no un default.

## Motor en vivo

El feed en vivo vive en la **v1.1** (`MLB_API_V11_BASE_URL`), no en la v1. El cliente sirve ambas: los métodos históricos usan rutas relativas contra `base_url`, y los de v1.1 arman la URL completa — httpx ignora `base_url` cuando la URL es absoluta.

### Reproducir juegos terminados

La API conserva una instantánea del estado por cada actualización de la transmisión. `/feed/live/timestamps` las lista (359 en el juego inaugural) y `/feed/live?timecode=X` devuelve el juego **tal como se veía** en ese instante. Con eso se desarrolla y se prueba el motor en vivo fuera de temporada, de forma determinista:

```bash
python capture_gumbo.py            # guarda instantáneas reales en fixtures/
python verify_live_parser.py       # 45 comprobaciones del parser, sin red
python replay_game.py 826343       # reproduce un juego contra la API real
```

### El parser

`src/live/gumbo.py` reduce el megabyte de GUMBO a `LiveGameState`, unos 1.400 bytes — 676 veces más pequeño, y cabe holgado en un evento SSE. Tres decisiones de lectura, tomadas contra instantáneas reales:

- El estado vigente sale de `liveData.linescore` (balls, strikes, outs), **no** de `plays.currentPlay.count`: cuando una jugada termina, `currentPlay` conserva la cuenta con que cerró ese turno.
- Los corredores salen de `linescore.offense`, donde las claves `first`/`second`/`third` solo aparecen si la base está ocupada. Ausencia significa base vacía.
- `liveData.decisions` solo existe cuando el juego terminó.

`metaData.wait` trae el intervalo de sondeo que la propia API recomienda (10 segundos en LIDOM). Usar ese valor en vez de fijar uno a mano.

**El ordinal de la entrada viene en inglés.** `currentInningOrdinal` devuelve
`"1st"`, `"7th"`, y los dos clientes lo metían tal cual en una frase en español:
"Baja del 1st". `ordinal_es()` lo deriva del **número** de entrada — no traduce el
string — y el parser expone `inning_ordinal_es` junto al crudo. Los clientes
pintan el segundo. Misma regla que con `games_back`: el dato de la MLB se
conserva, la presentación es nuestra.

El feed de pre-juego ya expone la alineación publicada — primer bateador y abridor — así que sirve para la pantalla previa.

`fixtures/` está fuera del control de versiones: son megas de JSON que se vuelven a bajar en un minuto.

### El poller

`src/live/poller.py` corre en su propio hilo y mantiene al día la caché volátil. Un ciclo: `/schedule` dice qué juegos hay hoy → la primera vez de cada juego se baja el feed completo → a partir de ahí **solo parches** desde la última marca, aplicados sobre el crudo guardado → al pasar a final dispara `on_final` y suelta el documento crudo.

Medido sobre doce sondeos reales: **7,9 MB por feed completo contra 0,75 MB por parches, 10,5 veces menos.** Y el estado que sale de la cadena de parches es idéntico campo por campo al del feed completo. La única discrepancia entre ambos documentos son 49 valores `int` frente a `float` en `pitchData` y `hitData` — mismo número, distinta serialización, y nada de eso llega al marcador.

Cuando un parche no se puede aplicar —respuesta con forma inesperada, marca demasiado vieja, operación inválida— el poller baja el feed completo. Es más caro, pero nunca deja el estado corrupto.

`src/live/store.py` es la caché: deliberadamente en memoria y **no** en SQLite. La base es la verdad histórica y se escribe una vez por juego; esto cambia cada diez segundos y no debe sobrevivir a un reinicio. Si el proceso cae, el poller reconstruye todo en un sondeo. Guarda el GUMBO crudo (porque los parches se aplican sobre él) y el estado reducido; al terminar un juego suelta el crudo, que es un megabyte sin uso.

### Endpoints en vivo

| Endpoint | Qué da |
|----------|--------|
| `GET /live/status` | Qué sigue el poller y qué proporción de sondeos resolvió por parche |
| `GET /live/games` | Marcador de todos los juegos en seguimiento (`?only_live=true`) |
| `GET /live/games/{game_pk}` | Uno solo, con la antigüedad del dato |
| `GET /live/games/{game_pk}/detail` | Relato, línea por entradas, boxscore y alineaciones (ver abajo) |
| `GET /live/games/{game_pk}/stream` | Flujo SSE: un evento por cambio, latido cada 20 s, cierra al llegar a final |

El generador SSE consulta la caché una vez por segundo y emite solo cuando cambia la marca de tiempo. Se podría notificar desde el hilo del poller con colas, pero eso obliga a cruzar hilos y asyncio; leer un diccionario en memoria cada segundo no cuesta nada y el marcador cambia cada diez.

**Arrancar el motor en vivo nunca tumba la aplicación.** Si la MLB API no
responde al arranque —sin red, un proxy de por medio, la API caída— antes la
excepción subía por el lifespan y uvicorn salía con *Application startup
failed*: el motor en vivo se llevaba consigo `/standings`, `/batting` y todo lo
demás, que no necesitan red para nada. Ahora se registra el fallo y la API queda
en pie sin motor en vivo.

**El poller no arranca solo.** Se enciende con `LIDOM_LIVE_POLLER=1` (y opcionalmente `LIDOM_LIVE_DATE=YYYY-MM-DD`), para que levantar la API a trabajar en los endpoints históricos no dispare tráfico contra la MLB API:

```bash
set LIDOM_LIVE_POLLER=1
python -m uvicorn api.main:app --reload
```

### El detalle de un juego

`src/live/detail.py` — **segundo** parser sobre el mismo GUMBO, deliberadamente
separado de `gumbo.py`. El de allá produce la tarjeta: 1.400 bytes que el móvil
sondea cada diez segundos por cada juego del día. Meterle el relato y el
boxscore lo llevaría a decenas de kilobytes y multiplicaría ese tráfico por
nada, porque la tarjeta no muestra ninguna de esas cosas. Esto se pide una sola
vez, cuando alguien abre un juego.

**Abrir un juego no dispara ni una petición contra la MLB API**: se proyecta del
documento que la caché ya tiene.

Cuatro proyecciones, que son las cuatro pestañas de la pantalla: relato
(`plays.allPlays`, del más reciente al más viejo), línea por entradas
(`linescore.innings`), boxscore (`boxscore.teams[].players`, los números de HOY)
y alineaciones (`battingOrder` + `pitchers` + `bullpen`).

Cinco cosas que no conviene deshacer:

- **Las descripciones de la MLB vienen en inglés** ("Manuel Pena flies out to
  center fielder…") y **no se traducen**. Traducir texto libre de una API ajena
  se rompe en silencio el día que cambien la redacción. El titular se compone en
  español desde los campos estructurados con `evento_es()`, que mapea sobre
  `result.event` —no sobre `eventType`, porque `field_out` cubre por igual un
  roletazo, un elevado y una palomita, y esa distinción le importa al fanático—
  y el texto original viaja en `description` por si el cliente lo quiere debajo.
  Un evento que no esté en `EVENTOS_ES` cae al inglés, nunca a una cadena vacía.
- **`inningsPitched` es un STRING.** `"0.2"` son dos outs, no dos décimas.
  Convertirlo a float lo rompe en silencio.
- **Una entrada sin jugar es `None`, no `0`.** El local que gana no batea en la
  baja del 9no; ahí el cuadro lleva un guion, y un cero sería mentira.
- **`battingOrder` múltiplo de 100 es titular**; 101 y 102 son quienes lo
  relevaron, y por eso ordenar por ese número deja a cada sustituto justo debajo
  del titular al que entró a sustituir.
- **`store.drop()` congela el detalle antes de soltar el crudo.** Sin eso, la
  pantalla de un juego recién terminado se quedaría vacía justo cuando más gente
  la abre. Son 42 KB en vez de un mega, y ya no va a cambiar. El endpoint
  devuelve `is_updating` para que el cliente sepa cuándo dejar de refrescar.

El relato viene recortado (`?plays=25` por defecto, el más reciente primero):
un juego completo son 71 jugadas y 42 KB, contra 23 KB con las 25 últimas. El
boxscore y las alineaciones son un piso fijo de 13 KB que recortar no toca.
`plays_total` siempre dice cuántas hay.

### Pantalla en vivo (web)

`frontend/app/live/page.tsx` + `components/LiveGames.tsx`, `LiveScoreboard.tsx`, `BaseDiamond.tsx`.

El detalle vive en `app/live/[gamePk]/page.tsx` + `components/game/`. Dos
diferencias con el listado que conviene no deshacer:

- **Sondea, no abre SSE.** El flujo `/stream` emite el marcador reducido, no el
  detalle; montar un segundo canal solo para esta pantalla no compensa. Un
  sondeo cada doce segundos sobre una caché en memoria no le cuesta nada al
  backend, y para cuando llega `is_updating: false`.
- **La pestaña vive en la URL** (`?t=boxscore`), no en estado. Así un enlace al
  boxscore de un juego abre en el boxscore y el botón de atrás del navegador
  funciona. El cambio usa `router.replace(..., { scroll: false })`: sin eso,
  cambiar de pestaña salta al tope de la página.

En pantalla ancha el boxscore y las alineaciones van a dos columnas; en angosta
se apilan.

La página no hace fetch en el servidor: el estado cambia cada diez segundos y cualquier cosa renderizada ahí nacería vieja. El componente cliente carga `/live/games` al montarse y abre un `EventSource` por juego que no esté terminado. Al recibir el evento `final` cierra la conexión — sin eso, `EventSource` reconecta solo y recibe el mismo par de eventos en bucle.

Para verla en movimiento fuera de temporada, dos consolas:

```bash
set LIDOM_LIVE_POLLER=1
set LIDOM_LIVE_REPLAY=826343
python -m uvicorn api.main:app
```
```bash
cd frontend
npm run dev
```

`src/live/replay.py` no añade ningún modo al poller: le inyecta un `ReplayClient` que imita la interfaz de `MLBAPIClient` caminando las marcas de un juego terminado y pidiendo los parches **reales** entre cada par. El frontend no distingue una repetición de un juego en vivo.

Dos trampas que ya costaron un fallo, documentadas para no repetirlas:

- En `/schedule` los equipos vienen anidados (`teams.home.team.id`); en el feed en vivo van directos (`gameData.teams.home.id`). Confundirlas deja los IDs en `None` y `discover()` no encuentra nada, en silencio.
- Los parches traen el `metaData.wait` real de 10 s, así que la repetición necesita añadir una operación extra que lo sobreescriba o se arrastra.

El móvil consume los mismos endpoints sondeando, no por SSE: React Native no trae `EventSource`. Ver la sección Mobile.

## Mobile (Expo)

**SDK 57** — React Native 0.86.3, React 19.2.3, navegación 7. Expo Go solo corre
proyectos de su misma versión de SDK, y en iPhone físico **no** se puede instalar
un Expo Go viejo, así que subir el SDK es obligatorio para probar en dispositivo.
Desde SDK 57 además hay que tener sesión iniciada **en los dos lados**: `npx expo
login` en la terminal y el avatar dentro de Expo Go, con la misma cuenta.

### El punto de entrada NO es App.tsx

`"main": "index.js"`, y ese archivo importa `expo` antes que `./App`. No es
cosmético:

```js
import { registerRootComponent } from 'expo';
import App from './App';
```

Importar `expo` primero ejecuta `expo/src/Expo.fx`, que instala los polyfills del
runtime —entre ellos un `URL` conforme al estándar— **antes** de que se cargue
`expo-asset`. Con `"main": "App.tsx"` ese archivo nunca corría, y como App.tsx
importa `@expo/vector-icons` → `expo-font` → `expo-asset`, y expo-asset calcula
`manifestBaseUrl` al importarse escribiendo sobre `url.protocol` (que en RN 0.86
es solo getter), la app moría antes de renderizar con:

```
TypeError: Cannot assign to property 'protocol' which has only a getter
```

No borrar `index.js` pensando que sobra.

### Pantalla en vivo

`src/screens/LiveScreen.tsx` **sondea**, no usa SSE: React Native no trae
`EventSource`, y para un marcador cuyo ritmo dicta la API (`poll_wait_seconds`)
un intervalo basta sin añadir dependencias. El sondeo se programa después de cada
respuesta —no con `setInterval`, para que no se apilen— y se detiene cuando la
pantalla pierde el foco o la app pasa a segundo plano.

El diamante (`components/BaseDiamond.tsx`) usa `View` rotadas 45°, no SVG:
`react-native-svg` no está en las dependencias y no vale añadir una librería
nativa por tres cuadrados.

### Detalle de un juego

Tocar una tarjeta abre `screens/GameDetailScreen.tsx` con cuatro pestañas:
`PlayByPlay`, `InningGrid`, `BoxScore` y `Lineups`, todas sobre
`/live/games/{pk}/detail`.

La pestaña "En Vivo" es una **pila** (`@react-navigation/native-stack`), no una
pantalla suelta: así hay gesto de volver y botón de atrás. Es JavaScript sobre
`react-native-screens`, que ya estaba, así que **no añade un módulo nativo
nuevo** ni obliga a salir de Expo Go. Los tipos de ruta viven en
`src/navigation.ts` y no en `App.tsx`, porque importar `App.tsx` desde una
pantalla haría un ciclo.

Tres cosas aprendidas al construirla:

- **El turno EN CURSO viene en `allPlays` sin resultado** (`event` en `null`,
  `is_complete` en `false`). Pintarlo como una jugada más lo dejaba con un
  guion. Se muestra como "En turno" con la cuenta y los outs.
- **El sondeo para cuando `is_updating` llega en `false`.** El juego terminó y
  el detalle está congelado en el backend; seguir pidiéndolo gasta batería por
  nada. Es una parada más que en el marcador, que solo para por foco y
  segundo plano.
- **Un fallo de red no borra lo que ya se mostraba.** Es mejor un dato de hace
  doce segundos que una pantalla en blanco; se marca "sin señal" y ya.

El `gamePk` viaja con los códigos de los dos equipos para que la cabecera tenga
título antes de la primera respuesta y no parpadee.

## El games_back de la MLB API no es distancia al líder

En `/standings`, el `games_back` que devuelve la API mide respecto al **cuarto
puesto**, que en LIDOM es la línea de clasificación al round robin. Se ve en los
datos: el `-` cae en el 4to y el líder aparece con valor negativo (−9.5).

`api/main.py` calcula el GB real desde G-P y conserva el de la API como
`playoff_games_back`, que hoy solo se usa como **contraprueba** en las pruebas:
para los equipos fuera debe ser exactamente `-playoff_games`. Si un día dejan de
cuadrar, uno de los dos cambió y conviene enterarse.

## La línea de clasificación

`src/playoffs.py`. LIDOM juega seis equipos y clasifican cuatro, así que el corte
entre el 4to y el 5to es lo único que se juega la temporada regular. `/standings`
devuelve tres campos para representarlo:

| Campo | Qué es |
|-------|--------|
| `playoff_spots` (raíz) | Cupos al round robin — hoy 4 |
| `playoff_spot` | Si ese equipo ocupa uno |
| `playoff_games` | Distancia a la línea, con signo: **positivo** = juegos de colchón sobre el primero que está fuera, **negativo** = de atraso contra el último que está dentro |

El punto de referencia cambia según el lado, a propósito: a un clasificado le
importa cuánto le pisa el 5to, y a uno fuera cuánto le falta para alcanzar al
4to. Medir ambos contra el mismo equipo daría un número correcto pero inútil.

Se calcula desde G-P y **no** se toma del `gamesBack` de la MLB, aunque hoy
coincida: depender de él sería depender de cómo la MLB decide agrupar una liga
que no es suya, y el día que cambie el formato la columna mentiría en silencio.

Dos cosas que no conviene deshacer:

- **`/standings` ordena por `win_loss_pct`, no por victorias.** Con juegos
  suspendidos los equipos no llegan al mismo total de juegos jugados y ganar más
  no significa ir delante. `playoff_spot` se calcula sobre ese orden, así que un
  orden equivocado corre el corte de equipo.
- **Los clientes NO reordenan.** Reordenar en el cliente desincroniza la bandera
  de la posición mostrada. Ambos traían un `.sort()` por PCT que ya se quitó.

`playoff_games` se normaliza con `+ 0.0`: negar cero en punto flotante da `-0.0`,
viaja así en el JSON y JavaScript lo imprime como `-0`.

## Probabilidad de ganar en vivo

`src/winprob.py`. El estado en vivo (`LiveGameState`) trae `win_prob_home` —
probabilidad de que gane el local, 0..1 — mientras el juego corre. En preview no
hay estado que simular y en final ya se sabe quién ganó, así que ahí va `None`.

**No se usa una tabla de Grandes Ligas, y no es purismo.** LIDOM anota **4.116
carreras por equipo por juego contra las ~4.5 de MLB**, con jonrones en el
**1.36 %** de las apariciones frente al ~3 % de allá. Menos carreras y mucho
menos poder significa que una ventaja se defiende mejor: dos carriles en el
séptimo valen más aquí. Una tabla importada subestimaría esa ventaja en todos
los juegos de la liga, siempre en la misma dirección.

**Es una cadena de Markov sobre los 24 estados base-out**, no un modelo ajustado
a jugadas. Para lo segundo harían falta play-by-play de las 14 temporadas y solo
existen los que el poller capturó — pero las probabilidades de transición salen
de tasas de eventos AGREGADAS, y esas sí están en las 45.029 líneas de bateo.

### Cómo se validó, que es lo que lo hace creíble

El modelo tiene parámetros libres (avance de corredores, outs productivos). El
criterio de aceptación NO es que el código corra:

| Qué se mide | Real | Modelo |
|---|---|---|
| Carreras por equipo por juego | 4.116 | 4.098 |
| Distribución completa de carreras | — | **5.0 puntos de error sobre 200** |
| El local gana | 54.3 % | 54.6 % |

La segunda fila es la que importa. **Solo se ajustó la media**; la distribución
entera —blanqueadas, el pico en 3 carreras, las colas de 10+— salió sola. Eso es
evidencia de que el modelo captura la estructura del béisbol de LIDOM y no
solamente un promedio.

Dos versiones fallaron antes de esta, y las dos están anotadas en el módulo: la
primera daba 2.55 carreras por juego (38 % baja) por mover corredores con
demasiada tacañería, y la segunda 3.50 por tratar todos los outs como si
congelaran a los corredores.

**Si alguien toca una probabilidad de avance, `verify_winprob.py` se entera.**

### Dos decisiones de producto dentro del modelo

- **La caché usa semilla fija.** Sin ella el mismo estado daría 61.2 % y al
  siguiente sondeo 60.8 %, y el usuario vería la barra temblar sin que pasara
  nada en el juego. Memoizar también es lo que hace viable simular 4.000 juegos:
  un juego entero toca unos pocos cientos de estados distintos.
- **`recalibrar()` es explícito, no automático.** Que las tasas cambiaran solas
  al ingestar una temporada haría que la misma situación diera números distintos
  de un día para otro sin que nadie lo hubiera decidido.

## Los forfeits no entran en las posiciones — deuda conocida

La validación cruzada de las 14 temporadas da **12 de 14 idénticas equipo por
equipo**. Las dos que no cuadran fallan por un solo juego cada una, y los dos
son forfeits:

| `game_id` | Marcador en la pizarra | Ganador oficial |
|-----------|------------------------|-----------------|
| `2016-11-22-GIG-LIC-1` | GIG 2 – LIC 10 | LIC |
| `2022-11-06-LIC-AGU-1` | LIC 5 – **AGU 6** | **LIC** |

Tres cosas se juntan aquí:

1. `CODED_STATE_TO_STATUS` en `boxscore_ingestor.py` mapea `"F"` y `"O"` a
   `final`. El código de un forfeit es **`"R"`**, que no está en la tabla, así
   que cae al default `"scheduled"`. El juego queda sin boxscore y
   `v_standings` —que filtra `status = 'final'`— lo ignora.

2. **El ganador de un forfeit NO se deduce del marcador.** Mírese la segunda
   fila: Licey anotó menos carreras y ganó, porque el juego se perdió por
   jugador inelegible. Cualquier código que compare `home_score` contra
   `away_score` acierta en los 2.012 juegos normales y se equivoca **al revés**
   en este.

3. La MLB API sí lo dice — `teams.away.isWinner` / `teams.home.isWinner` — pero
   `games` no guarda ese campo, porque hasta ahora nunca hizo falta.

**El arreglo va junto con la migración a PostgreSQL**, porque necesita una
columna nueva y por tanto recrear la tabla y reingestar las 14 temporadas:

- `"R"` → un estado propio, `forfeit`. No `final`: mezclarlos esconde
  exactamente el caso que hay que tratar aparte.
- Columna `winner_team_code`, poblada desde `isWinner` para **todos** los
  juegos, no solo los forfeits.
- `v_standings` usa esa columna cuando existe y cae al marcador cuando no.

Mientras tanto son 4 temporadas-equipo mal por un juego, de 84. El resto de la
base está bien.

## Deuda de seguridad conocida

**Resuelto:** las 3 vulnerabilidades de Next.js (1 crítica, RCE sin autenticar en
servidores Windows) afectaban el rango `9.3.4 – 16.3.0`, o sea toda la línea 14 y
15. No había parche dentro de 14.x; se migró a Next 16.3.5.

**Pendiente, y hay que resolverlo antes de desplegar:** la API no tiene
autenticación ni límite de tasa, CORS está fijo en el código, y `/health` expone
conteos internos.

## Próximos pasos

1. Afinar `on_final`: hoy reingesta la temporada apoyándose en el checkpoint; sería más limpio ingestar solo ese `gamePk`.
2. Completar las tablas planas del backfill: `python main.py ingest <año>` para 2012–2023. El esquema de juego ya tiene las 14 temporadas; las planas solo 2024 y 2025.
3. Probar el poller contra juegos reales cuando arranque la 2026-27 (mediados de octubre). Hasta entonces, `replay_game.py` y las suites cubren el camino.
4. Cerrar la deuda de seguridad de la API antes de desplegar (autenticación, límite de tasa, CORS por configuración, `/health`).
5. Scraper secundario de lidom.com para rosters y noticias. Requeriría reinstalar `beautifulsoup4` — se quitó de `requirements.txt` cuando se eliminaron los scrapers legacy, porque ningún módulo la importaba.
6. Producción: PostgreSQL vía Alembic, y varios workers de uvicorn — ojo, la caché en memoria es por proceso, así que ahí haría falta Redis o un solo worker dedicado al poller.

## Antes de monetizar: leer la guía legal

Si el proyecto va a llevar anuncios, hay decisiones que cuestan cero hoy y mucho
después. Las dos concretas: **el nombre "LIDOM Stats"** usa una marca ajena para
identificar el producto (art. 86 de la Ley 20-00), y **los escudos** acumulan
marca figurativa, derecho de autor y competencia desleal — LIDOM y los seis
clubes tienen una campaña de protección de marca declarada desde 2022.

Y la de fondo: cada respuesta de `statsapi.mlb.com` trae un `copyright` que
apunta a `gdx.mlb.com/components/copyright.txt`, donde MLBAM permite solo uso
**individual, no comercial y no masivo**. Este pipeline incumple las tres en
cuanto haya un banner.

`static/crests/` puede vaciarse sin tocar código: `TeamBadge` cae a las siglas
por su cuenta en las dos plataformas. Eso fue diseño deliberado, no casualidad.

La guía completa, con fuentes y precedentes, está en el proyecto de Claude como
`claude/guia-legal-ads.md`.
