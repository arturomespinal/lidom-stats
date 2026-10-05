-- Ninguna temporada sale de las dos fuentes: si una aparece como 'liga' y
-- como 'mlb', algún año de 2012-2019 se está contando dos veces.
select season_id, count(distinct fuente) as fuentes
from {{ ref('fct_bateo_temporada') }}
group by season_id
having count(distinct fuente) > 1
