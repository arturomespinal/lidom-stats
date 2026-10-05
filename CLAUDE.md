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

**Segunda fuente: DIGIMETRICS** — `estadisticas.lidom.com`, el portal oficial de
la liga. Aporta la HISTORIA desde 1951, que la MLB API no tiene. Ver "La capa
histórica (DIGIMETRICS)".

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
python main.py ingest-game 826343             # un solo juego (lo que hace el motor en vivo al final)

# Capa histórica desde DIGIMETRICS (estadisticas.lidom.com). Necesita red.
python main.py ingest-historia --smoke        # solo 1990-91 (~35 pedidos, menos de un minuto)
python main.py ingest-historia                # 1951-2019, ~2.300 pedidos a 1 por segundo: ~1 hora
python main.py ingest-historia 1951 2011      # un rango
python main.py ingest-historia --sin-red      # reprocesar solo desde la caché
python main.py cruzar-historia                # DIGIMETRICS contra la MLB API, 2012-13 a 2019-20
python main.py enlazar-historia               # jugadores DIGIMETRICS ↔ MLB API (ingest-historia ya lo hace)

# Levantar la API
uvicorn api.main:app --reload          # http://localhost:8000
# Docs interactivas: http://localhost:8000/docs

# La API con un juego ya cargado en la caché en vivo, desde fixtures/. Sin red.
python dev_live_offline.py             # ver "Trabajar la pantalla de juego sin red"

# Las once suites. Ninguna necesita red: corren contra fixtures, un cliente
# MLB simulado o la base local. Son scripts, no pytest — salen con código 0
# si todo pasa, así que encadenarlas con && funciona.
python verify_game_routes.py         # endpoints del esquema de juego
python verify_live_detail.py         # parser del detalle
python verify_live_parser.py         # parser de la tarjeta
python verify_live_poller.py         # poller y cadena de parches
python verify_boxscore_ingestor.py   # ingestor contra boxscore sintético
python verify_api_models.py          # modelos Pydantic contra JSON real
python verify_winprob.py             # modelo de probabilidad contra los datos reales
python verify_capas.py               # tablas planas contra el esquema de juego, temporada por temporada
python verify_seguridad.py           # la API en modo producción: límite, CORS, diagnóstico con clave
python verify_digimetrics.py         # scraper de DIGIMETRICS contra páginas reales guardadas
python verify_historia.py            # enlace entre fuentes, carrera completa y líderes de todos los tiempos

# Tablas planas de todas las temporadas (necesita red; ya cargadas 2012–2025):
# for /L %y in (2012,1,2025) do python main.py ingest %y
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
   /            → Hoy (la jornada)
   /posiciones  → tabla de posiciones
   /batting     → líderes de bateo
   /pitching    → líderes de pitcheo
```

**Estado actual:** el esquema de juego cubre **14 temporadas, de la 2012-13 a la
2025-26** — 2.014 juegos, 2.253 jugadores, 45.029 líneas de bateo y 24.729 de
pitcheo. **Las tablas planas cubren las mismas 14**, así que `/standings`,
`/batting` y `/pitching` responden para toda la historia.

La validación cruzada entre las dos capas se corrió sobre las 14: **12 coinciden
equipo por equipo**. Las dos que no son el caso de los forfeits, documentado más
abajo.

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
| `src/lateralidad.py` | Traducción de `bats`/`throws` — los TRES códigos, incluido 'S' |
| `src/models/api_models.py` | Pydantic: validación de respuestas MLB (maneja strings ".368") |
| `src/pipeline/mlb_ingestor.py` | `MLBIngestor.ingest(season)` — puebla las 3 tablas planas |
| `src/pipeline/boxscore_ingestor.py` | `BoxscoreIngestor.ingest(season)` — puebla el esquema de juego |
| `api/main.py` | Endpoints sobre tablas planas: `/standings`, `/batting`, `/pitching`, `/player/{name}`, `/seasons` |
| `api/game_routes.py` | Endpoints sobre el esquema de juego (router aparte, ver abajo) |
| `src/constants.py` | `LIDOM_TEAMS` (IDs MLB → códigos), `LIDOM_LEAGUE_ID`, `LIDOM_SPORT_ID` |
| `src/qualification.py` | Mínimos de calificación (PA/IP), compartidos por las dos capas |
| `src/carrera.py` | Totales de carrera: las tasas se RECOMPONEN, no se promedian |
| `src/fichas.py` | Del id de la MLB al slug de la ficha, para el detalle en vivo |
| `src/contexto.py` | El jugador contra la liga: puestos entre calificados, curva de carrera y sus titulares |
| `src/boxscore.py` | El boxscore de un juego terminado desde la base, con la forma del detalle en vivo |
| `src/jornada.py` | La jornada de una fecha: destacado, figuras, titular y lo que viene (portada Hoy) |
| `src/banderin.py` | La temporada de un equipo juego a juego: carrera por el banderín, últimos diez, posición y titulares |
| `src/playoffs.py` | `PLAYOFF_SPOTS` y la distancia con signo a la línea de clasificación |
| `verify_boxscore_ingestor.py` | 50 comprobaciones del ingestor contra un boxscore sintético, incluida la ingesta de un solo juego |
| `verify_game_routes.py` | 316 comprobaciones de los endpoints contra la base real |
| `verify_capas.py` | Validación cruzada de las dos capas en cada temporada cargada (83 comprobaciones con las 14) |
| `api/seguridad.py` | Modo producción: límite por IP, CORS por configuración, diagnóstico con clave, cabeceras |
| `verify_seguridad.py` | 49 comprobaciones de la API levantada en modo producción |
| `.env.example` | Las variables de entorno de producción, con lo que hace cada una |
| `src/clients/digimetrics.py` | Cliente de estadisticas.lidom.com: POST, 1 pedido/s, caché en disco, tope de tamaño |
| `src/scrapers/digimetrics.py` | Parser de las tablas de DIGIMETRICS: columnas por encabezado y tasas recalculadas |
| `src/models/hist_models.py` | La capa histórica `hist_*` y `etiqueta_historica()` |
| `src/pipeline/historia_ingestor.py` | `HistoriaIngestor.ingest(temporadas)` — DIGIMETRICS → `hist_*` |
| `src/pipeline/cruce_historia.py` | DIGIMETRICS contra el esquema de juego, equipo por equipo |
| `verify_digimetrics.py` | 67 comprobaciones del scraper sin red (76 con la caché y la capa histórica); parsea también la caché real si existe |
| `src/historia.py` | Enlace DIGIMETRICS ↔ MLB API, carrera completa de las dos fuentes y líderes de todos los tiempos |
| `src/nombres.py` | Cómo se escriben en pantalla los nombres de DIGIMETRICS: apodos, abreviaturas, tildes |
| `api/historia_routes.py` | `/historia/lideres`, `/historia/resumen`, `/historia/miembros/{id}`, el bloque `history` de la ficha y los `historicos` del buscador |
| `verify_historia.py` | El enlace, la carrera sin contar dos veces 2012-2019, los líderes; contra una base sintética y contra la real |
| `verify_datos/digimetrics/` | Páginas reales de DIGIMETRICS guardadas byte a byte para la suite |
| `src/live/detail.py` | Proyección detallada de un juego: relato, línea, boxscore, alineaciones |
| `dev_live_offline.py` | Siembra la caché en vivo desde `fixtures/` y levanta la API, sin red |
| `.github/workflows/verify.yml` | Integración continua: 8 suites, la web y el móvil en cada push |
| `deploy/oracle/` | Despliegue en Oracle Cloud: instalador, servicios de systemd, Caddy, respaldo diario y la guía (`GUIA.md`) |

Las once suites corren sin red y se encadenan con `&&`: salen con código 0 solo
si todo pasa.
Ocho corren además en GitHub Actions en cada push (ver "Integración continua").

## Endpoints

### Tablas planas (`api/main.py`) — los que consumen el frontend y el mobile

`/standings` · `/batting` · `/pitching` · `/player/{name}` · `/seasons`

Parámetro `season` en formato crudo de la MLB API (`"2025"`).

`/batting` y `/pitching` devuelven además `player_id`, el slug de la ficha: la
tabla plana solo guarda el nombre, así que se cruza con `players` por
`mlb_id` (**LEFT JOIN**: un jugador que no esté en el esquema de juego conserva
su fila, con `player_id` en `null` y sin enlace). En 2025-26 enlazan 413 de 413
bateadores y 498 de 498 lanzadores. Es lo que hace que una fila de líderes
lleve a la ficha, en las dos plataformas.

`/standings` ordena por PCT y añade, sobre lo que guarda la tabla: `short_name`
(del catálogo canónico, para pantallas angostas), `playoff_spot`, `playoff_games`
y `playoff_games_back`. Ver "La línea de clasificación", más abajo.

### Esquema de juego (`api/game_routes.py`)

| Endpoint | Qué da |
|----------|--------|
| `GET /games` | Listado con filtros: `team`, `opponent`, `stage`, `status`, `date_from`, `date_to`, `order`, paginado con `limit`/`offset` |
| `GET /games/{game_id}` | Boxscore completo: las dos alineaciones con líneas de bateo y pitcheo |
| `GET /games/{game_id}/detail` | La página de un juego terminado: cabecera, titular, figuras y boxscore con la forma del detalle en vivo |
| `GET /players/search?q=` | Busca por nombre, devuelve `player_id` |
| `GET /players/{player_id}` | Perfil biográfico + edad + temporadas + totales de carrera + `context` (contra la liga y curva) |
| `GET /players/{player_id}/gamelog` | Juego por juego, con resultado del equipo, fecha legible y la línea compuesta de la portada |
| `GET /leaderboards/batting` | Líderes con calificación por PA |
| `GET /leaderboards/pitching` | Líderes con calificación por IP |
| `GET /teams/{code}` | Ficha del equipo: historial, destacados, plantilla + `race`, `standing`, `last10` y titulares |
| `GET /teams/{code}/h2h/{rival}` | Historial entre dos equipos, con desglose local/visitante |
| `GET /day?date=` | La jornada: juegos, destacado con titular, figuras y la próxima fecha. Portada Hoy |
| `GET /calendar?season=` | Las jornadas de una temporada como meses con semanas ya armadas (lunes a domingo) |

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

Las dos capas nacen de la misma API por caminos independientes, así que deben coincidir. `verify_capas.py` lo comprueba en cada temporada que esté en las dos: posiciones equipo por equipo, totales de bateo y pitcheo de la liga, y jugador por jugador (cruzado por `players.mlb_id`, sumando los equipos de quien cambió de club). Antes de eso comprueba que cada juego final cuadre consigo mismo: las carreras de bateo de cada equipo y las permitidas por el pitcheo rival suman el marcador, en los 2.005 juegos.

Con las 14 temporadas cargadas (30-sep-2026): **8 idénticas al dígito** (2012-13 a 2015-16, 2018-19, 2019-20, 2024-25, 2025-26). Para 2025-26: 9.998 VB, 2.472 H, 195 HR, 1.209 CL, 2.351 K, 72 SV. Las otras seis difieren por causas conocidas, y la suite las fija EXACTAS —cuánto cambia cada total y qué jugadores—, así que cualquier diferencia nueva la hace fallar:

- **Forfeits (2016-17, 2022-23).** El juego no tiene boxscore (ver "Los forfeits no entran en las posiciones"). La suite exige que la diferencia quede confinada a los dos equipos de ese juego, y a un juego como mucho en posiciones.
- **Discrepancias de la propia MLB API (2017-18, 2020-21, 2021-22, 2023-24).** `/stats` no coincide con la suma de sus propios boxscores. Como los boxscores sí cuadran con el marcador juego por juego, la diferencia está en `/stats`, no en nuestra agregación:
  - 2017-18 y 2023-24: una jugada reanotada después del juego (un hit, un VB, un out, un robo).
  - 2020-21: tres carreras de menos en `/stats`. Esa campaña usó el corredor automático en extrainnings; lo más probable es que `/stats` no le acredite la carrera.
  - 2021-22: un bloque de Escogido y Águilas (5 bateadores, 7 lanzadores, una derrota) que está en `/stats` y en ningún boxscore. Las posiciones sí cuadran, así que no es un juego perdido.

**Para las cifras de la app manda el esquema de juego**: es el que se puede auditar juego por juego.

Otra diferencia que no se compara a propósito: juegos jugados. **Enmanuel Mejía** tiene 5 juegos en la vista contra 4 en la tabla plana, con las mismas IP (10 outs = 3.33). La tabla plana lee `gamesPlayed` de `/stats`, que para lanzadores no cuenta igual que las apariciones reales en boxscores. La vista es la correcta.

Los mínimos de calificación de las tablas planas se ajustan solos al largo de cada temporada: 2020-21 (30 juegos por equipo) pide 93 PA y 18 IP; 2012-13 (hasta 51), 158 PA y 30.6 IP.

Nota de alcance: esto prueba que la agregación es correcta, **no** que los datos de la MLB lo sean. Para contrastar contra el portal de LIDOM está `python main.py cruzar-historia` (ver "La capa histórica (DIGIMETRICS)").

## Frontend

- `NEXT_PUBLIC_API_URL` en `frontend/.env.local` apunta al backend (default: `http://localhost:8000`)
- Tema claro con tinta navy (ver "La paleta"); colores de equipos en `frontend/lib/constants.ts`
- Tablas sortables por clic en columna (client components), fetch en server components
- Empty state visible cuando la DB está vacía (el comando `python main.py ingest` solo se muestra en desarrollo)

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

## Marcas de equipo: no hay escudos

Los escudos oficiales se quitaron (ver "Antes de monetizar"). `TeamBadge`, en
las dos plataformas, dibuja el código de tres letras en una teja del color del
club — marca propia, sin archivo que pedirle al backend. `static/crests/` y el
montaje `/static` pueden desaparecer sin tocar ningún cliente.

Los colores de club viven en `TEAM_STYLES` (web `frontend/lib/constants.ts`,
móvil `mobile/src/constants.ts`, **los mismos valores**). El azul oficial de
Licey (#003DA5) y el verde de Estrellas (#00713B) se subieron de luminosidad
cuando la app era oscura; con el tema claro los primarios se quedaron y cada
club ganó una tinta (`text`) para texto sobre blanco. Ver "La paleta".

## La paleta: tema claro, tinta navy

**Decidido el 25-sep-2026, después de probar el navy oscuro ese mismo día.** La
dirección visual sale de un kit de referencia de apps deportivas (Sportify, de
Visiata, en Figma Community): fondos claros, títulos en **Bebas Neue**, franjas
oscuras de contexto y una **diagonal** como firma. Se tomó la dirección, no el
kit: ni sus imágenes, ni sus escudos, ni su nombre.

El kit tiñe su negro con su rojo de marca (`#150000`). Aquí el negro se tiñe
con el navy de Deportiv: la tinta es `#0B1830` y las franjas y lo seleccionado
van en el navy de marca `#091C3A`. Misma lógica, nuestra marca.

### Sin color de acento — y por qué no el coral del kit

El acento del kit es un coral, `#FF5050`. Medido contra los clubes: **ΔE 3.3
contra Escogido** —el mismo color—, 13.1 contra Toros y 12.7 contra Gigantes.
Con ese acento cada botón y cada pestaña activa se leerían como de Escogido, y
un fanático del Licey abriría una app con los colores del rival. El acento es
la tinta navy: lo seleccionado se rellena de navy con texto blanco, o se marca
con una raya navy debajo (las pestañas).

### Contraste medido, no a ojo

Todo token de texto pasa 4.5:1 sobre las **cuatro** superficies, incluida la
hundida, que es la más oscura:

| Token | `--bg` | `--card` | `--raised` | `--sunken` |
|-------|-------:|---------:|-----------:|-----------:|
| `fg` | 16.2 | 17.7 | 15.5 | 14.9 |
| `fg2` | 9.0 | 9.8 | 8.6 | 8.3 |
| `dim` | 5.6 | 6.1 | 5.3 | 5.1 |
| `faint` | 5.1 | 5.6 | 4.9 | 4.7 |

- **Los semánticos se oscurecieron** hasta pasar sobre el fondo: el verde de
  "positivo" del tema oscuro daba 1.9:1 sobre blanco.
- **"EN VIVO" va sólido**, blanco sobre rojo (5.0:1). Rojo sobre rojo al 16%
  daba 3.95:1.
- **La jugada de anotación va en tinta** sobre un verde tenue: verde sobre
  verde daba 4.2:1.
- **Los tokens de borde no son color de texto** (1.4:1).

### Los colores de club sobre fondo claro

`TEAM_STYLES` lleva cuatro campos, iguales en las dos plataformas:

| Campo | Para qué |
|-------|----------|
| `primary` | El color del club: relleno de la teja sólida, franja de fila, lavados de la curva |
| `tint` | El primario al 12%, relleno de la teja perfilada |
| `text` | La **tinta** del club: el primario oscurecido hasta 4.5:1 sobre blanco. El amarillo de Águilas da 2.0:1 tal cual |
| `on` | El texto **encima** de la teja sólida: tinta o blanco, el que más contraste dé. Blanco sobre Águilas daría 2:1; tinta sobre Toros, 3.2:1 |

Gigantes pasó de `#D6357F` a `#D2327C`: visualmente igual (ΔE < 1), pero con el
primero el blanco encima daba 4.49:1.

### El color de club NUNCA identifica solo

Toros, Escogido y Gigantes caen los tres en la familia roja-magenta:
**Gigantes↔Toros ΔE 7.4 y Escogido↔Gigantes 10.7**, bajo el piso de 15 incluso
con visión normal. Se probaron seis tonos para Toros y ninguno pasa: es
estructural. Toda marca de club lleva su código escrito, y en la franja de
probabilidad cada equipo tiene su lado de la línea del 50%. En la tabla de
posiciones se ve: las franjas de las filas 2 a 4 casi no se distinguen, y los
códigos sí.

### La tipografía: Bebas Neue

Títulos de página y de sección, marcadores, códigos de equipo, estados y el
logotipo. **Tiene un solo peso (400) y solo mayúsculas**, y eso trae dos reglas:

- **Web:** `.font-cond { font-synthesis: none }` en `globals.css`. Sin eso,
  cada `font-bold` junto a `font-cond` hacía que el navegador fabricara una
  negrita falsa engordando los trazos.
- **Móvil: nunca `fontWeight` junto a `FONTS.display`.** En Android, pedir
  '700' a una fuente propia de un solo peso hace que el sistema la sustituya
  por Roboto, sin error y sin aviso.

El cuerpo sigue en Archivo (web) y la fuente del sistema (móvil): las dos
tienen cifras tabulares, que es lo que importa en una app de estadísticas. En
el móvil la fuente se carga con `@expo-google-fonts/bebas-neue`, y la pantalla
de arranque se retiene hasta que está lista —si no, la primera pantalla
aparece un instante en Roboto y luego salta—. Si la carga falla, la app
arranca igual con la del sistema.

### Las firmas del kit, en nuestros componentes

- **La diagonal**: un plano gris cortado en diagonal detrás de las columnas
  C/H/E de la tarjeta de partido. En la web es un degradado con corte duro; en
  el móvil, un `View` con `skewX` dentro de un contenedor que recorta — sin
  librería de degradados. Sigue a la esquina cortada de tejas y estados, que
  se quedó.
- **La franja navy de contexto** al pie de la tarjeta: el estadio y "Ver el
  juego ›", 44 px de alto.
- **Pestañas con subrayado** en lugar de píldoras, en la barra superior, en
  el detalle de juego web y en el del móvil. Todas miden 44 px de alto.
- **La esquina cortada**, que es anterior al kit y se quedó, reservada a las
  tejas de equipo (`TeamBadge`) y los estados (`StatusBadge`). En la web,
  `clip-path` con un corte de 6 px **fijos** (`calc`), no un porcentaje: "FINAL
  (10)" mide el doble que "FINAL" y la diagonal crecería con el texto. La teja
  perfilada no puede llevar `clip-path` —cortaría el borde— y usa el eco del
  móvil: la esquina inferior derecha con casi el doble de radio. React Native
  no tiene `clip-path` y usa ese radio en todo.

Fuente única por plataforma. **Ningún componente escribe un hex a mano**:

| Plataforma | Dónde | Cómo |
|-----------|-------|------|
| Web | `frontend/app/globals.css` + `tailwind.config.ts` | Variables CSS con **canales RGB** (`--card: 255 255 255`), expuestas como `rgb(var(--card) / <alpha-value>)`. Se usan por nombre: `bg-card`, `text-dim`, `bg-ink`. |
| Móvil | `mobile/src/constants.ts` | `COLORS`, `ALPHA` y `FONTS`, con los mismos valores. |

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

**Pasada la décima, los ordinales tenían un error de español** que la suite
protegía: el respaldo era `f"{n}vo"` y daba "11vo", "12vo". Eso viene de
"onceavo", que es un **partitivo** (una onceava parte), no un ordinal. Ahora:
11mo (undécimo), 12mo (duodécimo), 13ro (decimotercero), 14to… — a partir del
13 el sufijo lo pone la unidad, y en las decenas redondas es "mo". La
comprobación vieja decía `ordinal_es(12) == "12vo"`: una prueba que protege la
respuesta equivocada es peor que no tener prueba.

El feed de pre-juego ya expone la alineación publicada — primer bateador y abridor — así que sirve para la pantalla previa.

`fixtures/` está fuera del control de versiones: son megas de JSON que se vuelven a bajar en un minuto.

### El poller

`src/live/poller.py` corre en su propio hilo y mantiene al día la caché volátil. Un ciclo: `/schedule` dice qué juegos hay hoy → la primera vez de cada juego se baja el feed completo → a partir de ahí **solo parches** desde la última marca, aplicados sobre el crudo guardado → al pasar a final dispara `on_final` y suelta el documento crudo.

Medido sobre doce sondeos reales: **7,9 MB por feed completo contra 0,75 MB por parches, 10,5 veces menos.** Y el estado que sale de la cadena de parches es idéntico campo por campo al del feed completo. La única discrepancia entre ambos documentos son 49 valores `int` frente a `float` en `pitchData` y `hitData` — mismo número, distinta serialización, y nada de eso llega al marcador.

Cuando un parche no se puede aplicar —respuesta con forma inesperada, marca demasiado vieja, operación inválida— el poller baja el feed completo. Es más caro, pero nunca deja el estado corrupto.

`src/live/store.py` es la caché: deliberadamente en memoria y **no** en SQLite. La base es la verdad histórica y se escribe una vez por juego; esto cambia cada diez segundos y no debe sobrevivir a un reinicio. Si el proceso cae, el poller reconstruye todo en un sondeo. Guarda el GUMBO crudo (porque los parches se aplican sobre él) y el estado reducido; al terminar un juego suelta el crudo, que es un megabyte sin uso.

### Al terminar un juego: se ingesta ESE juego (30-sep-2026)

`on_final` (en `api/live_routes.py`, `_ingest_finished_game`) llama a
`BoxscoreIngestor.ingest_game(game_pk)`: el juego en `/schedule?gamePk=`, su
boxscore y `/people` solo si hay jugadores nuevos. Dos o tres peticiones, y se
escribe solo ese juego. Antes corría `ingest(season)` entero: el calendario de
la temporada (~150 juegos) reescrito en `games` en cada final, seis veces por
jornada — y como `ingest()` pide por defecto solo temporada regular, **un juego
del round robin o de la final que terminaba no se ingestaba nunca**.

- `ingest_game` respeta las reglas de la ingesta por temporada: la colisión de
  `game_id` (una entrada no final no pisa un juego ya final, regla 7), los
  `innings_played` de los outs reales (regla 8) y el `merge` idempotente.
- **No reescribe la temporada**: `_upsert_season` tomaría las fechas de este
  único juego como inicio y fin. `_ensure_season` la crea si falta y corre la
  fecha final si el juego es posterior.
- La temporada sale del estado en vivo y, si no viene, del calendario del
  propio juego (`/schedule` trae `season` en cada juego).
- **Después pone al día las tablas planas** (`MLBIngestor.ingest`, tres
  peticiones) si el juego entró. Sin eso, en plena temporada Posiciones,
  Bateo y Pitcheo seguirían con los números del día en que alguien corrió
  `python main.py ingest` a mano, y la temporada nueva no aparecería en el
  selector. Un fallo ahí no deshace el juego, y ningún fallo sale del hilo
  del poller.
- A mano: `python main.py ingest-game <gamePk>`. Sale con código 1 si el juego
  no se ingestó (no existe, no es de LIDOM o no ha terminado).
- `verify_boxscore_ingestor.py` lo prueba con el cliente simulado (un juego del
  round robin que la ingesta por temporada no ve, la colisión, idempotencia,
  la temporada intacta) y `verify_live_poller.py` el cableado de `on_final` con
  ingestores dobles.

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

**Cada jugador del detalle lleva a su ficha.** En las filas del detalle,
`player_id` es el **número de la MLB** (688005), no el slug que usa el resto
de la API, y no sirve para enlazar. La ruta añade `profile_id` —el slug— a
bateadores, lanzadores, bullpen y banca con `anotar_fichas()`
(`src/fichas.py`), una sola consulta a `players` por `mlb_id` para los dos
equipos. El relato no: sus `batter` y `pitcher` son solo nombres.

- El cruce vive en la **ruta**, no en `detail.py`: el parser sigue siendo una
  función pura sobre el GUMBO, sin base de datos.
- `profile_id` en `null` es normal: un debutante en su primer juego todavía no
  está en `players`. Se pinta el nombre, sin enlace. En el juego inaugural
  enlazan 100 de 101 (el que falta estaba en el bullpen y nunca jugó).
- Se cachean los aciertos (un slug no cambia nunca) y **no los fallos**: el
  debutante tiene que enlazar en cuanto se ingeste, sin reiniciar la API.
- En el móvil las filas del boxscore y las alineaciones pasaron a 44 pt, porque
  ahora son tocables. El bullpen y la banca, que eran un párrafo de nombres
  separados por "·", son fichas sueltas: un toque sobre una palabra dentro de
  un renglón no se acierta con el pulgar.

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

### La pantalla de arranque

`app.json` usa el plugin `expo-splash-screen` con `assets/splash-icon.png`
sobre **`#E6E3EA`**, el mismo color que el ícono adaptativo de Android.

El ícono **no es transparente**: trae su propio fondo de papel gris lila. Por
eso el fondo del splash tiene que ser ese color y no otro. Sobre el navy que
tuvo un día (`#06152B`), la imagen se veía como un cuadrado claro recortado en
medio de la pantalla oscura. Con el papel, se funde, y la transición hacia la
app clara es suave.

El paquete `expo-splash-screen` tiene que estar en `package.json`. En Expo Go
su ausencia no se nota —ahí la pantalla de arranque nunca aparece—, pero un
build de desarrollo o de producción falla al resolver el plugin. `App.tsx` la
retiene hasta que carga Bebas Neue.

### Pantalla en vivo

`src/screens/LiveScreen.tsx` **sondea**, no usa SSE: React Native no trae
`EventSource`, y para un marcador cuyo ritmo dicta la API (`poll_wait_seconds`)
un intervalo basta sin añadir dependencias. El sondeo se programa después de cada
respuesta —no con `setInterval`, para que no se apilen— y se detiene cuando la
pantalla pierde el foco o la app pasa a segundo plano.

El diamante (`components/BaseDiamond.tsx`) usa `View` rotadas 45°, no SVG:
no valía añadir una librería nativa por tres cuadrados. `react-native-svg` sí
entró después, para la franja de probabilidad — una curva no se dibuja con
`View` —, y viene incluido en Expo Go, así que no obliga a salir de él. El
diamante se quedó como estaba: funciona y no hay razón para tocarlo.

### Detalle de un juego

Tocar una tarjeta abre `screens/GameDetailScreen.tsx` con cuatro pestañas:
`PlayByPlay`, `InningGrid`, `BoxScore` y `Lineups`, todas sobre
`/live/games/{pk}/detail`.

La primera pestaña (hoy "Hoy", antes "En Vivo") es una **pila** (`@react-navigation/native-stack`), no una
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

### El recorrido: lo único acumulativo de la caché

`LiveEntry.win_prob_track` guarda un punto cada vez que la probabilidad se
mueve, y `GET /live/games/{pk}/winprob` lo sirve. Es la **única excepción** a la
regla de que la caché solo tiene el estado de ahora mismo, y está justificada:
la probabilidad es función de un estado que ya pasó, y ese estado desaparece del
feed cuando el juego avanza. O se guarda cuando ocurre, o se pierde.

Tres detalles que no son obvios:

- **Umbral de 0.5 puntos porcentuales** (`UMBRAL_WP`). Sin él se guardaría un
  punto por sondeo —360 por juego— casi todos idénticos, y la curva saldría
  con escalones de ruido. Con el umbral quedan 40-80, la densidad de una
  gráfica legible. Sobre el juego inaugural: 8 puntos de 10 instantáneas.
- **Un cambio de marcador SIEMPRE entra**, aunque la probabilidad se mueva
  menos que el umbral: es justo el momento que la gráfica tiene que etiquetar.
- **`drop()` cierra la curva con el resultado real**, 1.0 ó 0.0. Sin eso la
  gráfica de un juego terminado acabaría en el último estado simulado —un 97 %—
  en lugar del 100 % que de hecho ocurrió.

El endpoint va **aparte de `/detail`** y no dentro. Tienen ritmos distintos: el
detalle se pide al abrir la pantalla y pesa 19 KB; esto son unos cientos de
bytes que el cliente refresca en cada sondeo. Juntos obligarían a rebajar 19 KB
cada diez segundos para mover una curva.

`current` viene en `None` cuando el juego terminó. No es un hueco: ahí ya no hay
probabilidad, hay resultado.

### La franja en la web

`components/game/WinProbBand.tsx`, en la cabecera del detalle de juego, entre
el marcador y las pestañas. Es la pantalla que justifica la franja: el único dato
que ningún otro producto de LIDOM tiene va arriba y grande.

- **Una serie contra la línea del 50%.** La curva es la probabilidad del local,
  en tinta, 2 px. El área entre la curva y el 50% se tiñe al 16% con el color
  del equipo favorecido en ese tramo. La maqueta del canvas pintaba la franja
  entera a saturación completa y con el 50% punteado; la skill de
  visualización marca las dos cosas como anti-patrón y el código las corrige.
- **El local va SIEMPRE arriba**, y los dos lados llevan su código escrito. En
  un Toros–Gigantes los dos lavados son casi iguales y no importa.
- **El eje X es el juego, no el reloj.** Los puntos llegan cuando la
  probabilidad se mueve; cada uno se coloca en su media entrada. El eje mide
  nueve entradas aunque el juego vaya por la tercera: el hueco a la derecha es
  lo que falta por jugar.
- **Se pide en el MISMO ciclo que el detalle** (`Promise.all`), no con un
  sondeo propio: dos bucles se desfasan y la curva podría mostrar una carrera
  que el marcador todavía no tiene.
- **El titular lo escribe el dato**, solo en juegos terminados: "Estrellas
  nunca estuvo por debajo del 56%", o "llegó a estar en 23% y remontó". Lo
  compone el **backend** (`titular_recorrido` en `src/live/store.py`) y viaja
  en `/winprob` como `headline`. Estuvo un día en la web; al hacer la versión
  del móvil se movió, porque dos implementaciones de la misma frase acaban
  diciendo cosas distintas.
- **El par de porcentajes SIEMPRE suma 100.** El visitante es 100 menos el
  local, no un segundo redondeo: con wp = 0.885 redondear cada uno por su lado
  da 89% + 12% = 101%, y la tabla de "Ver datos" lo mostraba. El backend usa la
  misma regla para el titular, y redondea el medio hacia arriba como
  `Math.round` (`_pct`), no al par como el `round()` de Python — si no, el
  titular y la tabla de la misma pantalla podrían diferir en un punto.
- Tooltip con la mira, flechas del teclado para recorrerla, lector de pantalla
  con `aria-live`, y una tabla en `<details>`: el tooltip mejora, nunca es la
  única puerta al dato.
- Cada punto trae `label` ("Baja del 3ro") compuesto en el backend con
  `ordinal_es()`. El cliente no lo arma.

### La franja en el móvil

`mobile/src/components/WinProbBand.tsx`. La misma forma que la web y por las
mismas razones; lo que cambia es cómo se toca.

- **El dedo tapa la gráfica.** Un tooltip flotante quedaría debajo de la
  yema, así que la lectura va ARRIBA, en la fila de la leyenda: al barrer, los
  porcentajes pasan a ser los del momento tocado y la etiqueta dice "Baja del
  3ro · 0–4". Al soltar vuelve al valor de ahora, como las gráficas de bolsa.
- **Dentro de un ScrollView, cede el gesto.** Toma el toque al empezar pero
  `onResponderTerminationRequest` devuelve `true`: un dedo que baja en vertical
  termina desplazando la pantalla.
- **Lo dibujado va en una capa con `pointerEvents="none"`.** `locationX` se
  mide respecto al hijo que recibe el toque; un dedo sobre la etiqueta "EST"
  corría el momento elegido.
- **Margen interno de 7 px arriba y abajo.** Un juego terminado acaba en 100% o
  0%, en el borde, y el recorte de las esquinas redondeadas cortaba el punto
  final a la mitad.
- **Lector de pantalla**: la franja es `adjustable`; deslizar arriba o abajo
  recorre los momentos, como las flechas en la web.

En `GameDetailScreen` el marcador y la franja van **dentro** del scroll: con el
marcador fijo, la franja dejaba al relato unos 300 px en un teléfono de 844. Las
pestañas ya no se quedan pegadas arriba: ver "El detalle de juego: cabecera
navy y pestañas al pie".

Para instalar las dependencias: `npx expo install react-native-svg expo-font
@expo-google-fonts/bebas-neue` desde `mobile/`. Elige la versión que corresponde al SDK (15.15.4 en el 57, según
`node_modules/expo/bundledNativeModules.json`).

### Trabajar la pantalla de juego sin red

```bash
python dev_live_offline.py                    # 826343 hasta el final
python dev_live_offline.py 826343 --hasta 5   # a medias: EN VIVO
python dev_live_offline.py --host 0.0.0.0     # para probar desde el teléfono
```

Por defecto escucha en `127.0.0.1`, que alcanza para la web. **El teléfono
necesita `--host 0.0.0.0`**: Expo Go llega por la IP de la WiFi y a
`127.0.0.1` de la PC no puede.

**La IP de la PC la saca la app sola** (`mobile/src/config.ts`): Expo Go ya
descarga el código desde la PC, y `Constants.expoConfig.hostUri` trae esa IP
("10.0.0.250:8081"); la API está en la misma máquina, en el 8000. Antes iba
escrita a mano, y cuando el router le cambió la IP a la PC (10.0.0.127 →
.250) la app dejó de conectar sin decir por qué. `EXPO_PUBLIC_API_URL` manda
sobre todo, para apuntar a otra máquina. Necesita el paquete
`expo-constants` (`npx expo install expo-constants`).

Carga las capturas de `fixtures/` en la caché por el mismo camino que el poller
(`parse_live_feed` → `store.update`) y levanta la API. A diferencia de
`LIDOM_LIVE_REPLAY`, no toca la MLB API. La curva sale con la densidad de las
capturas —diez instantáneas, ocho puntos— y no con la del poller, que acumula
40-80: la forma es real, la resolución no.

### Dos decisiones de producto dentro del modelo

- **La caché usa semilla fija.** Sin ella el mismo estado daría 61.2 % y al
  siguiente sondeo 60.8 %, y el usuario vería la barra temblar sin que pasara
  nada en el juego. Memoizar también es lo que hace viable simular 4.000 juegos:
  un juego entero toca unos pocos cientos de estados distintos.
- **`recalibrar()` es explícito, no automático.** Que las tasas cambiaran solas
  al ingestar una temporada haría que la misma situación diera números distintos
  de un día para otro sin que nadie lo hubiera decidido.

## Las fichas de jugador y de equipo

`GET /players/{player_id}` y `GET /teams/{code}` — web en
`app/players/[playerId]` y `app/teams/[code]`. Son las dos pantallas que
justifican el esquema de granularidad de juego: las tablas planas dan "el líder
de esta temporada", esto da "las catorce temporadas de este hombre".

### Las tasas de la carrera se RECOMPONEN, nunca se promedian

`src/carrera.py`. Un bateador que hizo .400 en 10 turnos y .250 en 400 **no**
batea .325 de por vida: batea .254. El AVG de la carrera sale de H/AB del total,
el OBP de (H+BB+HBP)/(AB+BB+HBP+SF) del total, y la ERA de ER×27/outs.

Se calcula en el **servidor**, no en el cliente, por la misma razón que
`lateralidad.py`: son dos plataformas, y una fórmula implementada dos veces es
una fórmula que un día diverge. La suite lo comprueba comparando el número
recompuesto contra el promedio ingenuo y exigiendo que **no** coincidan.

Para poder recomponerlas, `v_batting_season` expone `hbp` y `sf`, y
`v_pitching_season` expone `outs`. Sin esas columnas el OBP de carrera no tiene
denominador y la ERA habría que sacarla de entradas ya redondeadas a un decimal,
que sumadas catorce veces arrastran error.

### Los destacados de un equipo salen de la plantilla COMPLETA

`GET /teams/{code}` devuelve `leaders` además de `batters` y `pitchers`. La
plantilla va ordenada por uso —que es lo correcto para un roster— pero eso
entierra al mejor: en Águilas 2025-26 el líder de OPS es la fila once.

Dos cosas que no conviene deshacer:

- **El SQL de la plantilla no lleva `LIMIT`.** Los líderes se calculan sobre
  todas las filas y el recorte de `roster_limit` se aplica después, en Python.
  Sacarlos de la lista ya recortada daría un líder de bases robadas equivocado
  el día que el corredor emergente sea el 31ro en apariciones. Un
  equipo-temporada son unas 45 filas: el `LIMIT` no ahorraba nada.
- **El mínimo aplica a las tasas y NO a las acumuladas** — regla 10, comprobada
  ahora sobre la respuesta y no solo sobre la intención. Aplicarlo a los
  jonrones escondería al suplente que conectó seis en treinta turnos, que es
  justo lo que la gente abre una ficha para encontrar. El campo `qualified` de
  cada líder dice cuál es cuál, y la web lo marca con un asterisco.

El mínimo se calcula sobre los juegos que jugó **ese** equipo **esa** temporada
(`team_games_played`), no sobre un 50 fijo: 2020-21 y 2021-22 fueron campañas
recortadas por la pandemia.

### `is_pitcher` se decide por volumen

Era `bool(pitching)`: cualquiera con una aparición en el montículo. Eso metía a
**17 jugadores de posición** que lanzaron una vez en un juego roto —Jordany
Valdespin: 340 juegos al bate, 1 lanzando— y su ficha abría con "Carrera ·
pitcheo, EFE 0.00" en vez de su bateo, en la web y en el móvil.

`es_lanzador()` en `src/carrera.py` compara juegos lanzados contra juegos **con
aparición al plato** (`games_batted`). El corte en la base real es limpio:
ningún lanzador pasa de 4 juegos al bate —en LIDOM batea el designado—, y la
suite comprueba las dos cosas sobre la base entera.

### Las entradas lanzadas se pintan en notación de béisbol

Las dos capas guardan las entradas en **decimal** (36.33 en la plana, 36.3 en
las vistas), que es lo correcto para calcular EFE y WHIP. Pero en béisbol
"36.3" no existe: después del punto van los outs (0, 1 ó 2). Las fichas lo
pintaban tal cual, y el mismo lanzador salía **36.1 en Pitcheo y 36.3 en su
ficha**.

`entradas()` —`frontend/lib/formato.ts` y `mobile/src/formato.ts`, la misma
función— pasa por los outs: `round(ip × 3)`. Funciona igual con 36.33 que con
36.3, y reemplazó a dos copias de `fmtIP` que redondeaban la parte decimal (con
36.99 daban "36.3"). Comprobada contra las 3.175 temporadas-lanzador de las
vistas: devuelve exactamente sus outs en todas. **Nunca pintar
`innings_pitched` con `toFixed(1)`.** El boxscore en vivo es otra cosa: ahí la
MLB ya manda el string en notación de béisbol ("0.2").

### El buscador es la única puerta a las fichas

`components/PlayerSearch.tsx`, en la barra superior. Con 2.253 jugadores no hay
listado que sirva de índice. (Ya no es la única: las filas de Bateo, Pitcheo y
Posiciones llevan a las fichas en las dos plataformas.)

Tres cosas aprendidas construyéndolo:

- **Los resultados y la consulta a la que pertenecen viven en UN estado.** Con
  dos estados separados hace falta un `setState` síncrono dentro del efecto para
  mantenerlos a la par, y `react-hooks/set-state-in-effect` lo marca — la misma
  familia de reglas que encontró el bug real de `PlayByPlay.tsx`. Lo que se
  pinta se **deriva**: `buscando` es "lo que tengo no corresponde a lo escrito".
- **250 ms de espera y `AbortController`.** Sin lo primero, escribir "munguia"
  dispara siete peticiones; sin lo segundo, la respuesta lenta de "mun" puede
  llegar después de la de "munguia" y pisarla.
- **Un fallo de red no vacía el panel.** Un resultado de hace un segundo es más
  útil que un panel en blanco.

### La edad se calcula en el servidor y la fecha se parte a mano

`edad()` toma `hoy` como parámetro para que la suite pueda fijarla: una
comprobación de edad con `date.today()` cambia de resultado el día del
cumpleaños del jugador y falla sola una vez al año.

En el cliente, `fechaEs()` parte el string ISO a mano en vez de usar
`new Date("1988-02-08")`: esa forma se interpreta como UTC, y en UTC-4 devuelve
el **día anterior**. Un jugador nacido el 1ro aparecería nacido el 31.

### Las fichas en el móvil

`screens/PlayerScreen.tsx`, `screens/TeamScreen.tsx` y `screens/SearchScreen.tsx`,
sobre los mismos endpoints que la web.

**Cada pestaña es una pila.** Las cinco declaran las rutas `Equipo` y `Jugador`
(`FichasParamList` en `src/navigation.ts`), así que se puede ir de posiciones a
equipo a jugador a su equipo de 2016 sin salir de la pestaña, y el gesto de
volver deshace ese camino. Las cuatro que no son la primera se fabrican con
`crearPila()` en `App.tsx`: cuatro copias de la misma pila acabarían distintas.
`useFichas()` navega a una ficha desde cualquier pantalla.

**Una sola cabecera.** El `Tab.Navigator` ya no dibuja la suya
(`headerShown: false`); la pone la pila. Con las dos, una ficha abría con el
logotipo arriba y el nombre debajo: 100 pt para dos títulos. La raíz de cada
pila lleva el logotipo; lo apilado, su título y la flecha.

**El buscador es una pestaña, no una lupa arriba.** Las reglas de diseño ponen
la navegación en el 40% inferior; una lupa arriba a la derecha es el punto más
lejano del pulgar en un teléfono grande.

Lo que cambia respecto a la web:

- **Jugador:** la carrera entera va en una franja navy (la firma del kit)
  justo antes de la tabla, y no al pie: en un teléfono eso la dejaba a dos
  pantallas. Arriba manda la cabecera héroe con la última temporada. La
  tabla de temporadas tiene la columna de temporada **fija** y las cifras se
  desplazan —React Native no tiene `sticky` horizontal: son dos columnas con
  filas de la misma altura fija—. Tocar la celda fija abre el equipo **en esa
  temporada**, no en la actual.
- **Equipo:** la temporada se elige con el selector pegado arriba (ver
  "Selector de temporada"). Al cambiarla, lo anterior se queda atenuado hasta que
  llega lo nuevo, y cada petición lleva número: solo la última escribe el
  estado. Los destacados van en carrusel; la plantilla muestra 12 filas y el
  resto a un toque, para no enterrar el año a año bajo 1.700 pt de lista.
- **Esqueletos, no spinners** (`components/Esqueleto.tsx`), como piden las
  reglas: la forma de la ficha aparece al instante y no salta al llegar el dato.
- `components/Pestanas.tsx` es la pestaña de subrayado genérica; `GameTabs` la
  usa por debajo. Una sola implementación, una sola altura (44 pt). La raya es
  UNA que se desliza a la pestaña elegida (ver "Micro-animaciones"), y `abajo`
  la pone arriba del borde para la barra que va al pie.
- Escala de las fichas: 28 / 22 / 14 / 11. Sin Bebas en las tablas: sus cifras
  no son tabulares y en una columna alineada a la derecha no cuadran.

## El rediseño de las fichas (29-sep-2026)

Las fichas de jugador y de equipo se rehicieron en las dos plataformas a partir
de tres maquetas del canvas de diseño (Hoy, Jugador, Equipo). El dato nuevo lo
calcula el **servidor**; los clientes solo dibujan.

### Lo que añade la API

`GET /players/{player_id}` trae `context` (o `null` si no tiene filas en su
papel principal):

| Campo | Qué es |
|-------|--------|
| `role` | `batting` o `pitching`, el mismo criterio que `es_lanzador()` |
| `latest` | Su última temporada **con volumen** (50 AP o 10 entradas, el listón de la curva), con los equipos **sumados**: las cifras grandes de la cabecera. Si ninguna llega, la de más volumen. Con la última a secas, Juan Francisco abría con ".000 OPS" por 6 AP |
| `ranking` | Su puesto entre los calificados de su última temporada calificada, por categoría, con `headline` |
| `curve` | OPS (o EFE) temporada a temporada, el promedio de la liga y un `headline` |

`GET /teams/{code}` añade `race` (juegos sobre .500 de los seis, partido a
partido), `race_headline`, `standing` ("1ro · 5 juegos de ventaja"), `last10`
(del más viejo al más nuevo) y `history_headline`.

Reglas que no conviene deshacer:

- **Puestos con empates compartidos** (1, 2, 2, 4), comparados a la precisión
  con que se pintan: dos OPS de .873 empatan aunque difieran en la cuarta cifra.
- **Las tasas se recomponen de conteos sumados**, también para el cambiado a
  mitad de temporada y para el promedio de la liga. Nunca se promedian.
- **El listón de la liga usa los juegos del equipo que más jugó**
  (`season_games_played`), no un fijo: en 2025-26 son 155 AP y 16 calificados.
- **Las sumas de la liga se cachean** con clave (juegos finales, última fecha):
  la ficha bajó de 550 ms a 26 ms, y la clave cambia sola al ingestar.
- **El titular de la carrera es de ritmo**, no de mínimo: "Llegaron a 21-4 y
  cerraron 11-13". Medir la caída en juegos sobre .500 daba `None` para
  Águilas, que solo perdió dos de colchón pero jugó .458 desde el pico.
- Un titular de una temporada vieja lleva el año ("… en 2019-20").

### Cómo se dibuja

Web en `frontend/components/ficha/`, móvil en `mobile/src/components/`, con
los mismos nombres: `Heroe`, `Monograma`, `Seccion`, `PuestoLiga`,
`CurvaCarrera`, `CarreraBanderin`, `UltimosDiez`, `BarrasDiferencial`,
`Trayectoria`.

- **La cabecera héroe ocupa el lugar de la foto**: franja navy a sangre con un
  plano del color del club en diagonal. **Toda letra va sobre el navy, nunca
  sobre el plano** — blanco sobre el amarillo de Águilas da 2:1. En el
  teléfono el plano mide 176 px y la columna de texto no pasa del 52%; en la
  web, desde `sm`, el plano ocupa todo el alto y el texto el 58%. El nombre se
  achica para caber (`tamanoNombre` en el móvil, `NombreHeroe` en la web):
  partir "RODRÍGUEZ" a media palabra es peor. Ver "Nada de
  adjustsFontSizeToFit".
- **El monograma** (iniciales en teja navy con la esquina cortada) va sobre el
  plano. Nada de fotos ni escudos: ver la guía legal.
- **Una sola serie con color en cada gráfica.** El jugador o el equipo en
  tinta; la liga y los otros cinco en gris `#8A96A9` (3.0:1, el mínimo para
  una marca). Seis colores de club serían tres rojos indistinguibles.
- **Marcas de eje redondas** con `marcasRedondas()` (.600 / .800 / 1.000;
  −5 / .500 / +5), en `formato.ts` de las dos plataformas.
- **Puesto, no percentil.** Con 16 calificados "81" esconde que fue 3º. El
  podio (1º-3º) va en teja navy; el resto, escrito en gris.
- En la web, cada gráfica tiene puntero, flechas del teclado y una tabla en
  "Ver datos": el puntero mejora, nunca es la única puerta al dato. Las
  gráficas miden su contenedor (`useAncho`) en vez de escalar un `viewBox`,
  para que las letras no bajen a 7 px en un teléfono.
- **Bebas no trae el glifo "º"**: el ordinal va en Archivo al lado del número.
- La temporada de la ficha de equipo se elige con el mismo selector que
  Posiciones (ver "Selector de temporada"), con el récord de cada campaña en
  la lista.

## La portada Hoy (29-sep-2026)

`GET /day?date=YYYY-MM-DD` — sin fecha, hoy en República Dominicana. Es la
primera pestaña del móvil (`screens/HoyScreen.tsx`, que reemplazó a "En Vivo"
como raíz) y la página `/` de la web. La tabla de posiciones pasó a
`/posiciones`. Las funciones puras viven en `src/jornada.py`; la ruta hace el
SQL y cruza con la caché en vivo.

Qué devuelve: la fecha resuelta, una franja de siete días con cuántos juegos
tuvo cada uno, los juegos (estado, marcador, hora local, estadio, ganador,
decisiones), el destacado con su titular y, si la caché lo siguió, su franja
de probabilidad; las figuras y la próxima fecha con juegos.

Reglas que no conviene deshacer:

- **Fuera de temporada se sirve la última jornada**, con `is_requested:
  false`. Los clientes lo dicen ("No hay juegos hoy. Esta fue la última
  jornada…") en vez de llamarla "Hoy". Una portada vacía nueve meses al año
  no sirve; una que miente, menos.
- **El destacado lo elige el marcador, no los datos que tengamos.** En vivo, el
  más apretado. Terminados: entradas extra, después menor diferencia, después
  más carreras. Elegir "el que tiene franja" destacaría siempre el mismo tipo
  de juego por una razón técnica.
- **El titular, por orden**: el recorrido de la probabilidad si existe
  (`titular_recorrido`), las entradas extra ("Licey lo resolvió en la entrada
  10."), y si no, la figura del juego ("Jonrón y 4 impulsadas de Aderlin
  Rodríguez."). Se compone de conteos, nunca de la línea abreviada.
- **Figuras con fórmulas conocidas**: Game Score de Bill James para el
  pitcheo, con mínimo de 3 entradas (un relevista de un out perfecto no es la
  figura); bases totales + impulsadas + anotadas + boletos + robos para el
  bateo, con al menos un hit. Hay jornadas sin figura de pitcheo — el 16 de
  octubre de 2025 ningún lanzador pasó de 2.2 — y está bien.
- **La hora se pinta en la de RD (UTC−4 fijo)**, y la fecha del juego es
  `game_date`, la oficial: un juego de las 8 de la noche es 00:00 UTC del día
  siguiente. `zoneinfo` no hace falta y en Windows pediría `tzdata`.
- **La caché en vivo manda sobre la base** mientras tenga el juego: un juego
  en curso figura `scheduled` en `games` hasta que termina y se ingesta. Y las
  decisiones (G/P/SV) solo se muestran con el juego terminado.
- **Los equipos se tocan** (30-sep, pedido de Arturo): en las tarjetas de
  Hoy, en la cabecera de la página de un juego, en la del detalle en vivo y
  en el boxscore, teja y nombre abren la ficha del equipo **en la temporada
  del juego**. En el móvil es un `Pressable` dentro de la tarjeta (que abre
  el juego): el toque lo toma el más interno, y el marcador queda fuera, así
  que tocar el 6 sigue abriendo el juego. Con el lector de pantalla la
  tarjeta chica es un solo elemento: los dos equipos van como acciones suyas.
  En la web, teja y nombre son un solo enlace (`/teams/{code}?season=`) en
  las mismas cuatro partes; antes solo el nombre enlazaba, y sin temporada.
- **Un juego se abre solo si la caché tiene su detalle** (`has_detail`). Un
  juego viejo no tiene relato; una tarjeta que parece tocable y no hace nada
  es peor que una que no lo parece. Un juego terminado sin detalle en vivo
  abre su página armada desde la base (ver "Un juego terminado").
- **Con juegos en curso llega `poll_seconds` (15)** y los clientes vuelven a
  pedir la jornada: el móvil con `setTimeout` mientras tiene el foco, la web
  con `router.refresh()` mientras la pestaña se ve (`components/hoy/Refresco.tsx`).
- La fecha vive en la URL de la web (`/?fecha=`). Un día sin juegos en la
  franja no es enlace: el servidor lo resolvería a otra fecha.
- **Para saltar lejos está el calendario** (`GET /calendar`; web
  `/calendario?temporada=&activa=`, móvil `screens/CalendarioScreen.tsx`,
  ruta `Calendario` de la pila de Hoy). La franja camina de siete en siete, y
  el juego inaugural quedaba a ~70 toques de la última jornada. Los meses
  llegan con las semanas armadas de lunes a domingo, con `null` fuera del
  mes: el cliente no calcula en qué columna cae el día 1. En el móvil, elegir
  un día hace `popTo('Portada', { fecha })`, así no se apila otra portada.
  La pantalla raíz de la pestaña se llama `Portada` y no `Hoy`: con el mismo
  nombre que la pestaña, React Navigation avisa de pantallas anidadas
  homónimas.

## Un juego terminado, desde la base

`GET /games/{game_id}/detail` — web en `app/juegos/[gameId]`, móvil en
`screens/JuegoScreen.tsx`. Es la puerta a los ~2.000 juegos que el motor en
vivo no siguió: la portada abre el detalle en vivo si la caché lo tiene y, si
no, esta página.

**Se llega desde tres sitios**: los resultados de Hoy, los últimos diez de la
ficha de equipo (`last10` trae `game_id`) y el juego a juego de la ficha de
jugador. Por eso en el móvil la ruta `Juego` está en `FichasParamList`, en
todas las pilas. El detalle en vivo (`GameDetail`) solo existe en la pila de
Hoy, así que `JuegoScreen` pregunta si la ruta existe antes de ofrecer
"Relato y línea".

El juego a juego (`/players/{id}/gamelog`) trae la línea ya compuesta con
`linea_bateo`/`linea_pitcheo` de `src/jornada.py` —la misma de la portada—,
el resultado del **equipo** del jugador (`result`, `runs_for`,
`runs_against`, desde su lado) y la fecha legible. El resultado va en una teja
aparte de la línea porque no es la decisión del lanzador: un relevista que no
decidió no tiene "G" propia. Solo juegos terminados, y una doble cartelera en
el orden en que se jugó.

- **El boxscore viaja con la forma del detalle en vivo** (`TeamDetail`),
  armado en `src/boxscore.py`, para que los dos clientes reusen su
  componente `BoxScore`. Dos formas para lo mismo acabarían pintando distinto
  la misma línea.
- **Lo que la base no guarda no se inventa.** Errores y corredores dejados del
  equipo van en `null` (el LOB del equipo no es la suma de los individuales)
  y el boxscore omite la "E". Sin línea por entradas ni relato. El tipo es
  `TeamBox` en los clientes: `TeamDetail` con esos dos campos anulables.
- **La suite cruza las dos capas**: el boxscore de la base contra el del feed
  en vivo del juego inaugural — mismos jugadores, mismos hits, mismas
  entradas por lanzador.
- **Un juego `scheduled` de una fecha pasada pasa a `no_result`** ("SIN
  RESULTADO"): el forfeit de 2016 se pintaba "7:15 p. m.", como si fuera a
  jugarse. `armar_juego` compara contra hoy en RD.
- La decisión va como nota junto al lanzador — (G), (P), (SV) — igual que en
  el detalle en vivo.

### Sin conexión no es lo mismo que sin datos (móvil)

`fetch` en React Native **no tiene tiempo límite**: con la API apagada o
inalcanzable desde el teléfono, Hoy se quedaba en el esqueleto para siempre.
`get()` en `mobile/src/api.ts` corta a los 10 segundos.

Y `/standings`, `/batting` y `/pitching` devuelven `null` cuando la API no
respondió y `[]` cuando respondió sin filas. Antes las dos caían en "No hay
datos disponibles. Corre: python main.py ingest", que manda a buscar el
problema en la base cuando está en la red. Ahora `EmptyState sinConexion`
dice "No se pudo conectar con la API", muestra **a qué dirección** se intentó
(`API_BASE`, lo primero que hay que revisar si la IP de la PC cambió) y trae
Reintentar.

## El detalle de juego: cabecera navy y pestañas al pie (30-sep-2026)

Lo que quedaba pendiente de las reglas de diseño móvil: la zona del pulgar en
el detalle de juego. Móvil (`GameDetailScreen.tsx`) y web
(`components/game/GameDetail.tsx`) cambian igual.

- **La cabecera es la franja navy de las fichas** (`Heroe`), con su corte en
  diagonal, pero **sin el plano de color**: un juego es de dos clubes, y pintar
  el color de uno solo diría que el juego es suyo. `Heroe` acepta `color`
  opcional por eso; las fichas siguen pasándolo. Cada club se identifica con
  su teja sólida y su código.
- Dos filas de marcador: teja, nombre, `H · E`, carreras en Bebas de 56. Quien
  va abajo se apaga a `inkDim` (8.3:1 sobre el navy) y el ganador de un juego
  terminado lleva ◂ escrito. Junto al estado, una línea de contexto: la media
  entrada del último punto del recorrido en vivo ("Baja del 7mo"),
  "Resultado definitivo" o "Sin señal".
- **Las pestañas van al pie**, en la zona del pulgar. En el móvil, fijas sobre
  la barra de la app y repartiendo el ancho (`GameTabs` → `Pestanas llenar
  abajo`). En la web, fijas al pie en el teléfono y de vuelta arriba del
  contenido desde `sm`: con ratón no hay pulgar que cuidar. La página deja
  `pb-24` en el teléfono para que la barra no tape la última fila.
- Al cambiar de pestaña con el relato bajado, el scroll vuelve al comienzo del
  contenido (no al tope: el marcador queda fuera de la vista). Sin eso, la
  pestaña nueva abría a media página.
- La barra de navegación del detalle en el móvil es navy (`OPCIONES_JUEGO` en
  `App.tsx`) y la barra de estado pasa a clara con el foco, como en las fichas.
  El título "TOR vs EST" se conserva: cuando el marcador se va por arriba, es
  lo único que dice qué juego es.
- Cargando: esqueleto con la franja navy, no un spinner.
- La web: `app/live/[gamePk]/page.tsx` ya no envuelve en `<main>`; la cabecera
  va a sangre y el enlace "← En Vivo" vive dentro de ella.

## Selector de temporada (30-sep-2026)

Posiciones, Bateo, Pitcheo y la ficha de equipo eligen la temporada con **un
botón que dice cuál se está viendo** ("TEMPORADA 2025-26 ⌄") y abre la lista
entera. Primero fueron pestañas de subrayado; en el iPhone catorce pestañas no
cabían, la elegida quedaba cortada por el borde y había que deslizar para
descubrir las demás (captura de Arturo, 30-sep).

- **Móvil: una hoja que sube desde abajo** (`components/HojaInferior.tsx` +
  `components/SelectorTemporada.tsx`), el patrón que piden las reglas de
  diseño antes que un modal. Se cierra tocando fuera, arrastrándola hacia
  abajo (más de 100 pt o un tirón) o con atrás en Android. Filas de 60 pt, la
  elegida rellena de navy con ✓, la más reciente marcada "Actual", y al abrir
  se desplaza hasta la elegida. Sin librerías: `@gorhom/bottom-sheet` pide
  reanimated y gesture-handler, dos módulos nativos por una hoja. Todo con
  `useNativeDriver`; con "reducir movimiento" aparece sin deslizarse.
- **Web: una lista desplegable** (`SelectorOpciones` en
  `frontend/components/SelectorTemporada.tsx`), en una barra pegada bajo la
  superior. Las opciones son enlaces: la temporada sigue en la URL. Teclado
  completo (flecha abajo abre, flechas/Inicio/Fin se mueven, Escape cierra y
  devuelve el foco), clic fuera cierra, y al abrir se desplaza la LISTA hasta
  la elegida, no la página. Se despliega con `.desplegar` (140 ms).
- En la ficha de equipo cada opción lleva el récord de esa campaña
  ("23-27 · .460"): se elige sabiendo qué se va a ver.
- **Una temporada para Posiciones, Bateo y Pitcheo.** Quien mira las
  posiciones de 2015 y pasa a Bateo espera los bateadores de 2015. En el móvil
  es un valor de módulo con `useSyncExternalStore` (`mobile/src/temporada.ts`),
  sin contexto ni librería; la lista de `/seasons` se pide una vez por sesión.
  En la web la temporada vive en la URL y la barra superior ya la llevaba de
  una página a otra. Las fichas NO la leen: tienen su propia temporada.
- Sin elegir nada manda la más reciente que tenga la API: `DEFAULT_SEASON`
  queda de respaldo si `/seasons` no responde. **La 2026-27 aparece cuando se
  corra `python main.py ingest 2026`**: las tablas planas no se llenan solas.
- Tocar un equipo en las posiciones abre su ficha **en esa temporada**.
- Al cambiar de temporada o de orden, la lista anterior se queda atenuada
  hasta que llega la nueva (spinner solo la primera vez), y cada petición lleva
  número para que solo la última escriba. En Bateo y Pitcheo, el toque en un
  orden ya no dispara dos peticiones iguales.
- En la web, el filtro de equipo se conserva al cambiar de año; el mínimo de
  PA/IP no, porque el de una temporada no sirve para otra de distinto largo.
- La etiqueta es "2015-16" en todas partes (`etiquetaTemporada`, en
  `mobile/src/temporada.ts` y `frontend/lib/formato.ts`), también en el chip
  de la barra superior de la web.

## Nada de adjustsFontSizeToFit (30-sep-2026)

En el iPhone de Arturo las cifras de la cabecera del jugador salían a ~6 pt
(".903" casi invisible) con `adjustsFontSizeToFit`. El ajuste de iOS se calcula
con el ancho de la primera pasada de layout —que en una fila con `flex: 1`
puede ser casi cero— y no vuelve a crecer. En la web la propiedad ni existe,
así que además las dos plataformas se veían distinto.

`mobile/src/components/Ajuste.tsx` lo calcula: Bebas Neue es una sola fuente
con anchos fijos, y la tabla `ANCHO_EM` sale del propio archivo de la fuente
(avance de cada glifo en em; las cifras miden 0.4). El tamaño que cabe en `w`
puntos es `w / Σ anchos`, con tope en el de diseño.

- `CifraAjustada`: una cifra que mide su caja con onLayout (cabecera héroe y
  franja de carrera del jugador).
- `tamanoNombre`: el nombre de la cabecera, decidido por la palabra más larga
  contra la columna del 52 % — el mismo cálculo que `NombreHeroe` en la web.

- El código gigante del plano ("TOR") en la cabecera de equipo: a 150 pt
  fijos medía 175 y el plano deja ~110, así que la última letra quedaba
  cortada por el borde (30-sep). `medidaMarca()` en `Heroe.tsx` lo ajusta al
  ancho que deja el plano, que por la diagonal crece hacia abajo, y lo apoya
  abajo. La web hace lo mismo con `anchoBebas()` (`frontend/lib/bebas.ts`,
  misma tabla) y `calc()` sobre `vw`.
- En la web las cifras de la cabecera tampoco se cortan ya con "…": cada
  columna es un contenedor de consultas y la cifra mide
  `min(tamaño, 98cqw / ancho en em)`.

**No volver a usar `adjustsFontSizeToFit`** en textos en Bebas. Si hace falta
en otra fuente, medir antes en un iPhone.

**Bebas con `lineHeight` apretado necesita aire arriba en iOS.** El alto
natural de Bebas es 1.2 em (ascendente 900, descendente 300); con un
`lineHeight` menor, iOS recorta el dibujo a la caja del texto, y el remate de
las cifras redondas se pierde: el récord "27-22" de la ficha de equipo (84 pt
con 76 de alto) salía con el "2" y el "7" planos arriba (30-sep). La regla:
`paddingTop` para que la caja tenga espacio donde dibujar, y el mismo
`marginTop` en negativo para que la cifra no se mueva. Los nombres de la
cabecera ya llevaban su `paddingTop`; el récord del equipo y las carreras del
detalle de juego no. En el arnés web no se ve: el navegador no recorta.

## La voz de la app (3-oct-2026)

La app no se explica. Fuera los subtítulos que contaban cómo se calcula o cómo
se usa algo ("El más reciente, a la derecha. Toca uno para abrir el juego",
"Sin errores ni línea por entradas: la base guarda…", la fórmula de las
figuras) y las notas de fuente de tres líneas. Quedan las que cambian cómo se
lee un dato ("Punto hueco: menos de 50 AP", el mínimo de una tasa) y la
fuente en una línea: "Fuente: MLB Stats API" o "Fuentes: MLB Stats API y,
antes de 2012-13, LIDOM". Al público no se le nombra DIGIMETRICS: es el
sistema detrás del portal de la liga.

**Lo técnico solo en desarrollo.** La dirección de la API, el comando de
ingesta, cómo reproducir un juego o "revisa que el backend esté corriendo"
van detrás de `__DEV__` en el móvil y de `process.env.NODE_ENV ===
"development"` en la web. En un build de verdad la persona ve "No se pudo
conectar. Revisa tu conexión e intenta de nuevo." En Expo Go `__DEV__` es
`true`: ahí se siguen viendo, y está bien, porque ahí se depura.

## Micro-animaciones (30-sep-2026)

Tres, y ninguna decora: cada una confirma algo. Viven en
`mobile/src/components/Movimiento.tsx` y en `globals.css` de la web.

| Qué | Móvil | Web |
|-----|-------|-----|
| La tarjeta se hunde al tocarla (0.97 / 0.98) | `<Tocable>` | clase `.tocable` |
| El contenido de una pestaña entra con un fundido y 6 px de subida | `<Aparecer key={pestaña}>` | clase `.aparecer` con `key` |
| La raya de las pestañas se desliza a la elegida | `Pestanas.tsx` | `PestanasJuego` en `GameDetail.tsx` |

- **"Reducir movimiento" las apaga todas.** En el móvil,
  `useReducirMovimiento()` escucha el ajuste (y su cambio con la app abierta) y
  recuerda el último valor para que un componente nuevo no anime su primer
  cuadro mientras llega la respuesta asíncrona. En la web,
  `prefers-reduced-motion` y `motion-reduce:`.
- `Tocable` pone la escala en una vista **externa** y deja el `Pressable`
  dentro con su estilo intacto, función `({ pressed })` incluida: el fondo de
  "presionado" que ya tenía cada tarjeta sigue funcionando. Si la tarjeta vivía
  en una fila con `flex: 1`, ese estilo pasa a `contenedor`.
- Escala y opacidad van con `useNativeDriver`. La raya de las pestañas anima
  `left` y `width`, que no lo admiten: corre en JS, 180 ms una vez por toque.
  La primera vez se coloca sin animar, para que no entre volando.
- Dónde hay `Tocable`/`.tocable`: días de la franja y del calendario, tarjetas
  de juego y de figuras en Hoy, el botón Calendario y "Marcadores en vivo",
  los últimos diez, los destacados del equipo. Las filas de tabla no: ya
  tienen su fondo de presionado y veinte filas hundiéndose serían ruido.
- `Aparecer` va en el contenido de las pestañas del juego, en la tabla de
  bateo/pitcheo del jugador y en la plantilla del equipo.

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

## Seguridad para desplegar (30-sep-2026)

**Resuelto antes:** las 3 vulnerabilidades de Next.js (1 crítica, RCE sin
autenticar en servidores Windows) del rango `9.3.4 – 16.3.0`; se migró a Next
16.3.5.

`api/seguridad.py`, encendido con `LIDOM_ENTORNO=produccion`. Las variables
están en `.env.example`. En desarrollo no cambia nada: sin límite, CORS a
localhost:3000, diagnóstico abierto, `/docs` publicado.

La API es de **solo lectura** (todas las rutas son GET) y los datos son
públicos: no hay cuentas ni nada que escribir, así que no hay login que poner.
Lo que se protege:

- **Límite por IP**: cubo de fichas, 300 por minuto por defecto, con ráfagas
  (abrir la app dispara cinco o seis peticiones juntas). Responde 429 con
  `Retry-After` y un mensaje en JSON. No más bajo porque en RD las redes
  móviles comparten una IP pública entre muchos clientes (CGNAT). `/health` no
  cuenta (monitores). Guarda dos números por IP y barre las olvidadas: un
  barrido de IPs falsas no llena la memoria. **Por proceso**: con varios
  workers el límite efectivo se multiplica (haría falta Redis).
- **Detrás de un proxy**, `LIDOM_CONFIAR_PROXY=1` toma la IP del primer
  `X-Forwarded-For`. Sin proxy NO activarlo: cualquiera se inventaría la
  cabecera y se saltaría el límite.
- **El servidor de la web lleva su clave** (`LIDOM_CLAVE_SERVIDOR`, cabecera
  `X-Clave-Servidor`). Las páginas de Next se arman en su servidor, y todas sus
  peticiones salen de una IP: sin la clave, el límite sería para toda la web
  junta. `apiFetch` la añade solo del lado del servidor; va sin el prefijo
  `NEXT_PUBLIC_`, que es lo que la mantiene fuera del navegador.
- **CORS por configuración** (`LIDOM_CORS_ORIGINS`), obligatorio en producción
  y nunca `*`. Va por fuera del límite, así que un 429 también lleva CORS y el
  navegador lo ve como "espera" y no como un error de CORS.
- **El diagnóstico, con clave** (`LIDOM_CLAVE_DIAGNOSTICO`, cabecera
  `X-Clave-Diagnostico`, comparada en tiempo constante): sin ella `/health`
  responde `{"status": "ok"}` y `/live/status` solo si el poller corre. Antes
  contaban las filas de cada tabla, los juegos en seguimiento y cómo ingestar.
  Tampoco se publican `/docs`, `/redoc` ni `/openapi.json`.
- **Cabeceras** en todas las respuestas: `nosniff`, `no-referrer`, `DENY`.
- **Parámetros acotados**: `limit` con `ge=1` (en SQLite `LIMIT -1` devuelve la
  tabla entera) y la búsqueda con 60 letras como mucho. Los `ORDER BY`
  dinámicos ya iban contra listas cerradas.
- **Una configuración insegura no arranca** (`ConfigInvalida`): producción sin
  orígenes, con `*`, con límite 0, o con claves de menos de 24 caracteres o
  iguales entre sí. Mejor un error al desplegar que una API abierta sin que
  nadie lo note.
- El middleware es **ASGI puro**, no `BaseHTTPMiddleware`: este último envuelve
  la respuesta y con el flujo SSE del en vivo se ha portado mal en varias
  versiones de Starlette.

**Por qué no hay una clave de API en las apps:** una clave dentro de la app o
de la web no es secreta —se saca del binario o de las herramientas del
navegador en un minuto— y el `EventSource` del en vivo ni puede mandar
cabeceras. Daría sensación de seguridad sin darla. Si un día hace falta
distinguir clientes (terceros, un plan de pago), el camino es un token firmado
de corta vida emitido por un servidor nuestro.

## La capa histórica (DIGIMETRICS) (30-sep-2026)

`estadisticas.lidom.com` ("DIGIMETRICS") es el portal de estadísticas oficial
de la liga; lidom.com lo enlaza desde su menú. Es la segunda fuente del
proyecto y aporta lo que la MLB API no tiene: **líneas de temporada por
jugador desde 1951**, por equipo y por etapa. La MLB API empieza en 2012-13.

### Qué tiene la fuente y qué no

Revisado a mano el 30-sep, endpoint por endpoint:

- Bateo y pitcheo por jugador de cada equipo, cada temporada y cada etapa,
  desde 1951: SÍ. Es lo que se ingesta.
- Posiciones, totales de equipo y líderes: solo desde que la fuente tiene
  juegos (2013). Antes, vacíos. El récord histórico de un equipo se
  reconstruye con las decisiones de sus lanzadores.
- Fildeo: solo desde ~2013. No se ingesta; para esos años está la MLB API.
- Juegos (play by play, rosters diarios y semanales): desde 2013. Tampoco.
- Fichas de jugador (`/Miembro/Detalle`): con `idMiembro` funcionan (los
  enlaces de las tablas lo usan); con `idPersona` (los de la portada) dan 500.
  Casi no traen biografía de los años viejos. No se ingestan todavía.
- `lidom-one.vercel.app/estadisticas` (el iframe de lidom.com/estadisticas) es
  un prototipo con datos de la MLB API. No es otra fuente.

### Cómo se habla con ella

ASP.NET MVC con jQuery: cada tabla es un **POST sin cuerpo** con los
parámetros en la URL, que devuelve un fragmento de HTML (las etapas, JSON).
No hay JavaScript que ejecutar: nada de Selenium. Solo HTTP; el HTTPS
redirige a HTTP. No tiene `robots.txt` (404) ni pide sesión.

| Acción | Parámetros | Devuelve |
|--------|-----------|----------|
| `/Equipo/SelectEtapasTemporada` | `idTemporada` | JSON `[{Id, Descripcion}]`; vacío si no se jugó |
| `/Equipo/EquipoBateo` | `idTemporada`, `idEtapa`, `idEquipo`, `manoLanza=` | tabla `#tbBateo` |
| `/Equipo/EquipoLanzamiento` | `idTemporada`, `idEtapa`, `idEquipo` | tabla `#tbLanzamiento` |

- `idTemporada` es el año en que EMPIEZA la campaña, como en la MLB API
  (1990 = 1990-91). Hasta 1954 la liga jugó en verano: `etiqueta_historica()`
  da "1951" para esas y "1955-56" desde entonces. No hay 1961, 1962 ni 1965.
- `idEtapa`: `SR` regular, `RR` round robin (la fuente lo llama "Serie
  Semifinal"), `SF` final.
- `idEquipo` va de `01` a `09` y **no son franquicias sino nombres**: los Toros
  hasta 2012-13 están bajo el `07` (Azucareros del Este) y los Gigantes bajo
  el `09` (Gigantes del Nordeste). `DIGIMETRICS_EQUIPOS` los lleva a nuestro
  `team_code`, y las tablas guardan también el `id_equipo` y el nombre de cada
  temporada.

### Cortesía, porque el servidor es uno solo y es de la liga

- Un pedido por segundo (`DIGIMETRICS_INTERVALO_SEGUNDOS`).
- Caché en disco de cada respuesta buena, en `data/raw/digimetrics/`
  (ignorada por git). Repetir la ingesta o reprocesar tras tocar el parser no
  vuelve a pedir nada. `--refrescar` para re-bajar; `--sin-red` para no salir.
- **En los años recientes cada fila trae la foto del jugador en base64.**
  Hasta 2019-20 todas las páginas quedan por debajo de 5 MB; desde 2020-21
  casi todas pesan 5-11 MB (medido con `Content-Length`: el bateo de Águilas
  2023-24, 11 MB), y desde 2024-25, 20-45 MB y 40 s cada una. El ingestor
  para en 2019 y el cliente corta cualquier respuesta de más de 5 MB. Si aun
  así una página pasa del tope, esa temporada entera se salta con un aviso y
  la ingesta sigue: nunca queda una temporada a medias. Las fotos no se
  guardan nunca.
- Primer intento real (30-sep): la corrida de 1951 a 2023 se detuvo en
  2020-21 por esto. Por eso el tope de años es 2019 y una página pesada ya no
  detiene la ingesta.
- A los equipos que no jugaron una temporada (el bateo de la regular viene
  vacío) no se les pide nada más.

### Cómo se protege el parser

Las dos formas en que un scraper falla en silencio, cubiertas:

- **Columnas por encabezado, nunca por posición.** Si falta una que
  esperamos, `FormatoInesperado` y se para.
- **Cada fila se comprueba contra las tasas que publica la propia página**:
  AVG y SLG con H, AB, 2B, 3B y HR; ERA y WHIP con CL, outs, H y BB. Si una
  columna estuviera cruzada, las tasas no darían. La ERA de la fuente divide
  entre los innings redondeados a tres decimales (3 CL en 1.1 IP publica
  20.26, no 20.25); el chequeo acepta las dos cuentas.
- Un blanco es `None`, no 0 (el LOB antes de 2013 no se registraba).

`python main.py ingest-historia` sale con código 1 si alguna fila tiene tasas
que no cuadran, y `verify_digimetrics.py` parsea toda la caché real cuando
existe y exige cero, fuera de las conocidas. Solo las páginas hasta
`ULTIMA_TEMPORADA`: la caché de Arturo guarda también parte de 2020-21 (la
primera corrida la bajó antes de toparse con una página pesada), con 20 filas
descuadradas en Águilas y Licey que nunca llegan a la base.

**Las conocidas son errores de la propia fuente**, revisados a mano y listados
en `DISCREPANCIAS_CONOCIDAS` (`historia_ingestor.py`), página por página y
jugador por jugador. Pasan a aviso y se guardan los conteos tal cual. Hoy hay
una: Escogido, regular 2019-20. A cinco bateadores el AVG y el SLG publicados
les salen con un turno más de los que muestra la tabla (Paredes .225 = 20/89,
con 88 VB). El cruce lo confirma: a Escogido le faltan exactamente 5 VB contra
la MLB API. En las 2.300 páginas de 1951-2019 no hay ninguna otra.

### Las tablas

`hist_bateo` y `hist_pitcheo` con clave `(temporada, etapa, id_equipo,
id_miembro)`, solo conteos (regla 3; los innings como outs, igual que
`pitching_lines`). `hist_jugadores`, `hist_etapas` y
`hist_equipos_temporada`. La ingesta **reemplaza la temporada entera** en una
transacción: idempotente y sin restos si la fuente corrige algo.

En las pruebas, cerrar el ingestor (`HistoriaIngestor.close()`, o usarlo con
`with`) antes de borrar una base temporal: Windows no borra un SQLite con
conexiones abiertas en el pool (WinError 32) y Linux sí, así que el fallo solo
aparece en la PC. `verify_digimetrics.py` comprueba en Linux, vía
`/proc/self/fd`, que no quede ningún archivo abierto en sus carpetas
temporales.

Es una capa aparte, sin conexión con `players`: el `idMiembro` de la fuente y
el id de la MLB no se enlazan todavía. Para 2012-13 en adelante la app sigue
usando el esquema de juego.

### El cruce con la MLB API

De 2012-13 a 2019-20 hay dos anotaciones independientes de los mismos
juegos. `python main.py cruzar-historia` compara los totales de la regular
equipo por equipo (VB, H, 2B, 3B, HR, C, CI, BB, K, BR; G, P, SV, outs, CL, H,
BB, K). Es la comparación contra otra fuente que "Validación cruzada" dejaba
pendiente.

**Resultado con la carga real (30-sep-2026): ninguno de los 48 equipo-temporadas
coincide al dígito.** Las diferencias caen en tres grupos:

| Temporada | Suma de \|dif\| | Qué es |
|-----------|---------------|--------|
| 2014-15, 2017-18, 2018-19, 2019-20 | 23-39 | Anotación: 5 como mucho por total. Dos anotadores independientes (la liga y el de la MLB) no coinciden en cada hit, error o carrera limpia. |
| 2016-17 | 256 | El forfeit Gigantes-Licey: DIGIMETRICS guarda las estadísticas de ese juego (33 y 37 VB de más) y la MLB no tiene su boxscore. El resto, 2 como mucho. |
| 2012-13 | 293 | A DIGIMETRICS le faltan de 4 a 49 outs de pitcheo por equipo. |
| 2013-14 | 189 | Boletos: hasta 35 de diferencia en un equipo. |
| 2015-16 | 13.438 | **DIGIMETRICS está incompleta**: tiene entre el 46 y el 69% de la temporada de cada equipo (en VB). |

Además, en doce etapas de la historia los ganados de todos los lanzadores no
igualan a los perdidos (1963: 120 contra 111): decisiones que faltan o sobran
en la fuente.

Conclusiones:
- Para 2012-13 en adelante manda la MLB API, como ya estaba decidido. La capa
  histórica de esos años solo sirve para este cruce.
- Antes de 2012-13 DIGIMETRICS es la única fuente y es la oficial. Se usa,
  pero no es infalible: el récord de un equipo reconstruido con decisiones
  puede no cuadrar (ver las doce etapas).

`verify_digimetrics.py` (sección 7) fija todo esto cuando la base tiene la capa
histórica: las 66 temporadas, las doce etapas descuadradas, una huella por
temporada (la suma de diferencias absolutas, exacta) y los diagnósticos de
arriba.

## La historia en la API (30-sep-2026)

Con la capa histórica cargada, la app puede mostrar la carrera completa de un
jugador y los líderes de todos los tiempos. Todo sale de `src/historia.py`.

### La regla: cada temporada sale de UNA sola fuente

Antes de 2012-13, DIGIMETRICS (la única que hay). Desde 2012-13, la MLB API.
Las temporadas 2012-2019 de DIGIMETRICS solo sirven para enlazar y para el
cruce; sumarlas contaría esos años dos veces. Y solo serie regular, que es
como se cuentan los récords (`ANIO_CORTE = 2012`).

### El enlace entre fuentes

`hist_enlaces`: idMiembro de DIGIMETRICS → `players.player_id`. Lo arma
`enlazar()` con los años que tienen las dos fuentes (2012-13 a 2019-20):

1. **Por nombre**: el nombre normalizado (sin tildes, puntos ni "Jr.") es
   igual en el mismo equipo y temporada. Si hay dos candidatos (dos Luis De
   La Cruz), no decide.
2. **Por números**, para los que quedan: en el mismo equipo y temporada, un
   apellido parecido con los mismos números (±5 VB, ±3 H, ±6 outs). Hace falta
   volumen (10 entre VB y outs) o un nombre bastante parecido, y un candidato
   único. Así se enlazan Dee Gordon ↔ Dee Strange-Gordon, Nicholas Blake Solak
   ↔ Nick Solak, "Yasmani Grandall" ↔ Yasmani Grandal.

Con la base real: **1.588 de 1.614 (98,4%)**; 1.490 por nombre y 98 por
números. Se rehace al final de cada `ingest-historia` y con
`python main.py enlazar-historia`.

### Lo que expone la API

| Endpoint | Qué da |
|----------|--------|
| `GET /historia/lideres?group=bateo&stat=hr` | Líderes de todos los tiempos, serie regular, las dos fuentes sumadas por persona. Trae la lista de `categories` |
| `GET /historia/resumen` | El líder de las categorías principales (5 de bateo, 4 de pitcheo) en una llamada: la portada de récords |
| `GET /historia/miembros/{id_miembro}` | La ficha de un jugador que solo está en DIGIMETRICS: temporadas con etapas, carrera regular y postemporada aparte |
| `GET /players/{id}` → `history` | Sus temporadas antes de 2012-13 y la carrera completa. `null` si no tiene años anteriores |
| `GET /players/search` → `historicos` | Los que solo están en DIGIMETRICS. Lista aparte: no tienen `player_id`. Ya no da 404 si solo hay históricos |

- **Mínimos de carrera para las tasas:** 1.500 apariciones al plato y 400
  entradas, unas 7 temporadas completas en LIDOM.
- **Líderes reales como prueba:** Polonia 927 hits, Mota .333, Diómedes Olivo
  86 victorias, Marichal 1.87 de efectividad, Juan Francisco 85 jonrones y
  Asencio 167 salvados. Los dos últimos son carreras que cruzan las dos fuentes.
- **Búsqueda de históricos en Python, no con LIKE:** SQLite solo pasa a
  minúsculas las letras sin tilde (`LOWER('PEÑA')` da `peÑa`), y los años
  viejos están en mayúsculas. Se compara con el nombre normalizado, así "pena"
  encuentra a "TONY PEÑA".
- **Los líderes se guardan 10 minutos en memoria (`CacheCarreras`):**
  recorrer todas las líneas de las dos fuentes tarda ~0,3 s.
- **Nombres para mostrar** (`src/nombres.py`, 3-oct): la planilla trae
  mayúsculas, abreviaturas, apodos entre paréntesis y nombres sin tildes
  ("DIOM. GUAYUBIN OLIVO", "JESUS ROJAS ALOU"); 1.348 de los 6.461 cambian
  más allá del tipo título. En orden: los que la liga conoce por otro nombre
  (`CONOCIDOS`: los Alou sin el Rojas, Rico Carty), tipo título con los Mc,
  abreviaturas sin ambigüedad (Fdo., Fed., Diom.), el apodo entre comillas
  (Diómedes "Guayubín" Olivo) y tildes contra listas cerradas. "Martín" solo
  como nombre de pila: Billy Martin no lleva tilde. Una marca de una letra
  ("(L)") no es apodo y se queda al final. Solo para DIGIMETRICS: los nombres
  de la MLB API son su registro oficial. El buscador compara también contra
  el nombre mostrado ("diomedes" encuentra a "DIOM."). La suite fija los
  casos.
- **La clave de persona de los no enlazados es `hist:<id>`**, no `m<id>`.
  La primera versión (entrega 50) usaba `m<id>` y la distinguía del slug por
  la letra inicial: un slug de la MLB API que empieza con "m"
  ("moises-sierra-…") se tomaba por histórico y `/historia/lideres` daba 500.
  `es_historico()` e `id_historico()` en `src/historia.py`; la suite tiene a
  "moises-sierra" de regresión.

## La historia en la web y el móvil (30-sep-2026)

Tres puertas, iguales en las dos plataformas:

| Qué | Web | Móvil |
|-----|-----|-------|
| Récords de todos los tiempos | `/historia?grupo=&stat=` (pestaña "Historia" de la barra) | `RecordsScreen` (ruta `Records`), desde el panel de récords del buscador |
| Ficha de un histórico | `/historia/jugador/[idMiembro]` | `HistoricoScreen` (ruta `Historico`) |
| Años anteriores en la ficha | `app/players/[playerId]` | `PlayerScreen` |

- **Récords:** Bateo | Pitcheo en pestañas (dos opciones) y la categoría con
  el selector de temporada (`SelectorOpciones` en la web, `SelectorTemporada`
  con `icono={null}` en el móvil): trece categorías no caben en pestañas. El
  primero va en una tarjeta navy, sin color de club (el récord es de la
  liga); el resto en filas que abren la ficha de la MLB API si el jugador
  está enlazado y la histórica si no. Las tasas anuncian su mínimo.
- **El buscador del móvil, vacío, muestra los récords** (`/historia/resumen`)
  en tarjetas de dos columnas. En la web el buscador añade la sección
  "Históricos · antes de 2012-13".
- **Ficha de un histórico:** la misma forma que la de la MLB API (cabecera
  héroe con monograma, trayectoria, franja de carrera, año a año) sin lo que
  esos años no tienen. La tabla trae la postemporada con su etapa marcada
  (RR, Final) y su total aparte; la carrera es solo la regular. Si el miembro
  resulta estar enlazado, la pantalla se reemplaza por la ficha completa
  (`navigation.replace` en el móvil, `redirect` en la web).
- **Ficha de un jugador con años viejos:** la carrera y la trayectoria son las
  de las dos fuentes (`history.career_*`, `history.teams`), y la tabla añade
  sus temporadas de DIGIMETRICS bajo una franja "Antes de 2012-13". En el
  móvil el texto de esa franja va en la parte desplazable de la tabla: en la
  columna fija salía cortado. Las filas viejas no abren el equipo:
  de esos años no hay ficha de equipo.
- `epocaHistorica()` (en `formato.ts` de las dos) pinta el rango con años
  completos: "1984–2011", no "1984-85–2010-11" ni el ambiguo "1986–06".

### Sin resultados no es sin conexión (móvil)

`/players/search` responde 404 cuando no encuentra a nadie, y el buscador del
móvil lo pintaba como "Sin conexión". `get()` en `mobile/src/api.ts` acepta
`si404`: con él, un 404 es una respuesta vacía y no un fallo. Lo usa la
búsqueda; el resto de los endpoints siguen tratando el 404 como error.

## El despliegue: Oracle Cloud Always Free (3-oct-2026)

Decidido el 3-oct: la API, la base y el motor en vivo en una instancia A1
(ARM, 2 OCPU y 12 GB) del plan Always Free de Oracle, con Caddy delante para
el HTTPS; la web en Vercel Hobby; el nombre, un subdominio de DuckDNS. Costo
cero mientras no haya anuncios. Todo en `deploy/oracle/`, con la guía paso a
paso en `GUIA.md`.

- **Un solo worker de uvicorn**, a propósito: la caché en vivo y el límite
  por IP son de proceso. Dos workers serían dos pollers y el doble de límite.
- **La API escucha solo en 127.0.0.1** y Caddy pone la IP real en
  `X-Forwarded-For` ignorando la del cliente. Las dos cosas juntas son las que
  hacen seguro `LIDOM_CONFIAR_PROXY=1`. Probado: 400 peticiones con 400
  `X-Forwarded-For` inventados dan 429 al pasar el cupo, como una sola IP.
- **Caddy comprime todo menos `/stream`**: comprimir un flujo SSE obliga a
  juntar bytes antes de enviar. La búsqueda baja de 5.1 KB a 0.9 KB, y el
  primer evento del flujo llega en el acto.
- **`/etc/deportiv/api.env`** lo genera `instalar.sh` con claves nuevas (43
  caracteres, distintas), `root:deportiv 640`. Nunca entra al repositorio.
  Correr el instalador otra vez conserva las claves y solo cambia los
  orígenes.
- **El servicio no puede escribir fuera de `data/`** (`ProtectSystem=strict`).
  La API no escribe nada más: la base y su diario. `setup_logger()` (que
  escribe en `logs/`) no lo llama la API; sus registros van a journald.
- **`correr.sh`** corre `main.py` como el usuario `deportiv`: un diario de
  SQLite creado por root dejaría a la API sin poder escribir.
- **Respaldo diario** con la API de respaldo de SQLite (no copiando el
  archivo, que con la API escribiendo puede salir a medias), comprobado con
  `integrity_check`, 14 copias. Con la temporada en marcha la base del
  servidor ya no se reconstruye desde la PC.
- **Pay As You Go**: Oracle reclama instancias gratis ociosas (CPU, red y
  memoria bajo el 20% una semana), y la API usa ~1% de la memoria. La guía
  pasa la cuenta a Pay As You Go con un presupuesto de 1 USD con alerta.
- Todas las dependencias tienen paquete precompilado para ARM y Python 3.12
  (el de Ubuntu 24.04): en el servidor no se compila nada.

**La jornada es la de RD, no la del reloj de la máquina.** El poller pedía
los juegos de `date.today()`, que en la PC de Arturo es la fecha de RD y en
el servidor (UTC) pasa al día siguiente a las 8 de la noche de aquí, en plena
jornada. Ahora usa `hoy_rd()` (`src/jornada.py`), igual que `/day`; también la
repetición y la edad de las fichas. La unidad de systemd pone además
`TZ=America/Santo_Domingo`, para que los registros salgan en hora de RD.
`verify_live_poller.py` lo fija: a la 1:30 UTC del 16 el poller sigue el 15.

## Integración continua (5-oct-2026)

`.github/workflows/verify.yml`, en cada push a `main` y en cada pull request.
Tres trabajos en paralelo: las suites de Python, la web (tsc, lint y `next
build`) y el móvil (tsc).

- **Corren 8 de las 11 suites.** `verify_game_routes`, `verify_capas` y
  `verify_winprob` necesitan la base REAL, que no se versiona (se arma desde
  la MLB API y redistribuirla choca con sus términos). Esas siguen corriendo
  a mano antes de cada entrega. `verify_historia` y `verify_digimetrics`
  corren la parte que no necesita la base y se saltan el resto solas.
- **Las capturas del motor en vivo se bajan una vez y se guardan en la caché
  de Actions** (clave: el hash de `capture_gumbo.py` y `capture_diffs.py`).
  La captura es determinista: con las mismas 359 marcas elige las mismas 10
  instantáneas y la misma cadena de parches que hay en `fixtures/` de la PC
  (comprobado). Si se cambia un script de captura, la clave cambia y se
  vuelven a bajar.
- **`data/` no existe en un clon limpio** y SQLite no crea la carpeta: el
  flujo hace `mkdir -p data`. Sin eso `verify_seguridad` falla con "unable to
  open database file".
- **`verify_seguridad` acepta 200 o 404 en la búsqueda normal.** Lo que
  comprueba es que la seguridad no la rechace (422 o 429); con la base vacía
  de CI no hay jugadores y la respuesta correcta es 404.
- **`next build` no necesita la API**: todas las páginas se arman al
  pedirlas (ƒ en la salida del build). Sí necesita bajar las fuentes de
  Google, que en Actions hay red para eso.
- Acciones en sus versiones vigentes (checkout, setup-python y setup-node v7,
  cache v6; todas en Node 24). Python 3.12, el de producción.
- Validado con actionlint 1.7.12. `npm ci` probado desde un clon limpio en la
  web y el móvil: los `package-lock.json` coinciden con sus `package.json`.

## Próximos pasos

1. Desplegar en Oracle siguiendo `deploy/oracle/GUIA.md` antes del arranque de la 2026-27 (mediados de octubre), y apuntar la app y la web a la API de allá.
2. Probar el poller contra juegos reales cuando arranque la 2026-27 (mediados de octubre). Hasta entonces, `replay_game.py` y las suites cubren el camino.
3. Las fichas de DIGIMETRICS (`/Miembro/Detalle` con `idMiembro`) para la biografía de los históricos, si la traen; y récords por temporada (mejor temporada de la historia), que salen de las mismas tablas.
4. Producción: PostgreSQL vía Alembic, y varios workers de uvicorn — ojo, la caché en memoria es por proceso, así que ahí haría falta Redis o un solo worker dedicado al poller.

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
