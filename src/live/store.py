"""
src/live/store.py — Caché volátil del estado en vivo.

Deliberadamente separada de SQLite. La base es la verdad histórica y se escribe
una vez por juego, cuando termina; esto otro cambia cada diez segundos, no
sobrevive a un reinicio y no debe: si el proceso se cae, el poller vuelve a
pedir el feed completo y reconstruye todo en un sondeo. Escribir esto en disco
solo produciría desgaste y la ilusión de durabilidad.

Guarda cuatro cosas por juego:
  - el documento GUMBO crudo, porque los parches se aplican SOBRE él
  - el LiveGameState ya reducido, que es lo que se sirve en la tarjeta
  - al terminar, el LiveGameDetail congelado, para que la pantalla del juego
    siga funcionando después de soltar el crudo
  - el recorrido de la probabilidad de ganar: un punto por cada vez que se
    mueve. Es lo ÚNICO acumulativo de toda la caché, y la excepción está
    justificada abajo, en WinProbPoint.

El acceso va bajo un lock porque el poller corre en su propio hilo y los
manejadores HTTP leen desde otro.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Optional

from src.live.detail import LiveGameDetail, parse_game_detail
from src.constants import LIDOM_TEAMS_BY_CODE
from src.live.gumbo import LiveGameState, ordinal_es


class WinProbPoint:
    """Un punto del recorrido de la probabilidad de ganar.

    Este es el único dato ACUMULATIVO de la caché — todo lo demás es el estado
    de ahora mismo y se reemplaza. La excepción se justifica porque el recorrido
    no se puede reconstruir: la probabilidad es función de un estado que ya
    pasó, y cuando el juego avanza ese estado desaparece del feed. O se guarda
    cuando ocurre, o se pierde para siempre.

    Lleva el marcador y la entrada, no solo el número, porque una gráfica sin
    contexto no dice nada: el pico interesante es el que coincide con una
    carrera, y para etiquetarlo hay que saber cuál era el marcador ahí.
    """

    __slots__ = ("inning", "is_top", "away", "home", "wp", "at")

    def __init__(self, inning: int, is_top: bool, away: int, home: int,
                 wp: float, at: float):
        self.inning = inning
        self.is_top = is_top
        self.away = away
        self.home = home
        self.wp = wp
        self.at = at

    def as_dict(self) -> dict:
        return {
            "inning": self.inning, "is_top": self.is_top,
            "away": self.away, "home": self.home, "wp": self.wp,
            # "Alta del 3ro", ya compuesto. El cliente lo pinta en el tooltip
            # de la franja y NO lo arma: la regla de ordinal_es — un solo
            # lugar donde traducir es un solo lugar donde equivocarse.
            "label": f"{'Alta' if self.is_top else 'Baja'} del {ordinal_es(self.inning)}",
        }


def _pct(wp: float) -> int:
    """Porcentaje entero con redondeo HACIA ARRIBA en el medio: 0.625 → 63.

    `round()` de Python redondea al par (62.5 → 62) y `Math.round` de
    JavaScript hacia arriba (63). La leyenda de la franja la calcula el
    cliente con Math.round; si el titular usara round(), el mismo punto
    podría decir 63% arriba y 62% abajo en la misma pantalla.
    """
    return int(wp * 100 + 0.5)


def titular_recorrido(track: list[dict], home_code: str, away_code: str) -> Optional[str]:
    """La frase que resume la curva de un juego TERMINADO.

    "Estrellas nunca estuvo por debajo del 56%." o "Licey llegó a estar en
    23% y remontó." Es lo que convierte la franja de un gráfico en una
    noticia, y sale del dato: el mínimo que tuvo el ganador a lo largo del
    recorrido.

    Vive en el backend y no en los clientes por la misma regla que
    carrera.py y lateralidad.py: son dos plataformas, y una frase compuesta
    dos veces es una frase que un día dice cosas distintas en la web y en el
    teléfono.

    Devuelve None si no hay recorrido o si el juego terminó empatado —
    suspendido—: ahí no hay ganador del que hablar.
    """
    if len(track) < 2:
        return None
    ultimo = track[-1]
    if ultimo["home"] == ultimo["away"]:
        return None

    gana_local = ultimo["home"] > ultimo["away"]
    codigo = home_code if gana_local else away_code
    ganador = LIDOM_TEAMS_BY_CODE.get(codigo, {}).get("short_name", codigo)

    # En enteros y con la MISMA regla del par que pintan los clientes: el
    # visitante es 100 menos el local, no un segundo redondeo. Si no, con
    # wp = 0.885 la tabla diría "11%" para el visitante y el titular "12%".
    minimo = min(_pct(p["wp"]) if gana_local else 100 - _pct(p["wp"]) for p in track)

    if minimo < 50:
        return f"{ganador} llegó a estar en {minimo}% y remontó."
    return f"{ganador} nunca estuvo por debajo del {minimo}%."


# Un punto nuevo solo si la probabilidad se movió al menos esto. Sin el umbral
# se guardaría un punto por sondeo —360 por juego— casi todos idénticos, y la
# gráfica saldría con escalones de ruido. Con 0.5 puntos porcentuales quedan
# unos 40-80, que es la densidad de una curva legible.
UMBRAL_WP = 0.005

# Tope duro. Un juego de entradas extra con muchos cambios podría estirarse;
# 400 puntos son unos 20 KB y cubren de sobra cualquier juego real.
MAX_PUNTOS_WP = 400


class LiveEntry:
    """Lo que sabemos de un juego que estamos siguiendo."""

    __slots__ = ("game_pk", "game_id", "raw", "timecode", "state", "detail",
                 "updated_at", "poll_count", "full_fetches", "patch_applications",
                 "win_prob_track")

    def __init__(self, game_pk: int, game_id: Optional[str] = None):
        self.game_pk = game_pk
        self.game_id = game_id
        self.raw: Optional[dict] = None       # documento GUMBO completo
        self.timecode: Optional[str] = None   # marca del último estado aplicado
        self.state: Optional[LiveGameState] = None
        # Solo se llena al terminar el juego, cuando se suelta el crudo. Ver
        # drop(). Mientras el juego corre el detalle se proyecta al vuelo.
        self.detail: Optional[LiveGameDetail] = None
        self.updated_at: float = 0.0
        # Contadores para diagnóstico: cuántos sondeos, cuántas veces hubo que
        # bajar el feed entero y cuántas bastó con parches.
        self.poll_count = 0
        self.full_fetches = 0
        self.patch_applications = 0
        # Recorrido de la probabilidad. Ver WinProbPoint.
        self.win_prob_track: list[WinProbPoint] = []

    @property
    def age_seconds(self) -> float:
        return time.time() - self.updated_at if self.updated_at else float("inf")


class LiveStore:
    """Almacén en memoria, seguro entre hilos."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._entries: dict[int, LiveEntry] = {}

    # ── Escritura (la usa el poller) ──────────────────────────────────────────

    def entry(self, game_pk: int, game_id: Optional[str] = None) -> LiveEntry:
        """Devuelve la entrada del juego, creándola si hace falta."""
        with self._lock:
            e = self._entries.get(game_pk)
            if e is None:
                e = LiveEntry(game_pk, game_id)
                self._entries[game_pk] = e
            elif game_id and not e.game_id:
                e.game_id = game_id
            return e

    def update(self, game_pk: int, raw: dict, state: LiveGameState) -> None:
        with self._lock:
            e = self.entry(game_pk)
            e.raw = raw
            e.timecode = state.timestamp
            e.state = state
            e.updated_at = time.time()
            self._anota_win_prob(e, state)

    def _anota_win_prob(self, e: LiveEntry, state: LiveGameState) -> None:
        """Añade un punto al recorrido si la probabilidad se movió.

        Se llama con el lock ya tomado, desde update().
        """
        wp = state.win_prob_home
        if wp is None or not state.inning:
            return
        track = e.win_prob_track
        if track:
            ultimo = track[-1]
            # El marcador cambiando SIEMPRE merece punto aunque la
            # probabilidad se mueva poco: es el momento que la gráfica
            # tiene que poder etiquetar.
            marcador_igual = (ultimo.away == state.away.runs and
                              ultimo.home == state.home.runs)
            if marcador_igual and abs(wp - ultimo.wp) < UMBRAL_WP:
                return
            if len(track) >= MAX_PUNTOS_WP:
                return
        track.append(WinProbPoint(
            inning=state.inning,
            is_top=bool(state.is_top_inning),
            away=state.away.runs,
            home=state.home.runs,
            wp=wp,
            at=time.time(),
        ))

    def win_prob_track(self, game_pk: int) -> list[dict]:
        """El recorrido completo, listo para servir."""
        with self._lock:
            e = self._entries.get(game_pk)
            return [p.as_dict() for p in e.win_prob_track] if e else []

    def drop(self, game_pk: int) -> None:
        """
        Suelta el GUMBO crudo pero conserva el estado reducido.

        Un feed completo ocupa cerca de un megabyte en memoria. Cuando un juego
        termina ya no vamos a aplicarle parches, así que el crudo no sirve para
        nada; el marcador final, que son 1.400 bytes, sí queremos conservarlo
        para seguir sirviéndolo.

        Antes de soltarlo se congela el DETALLE —relato, línea por entradas,
        boxscore, alineaciones— porque se proyecta del crudo y sin esto la
        pantalla de un juego recién terminado se quedaría vacía justo cuando
        más gente la abre. Son 42 KB en vez de un mega: 25 veces menos, y ya no
        va a cambiar.
        """
        with self._lock:
            e = self._entries.get(game_pk)
            if not e:
                return
            if e.raw is not None and e.detail is None:
                try:
                    e.detail = parse_game_detail(e.raw, e.game_id)
                except Exception:
                    # Que un detalle mal formado no impida liberar el megabyte.
                    e.detail = None
            e.raw = None
            # Cerrar el recorrido con el resultado real. Sin esto la gráfica de
            # un juego terminado acaba en el último estado simulado —un 97%—
            # en vez de en el 100% que de hecho ocurrió.
            st = e.state
            if st and st.status == "final" and e.win_prob_track:
                final = 1.0 if st.home.runs > st.away.runs else 0.0
                if e.win_prob_track[-1].wp != final:
                    e.win_prob_track.append(WinProbPoint(
                        inning=st.inning or 9, is_top=False,
                        away=st.away.runs, home=st.home.runs,
                        wp=final, at=time.time(),
                    ))

    # ── Lectura (la usan los manejadores HTTP) ────────────────────────────────

    def get(self, game_pk: int) -> Optional[LiveEntry]:
        with self._lock:
            return self._entries.get(game_pk)

    def get_state(self, game_pk: int) -> Optional[LiveGameState]:
        with self._lock:
            e = self._entries.get(game_pk)
            return e.state if e else None

    def get_detail(
        self, game_pk: int, plays_limit: Optional[int] = None
    ) -> Optional[LiveGameDetail]:
        """
        Detalle del juego, sin tocar la MLB API.

        Mientras hay crudo se proyecta al vuelo, para que el relato esté al día
        con el último sondeo. Cuando el juego terminó se sirve el congelado de
        drop(). `plays_limit` recorta a las N jugadas más recientes en los dos
        casos.
        """
        with self._lock:
            e = self._entries.get(game_pk)
            if e is None:
                return None
            raw, frozen, game_id = e.raw, e.detail, e.game_id

        if raw is not None:
            return parse_game_detail(raw, game_id, plays_limit=plays_limit)
        if frozen is None:
            return None
        if plays_limit is None or plays_limit >= frozen.plays_total:
            return frozen
        # Copia recortada: el congelado se comparte entre peticiones y no se
        # puede mutar.
        return frozen.model_copy(update={
            "plays": frozen.plays[:plays_limit],
            "plays_returned": min(plays_limit, frozen.plays_total),
        })

    def by_game_id(self, game_id: str) -> Optional[LiveEntry]:
        with self._lock:
            for e in self._entries.values():
                if e.game_id == game_id:
                    return e
            return None

    def states(self, only_live: bool = False) -> list[LiveGameState]:
        with self._lock:
            out = [e.state for e in self._entries.values() if e.state]
        if only_live:
            out = [s for s in out if s.is_live]
        # Los juegos en curso primero, después por hora de inicio.
        return sorted(out, key=lambda s: (not s.is_live, s.game_pk))

    def tracked(self) -> list[int]:
        with self._lock:
            return sorted(self._entries)

    def stats(self) -> dict[str, Any]:
        with self._lock:
            entries = list(self._entries.values())
        return {
            "tracked": len(entries),
            "live": sum(1 for e in entries if e.state and e.state.is_live),
            "final": sum(1 for e in entries if e.state and e.state.is_final),
            "polls": sum(e.poll_count for e in entries),
            "full_fetches": sum(e.full_fetches for e in entries),
            "patch_applications": sum(e.patch_applications for e in entries),
            "raw_documents_held": sum(1 for e in entries if e.raw is not None),
            "frozen_details": sum(1 for e in entries if e.detail is not None),
        }

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


# Instancia compartida por el poller y la API.
store = LiveStore()

__all__ = ["LiveStore", "LiveEntry", "store"]
