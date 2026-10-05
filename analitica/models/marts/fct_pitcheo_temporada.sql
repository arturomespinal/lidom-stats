-- Una fila por persona y temporada de serie regular, desde 1951. Una sola
-- fuente por temporada, como fct_bateo_temporada.
with mlb as (
    select
        persona, season_id, anio, 'mlb' as fuente,
        string_agg(distinct team_code, '/' order by team_code) as equipos,
        count(distinct game_id) as games,
        sum(games_started) as games_started, sum(wins) as wins, sum(losses) as losses,
        sum(saves) as saves, sum(outs) as outs, sum(h) as h, sum(er) as er,
        sum(bb) as bb, sum(so) as so
    from {{ ref('stg_mlb_pitcheo') }}
    group by persona, season_id, anio
),

liga as (
    select
        persona, season_id, anio, 'liga' as fuente,
        string_agg(distinct team_code, '/' order by team_code) as equipos,
        sum(games) as games,
        sum(games_started) as games_started, sum(wins) as wins, sum(losses) as losses,
        sum(saves) as saves, sum(outs) as outs, sum(h) as h, sum(er) as er,
        sum(bb) as bb, sum(so) as so
    from {{ ref('stg_liga_pitcheo') }}
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
    cast(u.games as integer) as games, cast(u.games_started as integer) as games_started,
    cast(u.wins as integer) as wins, cast(u.losses as integer) as losses,
    cast(u.saves as integer) as saves, cast(u.outs as integer) as outs,
    cast(u.h as integer) as h, cast(u.er as integer) as er,
    cast(u.bb as integer) as bb, cast(u.so as integer) as so,
    {{ tasas_pitcheo() }},
    m.min_outs,
    -- 0.6 entradas por juego del equipo que más jugó, en outs.
    coalesce(u.outs >= m.min_outs, false) as califica
from unidas u
left join {{ source('base', 'minimos_temporada') }} m on m.season_id = u.season_id
