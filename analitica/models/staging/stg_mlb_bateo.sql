-- Una línea de bateo por jugador y juego, de la MLB API (desde 2012-13).
-- Solo serie regular y juegos terminados: así se cuentan los récords.
select
    bl.player_id                      as persona,
    g.season_id,
    cast(substr(g.season_id, 1, 4) as integer) as anio,
    bl.team_code,
    bl.game_id,
    coalesce(bl.plate_appearances, 0) as pa,
    coalesce(bl.at_bats, 0)           as ab,
    coalesce(bl.hits, 0)              as h,
    coalesce(bl.doubles, 0)           as doubles,
    coalesce(bl.triples, 0)           as triples,
    coalesce(bl.home_runs, 0)         as hr,
    coalesce(bl.runs, 0)              as r,
    coalesce(bl.rbi, 0)               as rbi,
    coalesce(bl.walks, 0)             as bb,
    coalesce(bl.strikeouts, 0)        as so,
    coalesce(bl.stolen_bases, 0)      as sb,
    coalesce(bl.hit_by_pitch, 0)      as hbp,
    coalesce(bl.sacrifice_flies, 0)   as sf,
    coalesce(bl.sacrifice_bunts, 0)   as sh
from {{ source('base', 'batting_lines') }} bl
join {{ source('base', 'games') }} g on g.game_id = bl.game_id
where g.stage = 'regular' and g.status = 'final'
