-- La carrera de cada persona en serie regular: la suma de sus temporadas de
-- las dos fuentes. Debe dar lo mismo que carreras() de src/historia.py; la
-- suite verify_analitica.py lo comprueba persona por persona.
with t as (
    select
        persona,
        count(*) as temporadas,
        arg_min(season_id, anio) as primera, arg_max(season_id, anio) as ultima,
        sum(games) as games, sum(pa) as pa, sum(ab) as ab, sum(h) as h,
        sum(doubles) as doubles, sum(triples) as triples, sum(hr) as hr,
        sum(r) as r, sum(rbi) as rbi, sum(bb) as bb, sum(so) as so,
        sum(sb) as sb, sum(hbp) as hbp, sum(sf) as sf
    from {{ ref('fct_bateo_temporada') }}
    group by persona
)

select
    t.*,
    {{ tasas_bateo() }},
    t.pa >= c.min_pa_carrera as califica
from t
cross join {{ source('base', 'constantes') }} c
