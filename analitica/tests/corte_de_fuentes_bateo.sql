-- DIGIMETRICS solo antes del corte; la MLB API solo desde el corte.
{{ config(meta={'dagster': {'ref': {'name': 'fct_bateo_temporada'}}}) }}
select t.persona_temporada, t.fuente, t.anio
from {{ ref('fct_bateo_temporada') }} t
cross join {{ source('base', 'constantes') }} c
where (t.fuente = 'liga' and t.anio >= c.anio_corte)
   or (t.fuente = 'mlb' and t.anio < c.anio_corte)
