"""
src/live/store.py — Caché volátil del estado en vivo.

Deliberadamente separada de SQLite. La base es la verdad histórica y se escribe
una vez por juego, cuando termina; esto otro cambia cada diez segundos, no
sobrevive a un reinicio y no debe: si el proceso se cae, el poller vuelve a
pedir el feed completo y reconstruye todo en un sondeo. Escribir esto en disco
solo produciría desgaste y la ilusión de durabilidad.

Guarda tres cosas por juego:
  - el documento GUMBO crudo, porque los parches se aplican SOBRE él
  - el LiveGameState ya reducido, que es lo que se sirve en la tarjeta
  - al terminar, el LiveGameDetail congelado, para que la pantalla del juego
    siga funcionando después de soltar el crudo

El acceso va bajo un lock porque el poller corre en su propio hilo y los
manejadores HTTP leen desde otro.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Optional

from src.live.detail import LiveGameDetail, parse_game_detail
from src.live.gumbo import LiveGameState


class LiveEntry:
    """Lo que sabemos de un juego que estamos siguiendo."""

    __slots__ = ("game_pk", "game_id", "raw", "timecode", "state", "detail",
                 "updated_at", "poll_count", "full_fetches", "patch_applications")

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
