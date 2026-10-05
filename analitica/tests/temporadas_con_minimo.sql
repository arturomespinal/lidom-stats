-- Toda temporada de los hechos tiene sus mínimos de calificación. Sin ellos
-- nadie califica en esa temporada y sus tasas desaparecen de los récords sin
-- error. Aviso, no fallo: una temporada vieja sin decisiones de pitcheo en
-- la fuente no tiene de dónde sacar sus juegos.
{{ config(severity='warn') }}
select distinct season_id
from {{ ref('fct_bateo_temporada') }}
where min_pa is null
