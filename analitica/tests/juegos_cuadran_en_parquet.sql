-- Cada juego final de la regular cuadra consigo mismo en lo que leyó dbt:
-- las carreras de los bateadores de cada equipo suman su marcador. Dagster
-- ya lo comprueba en la base (check `juegos_cuadran`); esto prueba que la
-- exportación no perdió ni duplicó líneas.
--
-- Va como check de fct_bateo_temporada, el primer modelo que lee esas líneas.
-- depends_on: {{ ref('fct_bateo_temporada') }}
{{ config(meta={'dagster': {'ref': {'name': 'fct_bateo_temporada'}}}) }}
with carreras as (
    select game_id, team_code, sum(r) as anotadas
    from {{ ref('stg_mlb_bateo') }}
    group by game_id, team_code
),

esperado as (
    select game_id, home_team_code as team_code, home_score as marcador
    from {{ source('base', 'games') }}
    where stage = 'regular' and status = 'final'
    union all
    select game_id, away_team_code, away_score
    from {{ source('base', 'games') }}
    where stage = 'regular' and status = 'final'
)

select e.game_id, e.team_code, e.marcador, coalesce(c.anotadas, 0) as anotadas
from esperado e
left join carreras c on c.game_id = e.game_id and c.team_code = e.team_code
where coalesce(c.anotadas, 0) <> coalesce(e.marcador, 0)
