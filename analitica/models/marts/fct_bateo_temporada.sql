-- Una fila por persona y temporada de serie regular, desde 1951.
--
-- Cada temporada sale de UNA sola fuente: DIGIMETRICS antes del corte, la
-- MLB API desde entonces. Quien cambió de equipo a mitad de temporada suma
-- los dos (`equipos` dice cuáles).
with mlb as (
    select
        persona, season_id, anio, 'mlb' as fuente,
        string_agg(distinct team_code, '/' order by team_code) as equipos,
        count(distinct game_id) as games,
        sum(pa) as pa, sum(ab) as ab, sum(h) as h, sum(doubles) as doubles,
        sum(triples) as triples, sum(hr) as hr, sum(r) as r, sum(rbi) as rbi,
        sum(bb) as bb, sum(so) as so, sum(sb) as sb, sum(hbp) as hbp, sum(sf) as sf
    from {{ ref('stg_mlb_bateo') }}
    group by persona, season_id, anio
),

liga as (
    select
        persona, season_id, anio, 'liga' as fuente,
        string_agg(distinct team_code, '/' order by team_code) as equipos,
        sum(games) as games,
        -- La fuente no trae apariciones al plato: se reconstruyen.
        sum(ab + bb + hbp + sf + sh) as pa, sum(ab) as ab, sum(h) as h, sum(doubles) as doubles,
        sum(triples) as triples, sum(hr) as hr, sum(r) as r, sum(rbi) as rbi,
        sum(bb) as bb, sum(so) as so, sum(sb) as sb, sum(hbp) as hbp, sum(sf) as sf
    from {{ ref('stg_liga_bateo') }}
    group by persona, season_id, anio
),

unidas as (
    select * from mlb
    union all
    select * from liga
)

select
    u.persona || '|' || u.season_id as persona_temporada,
    u.persona, u.season_id, u.anio, u.fuente, u.equipos,
    cast(u.games as integer) as games,
    cast(u.pa as integer) as pa, cast(u.ab as integer) as ab, cast(u.h as integer) as h,
    cast(u.doubles as integer) as doubles, cast(u.triples as integer) as triples,
    cast(u.hr as integer) as hr, cast(u.r as integer) as r, cast(u.rbi as integer) as rbi,
    cast(u.bb as integer) as bb, cast(u.so as integer) as so, cast(u.sb as integer) as sb,
    cast(u.hbp as integer) as hbp, cast(u.sf as integer) as sf,
    {{ tasas_bateo() }},
    m.min_pa,
    -- Califica para las tasas con el mínimo de SU temporada (3.1 AP por
    -- juego del equipo que más jugó). Sin mínimo conocido, no califica.
    coalesce(u.pa >= m.min_pa, false) as califica
from unidas u
left join {{ source('base', 'minimos_temporada') }} m on m.season_id = u.season_id
