-- DIGIMETRICS, pitcheo de serie regular ANTES del corte (ver stg_liga_bateo).
select
    coalesce(e.player_id, 'hist:' || cast(p.id_miembro as varchar)) as persona,
    p.id_miembro,
    p.season_id,
    p.temporada                          as anio,
    p.team_code,
    coalesce(p.games, 0)                 as games,
    coalesce(p.games_started, 0)         as games_started,
    coalesce(p.wins, 0)                  as wins,
    coalesce(p.losses, 0)                as losses,
    coalesce(p.saves, 0)                 as saves,
    coalesce(p.outs, 0)                  as outs,
    coalesce(p.hits_allowed, 0)          as h,
    coalesce(p.earned_runs, 0)           as er,
    coalesce(p.walks_allowed, 0)         as bb,
    coalesce(p.strikeouts, 0)            as so
from {{ source('base', 'hist_pitcheo') }} p
left join {{ source('base', 'hist_enlaces') }} e on e.id_miembro = p.id_miembro
where p.etapa = 'SR'
  and p.temporada < (select anio_corte from {{ source('base', 'constantes') }})
