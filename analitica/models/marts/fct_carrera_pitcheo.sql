-- La carrera de pitcheo de cada persona en serie regular (ver fct_carrera_bateo).
with t as (
    select
        persona,
        count(*) as temporadas,
        arg_min(season_id, anio) as primera, arg_max(season_id, anio) as ultima,
        sum(games) as games, sum(games_started) as games_started,
        sum(wins) as wins, sum(losses) as losses, sum(saves) as saves,
        sum(outs) as outs, sum(h) as h, sum(er) as er, sum(bb) as bb, sum(so) as so
    from {{ ref('fct_pitcheo_temporada') }}
    group by persona
)

select
    t.*,
    {{ tasas_pitcheo() }},
    t.outs >= c.min_outs_carrera as califica
from t
cross join {{ source('base', 'constantes') }} c
