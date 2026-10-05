-- Lo que no puede pasar en ninguna temporada: más hits que turnos, más
-- extrabases que hits, más turnos que apariciones, conteos negativos o
-- tasas fuera de su rango.
select persona_temporada, ab, h, pa, avg, obp, slg
from {{ ref('fct_bateo_temporada') }}
where h > ab
   or doubles + triples + hr > h
   or pa < ab
   or least(ab, h, hr, bb, so, sb, pa) < 0
   or avg not between 0 and 1
   or obp not between 0 and 1
   or slg not between 0 and 4
