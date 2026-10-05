-- Conteos negativos, más aperturas que juegos, o tasas negativas.
select persona_temporada, games, games_started, outs, era, whip
from {{ ref('fct_pitcheo_temporada') }}
where least(outs, h, er, bb, so, wins, losses, saves) < 0
   or games_started > games
   or era < 0
   or whip < 0
