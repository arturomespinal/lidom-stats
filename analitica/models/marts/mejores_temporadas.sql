-- Las mejores temporadas de la historia en cada categoría de récords, de
-- 1951 a hoy: el top 10 con empates compartidos (1, 2, 2, 4).
--
-- Las categorías, su sentido y si son tasa vienen de src/historia.py (la
-- fuente `categorias`). En las tasas solo entra quien calificó en SU
-- temporada: un .600 en 10 turnos no es la mejor temporada de nadie.
with bateo as (
    unpivot (
        select
            persona_temporada, persona, season_id, anio, fuente, equipos, califica,
            cast(h as double) as h, cast(hr as double) as hr, cast(rbi as double) as rbi,
            cast(r as double) as r, cast(doubles as double) as doubles,
            cast(triples as double) as triples, cast(sb as double) as sb,
            cast(bb as double) as bb, cast(games as double) as games,
            avg, obp, slg, ops
        from {{ ref('fct_bateo_temporada') }}
    )
    on h, hr, rbi, r, doubles, triples, sb, bb, games, avg, obp, slg, ops
    into name stat value valor
),

pitcheo as (
    unpivot (
        select
            persona_temporada, persona, season_id, anio, fuente, equipos, califica,
            cast(wins as double) as wins, cast(saves as double) as saves,
            cast(so as double) as so, cast(outs as double) as outs,
            cast(games as double) as games, cast(games_started as double) as games_started,
            era, whip
        from {{ ref('fct_pitcheo_temporada') }}
    )
    on wins, saves, so, outs, games, games_started, era, whip
    into name stat value valor
),

largo as (
    select 'bateo' as grupo, * from bateo
    union all
    select 'pitcheo' as grupo, * from pitcheo
),

candidatas as (
    select l.*, c.etiqueta, c.mayor_es_mejor, c.es_tasa
    from largo l
    join {{ source('base', 'categorias') }} c on c.grupo = l.grupo and c.stat = l.stat
    where l.valor is not null
      and (not c.es_tasa or l.califica)
),

puestos as (
    select
        *,
        rank() over (
            partition by grupo, stat
            order by case when mayor_es_mejor then valor else -valor end desc
        ) as puesto
    from candidatas
)

select
    p.grupo, p.stat, p.etiqueta, p.puesto,
    p.persona, d.nombre, d.player_id, d.id_miembro,
    p.season_id, p.anio, p.fuente, p.equipos, p.valor,
    p.mayor_es_mejor, p.es_tasa
from puestos p
join {{ ref('dim_personas') }} d on d.persona = p.persona
where p.puesto <= 10
