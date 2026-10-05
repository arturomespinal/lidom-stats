{#
  Las tasas se RECOMPONEN de los conteos sumados, nunca se promedian
  (src/carrera.py). Las mismas fórmulas que src/historia.py, con el mismo
  redondeo: tres decimales en bateo, dos en pitcheo, y el OPS como suma de
  OBP y SLG ya redondeados.
#}

{% macro tasas_bateo() %}
    round(h / nullif(ab, 0), 3) as avg,
    round((h + bb + hbp) / nullif(ab + bb + hbp + sf, 0), 3) as obp,
    round(({{ bases_totales() }}) / nullif(ab, 0), 3) as slg,
    round(
        round((h + bb + hbp) / nullif(ab + bb + hbp + sf, 0), 3)
        + round(({{ bases_totales() }}) / nullif(ab, 0), 3),
        3
    ) as ops
{% endmacro %}

{% macro bases_totales() %}
    (h - doubles - triples - hr) + 2 * doubles + 3 * triples + 4 * hr
{% endmacro %}

{% macro tasas_pitcheo() %}
    round(outs / 3.0, 1) as innings_pitched,
    round(er * 27.0 / nullif(outs, 0), 2) as era,
    round((bb + h) * 3.0 / nullif(outs, 0), 2) as whip
{% endmacro %}
