-- Quién es cada persona de los hechos. El nombre de la MLB API para los que
-- tienen player_id; el de DIGIMETRICS, ya arreglado en Python, para los demás.
with personas as (
    select persona from {{ ref('fct_bateo_temporada') }}
    union
    select persona from {{ ref('fct_pitcheo_temporada') }}
),

miembros as (
    select player_id, min(id_miembro) as id_miembro
    from {{ source('base', 'hist_enlaces') }}
    group by player_id
)

select
    p.persona,
    case when p.persona like 'hist:%' then null else p.persona end as player_id,
    case
        when p.persona like 'hist:%' then cast(substr(p.persona, 6) as bigint)
        else m.id_miembro
    end as id_miembro,
    coalesce(pl.full_name, nh.nombre, p.persona) as nombre
from personas p
left join {{ source('base', 'players') }} pl on pl.player_id = p.persona
left join miembros m on m.player_id = p.persona
left join {{ source('base', 'nombres_historicos') }} nh
    on p.persona like 'hist:%' and nh.id_miembro = try_cast(substr(p.persona, 6) as bigint)
