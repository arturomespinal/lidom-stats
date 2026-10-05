-- En las categorías de tasa de las mejores temporadas solo entra quien
-- calificó en su temporada.
{{ config(meta={'dagster': {'ref': {'name': 'mejores_temporadas'}}}) }}
select m.grupo, m.stat, m.persona, m.season_id
from {{ ref('mejores_temporadas') }} m
left join {{ ref('fct_bateo_temporada') }} b
    on m.grupo = 'bateo' and b.persona = m.persona and b.season_id = m.season_id
left join {{ ref('fct_pitcheo_temporada') }} p
    on m.grupo = 'pitcheo' and p.persona = m.persona and p.season_id = m.season_id
where m.es_tasa and not coalesce(b.califica, p.califica, false)
