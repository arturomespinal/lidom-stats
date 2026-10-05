-- DIGIMETRICS, bateo de serie regular ANTES del corte. Desde el corte manda
-- la MLB API: sumar los dos contaría 2012-2019 dos veces.
--
-- La persona es el player_id de la MLB API si el miembro está enlazado, o
-- 'hist:<id>' si no. La misma clave que src/historia.py.
select
    coalesce(e.player_id, 'hist:' || cast(b.id_miembro as varchar)) as persona,
    b.id_miembro,
    b.season_id,
    b.temporada                          as anio,
    b.team_code,
    coalesce(b.games, 0)                 as games,
    coalesce(b.at_bats, 0)               as ab,
    coalesce(b.hits, 0)                  as h,
    coalesce(b.doubles, 0)               as doubles,
    coalesce(b.triples, 0)               as triples,
    coalesce(b.home_runs, 0)             as hr,
    coalesce(b.runs, 0)                  as r,
    coalesce(b.rbi, 0)                   as rbi,
    coalesce(b.walks, 0)                 as bb,
    coalesce(b.strikeouts, 0)            as so,
    coalesce(b.stolen_bases, 0)          as sb,
    coalesce(b.hit_by_pitch, 0)          as hbp,
    coalesce(b.sacrifice_flies, 0)       as sf,
    coalesce(b.sacrifice_bunts, 0)       as sh
from {{ source('base', 'hist_bateo') }} b
left join {{ source('base', 'hist_enlaces') }} e on e.id_miembro = b.id_miembro
where b.etapa = 'SR'
  and b.temporada < (select anio_corte from {{ source('base', 'constantes') }})
