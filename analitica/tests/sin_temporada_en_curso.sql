-- Ninguna de las mejores temporadas puede ser de una temporada en curso: su
-- mínimo de calificación es el de los juegos jugados hasta hoy, y un .478 en
-- 25 apariciones no es la mejor temporada de la historia.
{{ config(meta={'dagster': {'ref': {'name': 'mejores_temporadas'}}}) }}
select m.grupo, m.stat, m.puesto, m.nombre, m.season_id
from {{ ref('mejores_temporadas') }} m
left join {{ source('base', 'minimos_temporada') }} t on t.season_id = m.season_id
where t.completa is not true
