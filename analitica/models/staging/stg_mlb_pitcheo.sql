-- Una línea de pitcheo por jugador y juego, de la MLB API (desde 2012-13).
-- La decisión (G, P, SV) viene del boxscore del juego, no del acumulado.
select
    pl.player_id                         as persona,
    g.season_id,
    cast(substr(g.season_id, 1, 4) as integer) as anio,
    pl.team_code,
    pl.game_id,
    case when pl.is_starter then 1 else 0 end as games_started,
    case when pl.decision = 'W' then 1 else 0 end  as wins,
    case when pl.decision = 'L' then 1 else 0 end  as losses,
    case when pl.decision = 'SV' then 1 else 0 end as saves,
    coalesce(pl.outs_recorded, 0)        as outs,
    coalesce(pl.hits_allowed, 0)         as h,
    coalesce(pl.earned_runs, 0)          as er,
    coalesce(pl.walks_allowed, 0)        as bb,
    coalesce(pl.strikeouts, 0)           as so
from {{ source('base', 'pitching_lines') }} pl
join {{ source('base', 'games') }} g on g.game_id = pl.game_id
where g.stage = 'regular' and g.status = 'final'
