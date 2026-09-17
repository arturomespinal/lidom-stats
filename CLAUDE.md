# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Pipeline de datos + API + dashboard visual para estadísticas de LIDOM (béisbol profesional dominicano). Objetivo comercial: producto tipo SofaScore. Proyecto de pasantía.

## Fuente de datos canónica

**MLB Stats API** — `statsapi.mlb.com/api/v1` — pública, sin autenticación.
- `leagueId=131` (LIDOM), `sportId=17` (Winter Leagues)
- IDs de equipos LIDOM: 667–672 (AGU, TOR, EST, GIG, ESC, LIC) — ver `src/constants.py`
- **No usar Baseball-Reference**; los scrapers BR que quedan en `src/scrapers/` son legacy.

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

# Prueba de integración del ingestor (cliente MLB simulado, SQLite aparte)
python verify_boxscore_ingestor.py

# Levantar la API
uvicorn api.main:app --reload          # http://localhost:8000
# Docs interactivas: http://localhost:8000/docs

# Tests
pytest
```

### Frontend (Next.js) — desde `frontend/`

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
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
   frontend/ (Next.js 14)         mobile/ (Expo)
   /          → posiciones
   /batting   → líderes de bateo
   /pitching  → líderes de pitcheo
```

**Estado actual:** la API y el frontend consumen las tablas planas. El esquema de juego está poblado para 2025-26 (149 juegos) pero todavía no tiene endpoints propios.

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
| `verify_boxscore_ingestor.py` | 33 comprobaciones del ingestor contra un boxscore sintético |
| `verify_game_routes.py` | 45 comprobaciones de los endpoints nuevos contra la base real |

## Endpoints

### Tablas planas (`api/main.py`) — los que consumen el frontend y el mobile

`/standings` · `/batting` · `/pitching` · `/player/{name}` · `/seasons`

Parámetro `season` en formato crudo de la MLB API (`"2025"`).

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

10. **El mínimo de calificación solo aplica a estadísticas de tasa**. AVG, OBP, SLG, OPS, ERA y WHIP lo llevan; jonrones, ponches, victorias y salvados no — nadie exige un mínimo para liderar una acumulada. Y el estándar de la MLB no es trasladable al pitcheo invernal: 1.0 IP por juego de equipo deja **un solo** calificado en LIDOM, porque un abridor de aquí hace 8–14 aperturas contra las ~32 de Grandes Ligas. Usamos 0.6 (30 IP), que deja 14 — la misma proporción por equipo que el 3.1 PA/juego del bateo. Constantes en `api/game_routes.py`.

11. **No migrar a PostgreSQL aún** — Alembic se agregará cuando se decida migrar.

## Validación cruzada

Las dos capas nacen de la misma API por caminos independientes, así que deben coincidir. Para 2025-26 coinciden al dígito: 9.998 AB, 2.472 H, 195 HR, 1.209 ER, 2.351 K, 149 W, 149 L, 72 SV, y los seis equipos de `v_standings` reproducen exacto la tabla `standings`.

Única diferencia conocida: **Enmanuel Mejía**, 5 juegos en la vista contra 4 en la tabla plana. No es un bug — sus IP coinciden (10 outs = 3.33). La tabla plana lee `gamesPlayed` de `/stats`, que para lanzadores no cuenta igual que las apariciones reales en boxscores. La vista es la correcta.

Nota de alcance: esto prueba que la agregación es correcta, **no** que los datos de la MLB lo sean. Contrastar contra el portal de LIDOM requeriría el scraper secundario.

## Frontend

- `NEXT_PUBLIC_API_URL` en `frontend/.env.local` apunta al backend (default: `http://localhost:8000`)
- Tema oscuro fijo, colores de equipos en `frontend/lib/constants.ts`
- Tablas sortables por clic en columna (client components), fetch en server components
- Empty state visible cuando la DB está vacía (muestra el comando `python main.py ingest`)

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
| `GET /live/games/{game_pk}/stream` | Flujo SSE: un evento por cambio, latido cada 20 s, cierra al llegar a final |

El generador SSE consulta la caché una vez por segundo y emite solo cuando cambia la marca de tiempo. Se podría notificar desde el hilo del poller con colas, pero eso obliga a cruzar hilos y asyncio; leer un diccionario en memoria cada segundo no cuesta nada y el marcador cambia cada diez.

**El poller no arranca solo.** Se enciende con `LIDOM_LIVE_POLLER=1` (y opcionalmente `LIDOM_LIVE_DATE=YYYY-MM-DD`), para que levantar la API a trabajar en los endpoints históricos no dispare tráfico contra la MLB API:

```bash
set LIDOM_LIVE_POLLER=1
python -m uvicorn api.main:app --reload
```

### Pantalla en vivo (web)

`frontend/app/live/page.tsx` + `components/LiveGames.tsx`, `LiveScoreboard.tsx`, `BaseDiamond.tsx`.

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

**El `mobile/` (Expo) todavía no tiene pantalla en vivo.** El backend le sirve igual, pero React Native no trae `EventSource`: haría falta `react-native-sse` o consultar `/live/games` con un `setInterval`, que para un marcador de ritmo conocido es suficiente.

## Próximos pasos

1. Pantalla en vivo en el `mobile/` (Expo), con polling o `react-native-sse`.
2. Afinar `on_final`: hoy reingesta la temporada apoyándose en el checkpoint; sería más limpio ingestar solo ese `gamePk`.
3. Probar el poller contra juegos reales cuando arranque la 2026-27 (mediados de octubre). Hasta entonces, `replay_game.py` y las suites cubren el camino.
4. Backfill histórico: `ingest-games` por temporada hacia atrás (`2024`, `2023`, …).
5. Producción: PostgreSQL vía Alembic, y varios workers de uvicorn — ojo, la caché en memoria es por proceso, así que ahí haría falta Redis o un solo worker dedicado al poller.
4. Scraper secundario de lidom.com para rosters y noticias (httpx + BeautifulSoup).
5. Producción: PostgreSQL vía Alembic cuando el volumen lo justifique.
