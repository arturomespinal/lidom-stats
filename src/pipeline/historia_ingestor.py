"""
src/pipeline/historia_ingestor.py — DIGIMETRICS → capa histórica (hist_*).

Por cada temporada:
    1. Sus etapas (/Equipo/SelectEtapasTemporada). Lista vacía = no se jugó
       (1961, 1962 y 1965) y se salta.
    2. El bateo de la PRIMERA etapa (la serie regular) de los nueve ids de
       equipo. Los que vuelven vacíos no jugaron ese año (de 1951 a 1982 solo
       había cuatro equipos) y no se les pide nada más. Así una temporada de
       cuatro equipos cuesta ~25 pedidos en vez de 54.
    3. Para los equipos que jugaron: pitcheo de la regular, y bateo y pitcheo
       de cada etapa de postemporada.
    4. Se reemplaza la temporada entera en una transacción: se borran sus
       filas y se insertan las nuevas. Idempotente, y si la fuente corrige
       una línea (o quita un jugador mal asignado) la base queda igual que
       la fuente, sin restos.

Las páginas quedan en la caché del cliente, así que repetir la ingesta, o
reprocesar después de tocar el parser, no vuelve a pedir nada al servidor.

Las temporadas desde 2020-21 no se piden: casi todas sus páginas traen las
fotos de los jugadores en base64 (5-11 MB cada una; 20-45 MB desde 2024-25), y
para esos años ya está la MLB API. Si aun así una página de una temporada
pedida pasa del tope, esa temporada entera se salta con un aviso y la ingesta
sigue con la próxima: nunca se guarda una temporada a medias.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

from sqlalchemy import delete
from sqlalchemy.orm import Session

from src.clients.digimetrics import DigimetricsClient, PaginaDemasiadoPesada
from src.constants import DEFAULT_DB_URL, DIGIMETRICS_EQUIPOS
from src.models.database import init_db
from src.models.hist_models import (
    HistBateo,
    HistEquipoTemporada,
    HistEtapa,
    HistJugador,
    HistPitcheo,
    etiqueta_historica,
)
from src.scrapers.digimetrics import (
    TablaJugadores,
    parse_bateo_equipo,
    parse_etapas,
    parse_pitcheo_equipo,
)
from src.utils.logger import logger

PRIMERA_TEMPORADA = 1951
# La última cuyas páginas pasan todas por debajo del tope (medido el 30-sep:
# en 2020-21 el bateo de Escogido pesa 6,4 MB y en 2023-24 el de Águilas, 11).
# Ver DIGIMETRICS_MAX_BYTES.
ULTIMA_TEMPORADA = 2019


class HistoriaIngestor:
    def __init__(
        self,
        db_url: str = DEFAULT_DB_URL,
        client: Optional[DigimetricsClient] = None,
        equipos: dict[str, str] = DIGIMETRICS_EQUIPOS,
    ):
        # init_db crea las tablas hist_* si faltan (y recrea las vistas, que
        # no cuesta nada). Es idempotente.
        self.engine = init_db(db_url)
        self.client = client or DigimetricsClient()
        self.equipos = equipos

    # ─── Pedidos ────────────────────────────────────────────────────────────

    def _etapas(self, temporada: int) -> list[tuple[str, str]]:
        return parse_etapas(
            self.client.post_json("/Equipo/SelectEtapasTemporada", {"idTemporada": temporada})
        )

    def _bateo(self, temporada: int, etapa: str, id_equipo: str) -> TablaJugadores:
        return parse_bateo_equipo(self.client.post_html(
            "/Equipo/EquipoBateo",
            # manoLanza vacío = contra todos los lanzadores (el split por mano
            # solo existe en los años recientes).
            {"idTemporada": temporada, "idEtapa": etapa, "idEquipo": id_equipo, "manoLanza": ""},
        ))

    def _pitcheo(self, temporada: int, etapa: str, id_equipo: str) -> TablaJugadores:
        return parse_pitcheo_equipo(self.client.post_html(
            "/Equipo/EquipoLanzamiento",
            {"idTemporada": temporada, "idEtapa": etapa, "idEquipo": id_equipo},
        ))

    # ─── Una temporada ──────────────────────────────────────────────────────

    def ingest_temporada(self, temporada: int) -> dict[str, Any]:
        if temporada > ULTIMA_TEMPORADA:
            raise ValueError(
                f"{temporada}: desde 2020-21 las páginas de DIGIMETRICS pesan 5-45 MB "
                "(fotos en base64) y esos años ya vienen de la MLB API"
            )
        resumen: dict[str, Any] = {
            "temporada": temporada,
            "season_id": etiqueta_historica(temporada),
            "etapas": [],
            "equipos": [],
            "bateo": 0,
            "pitcheo": 0,
            "discrepancias": [],
            "avisos": [],
        }
        etapas = self._etapas(temporada)
        resumen["etapas"] = [e for e, _ in etapas]
        if not etapas:
            logger.info(f"{temporada}: la fuente no tiene esa temporada (no se jugó)")
            return resumen

        regular = etapas[0][0]
        paginas: list[tuple[str, str, str, TablaJugadores]] = []  # (tipo, etapa, id_equipo, tabla)

        activos = []
        for id_equipo in self.equipos:
            tabla = self._bateo(temporada, regular, id_equipo)
            if tabla.filas:
                activos.append(id_equipo)
                paginas.append(("bateo", regular, id_equipo, tabla))
        for id_equipo in activos:
            paginas.append(("pitcheo", regular, id_equipo, self._pitcheo(temporada, regular, id_equipo)))
            for etapa, _ in etapas[1:]:
                paginas.append(("bateo", etapa, id_equipo, self._bateo(temporada, etapa, id_equipo)))
                paginas.append(("pitcheo", etapa, id_equipo, self._pitcheo(temporada, etapa, id_equipo)))

        for tipo, etapa, id_equipo, tabla in paginas:
            donde = f"{temporada} {etapa} {id_equipo} {tipo}"
            resumen["discrepancias"] += [f"{donde}: {d}" for d in tabla.discrepancias]
            resumen["avisos"] += [f"{donde}: {a}" for a in tabla.avisos]

        self._guardar(temporada, etapas, paginas, resumen)
        resumen["equipos"] = [self.equipos[i] for i in activos]
        return resumen

    def _guardar(self, temporada, etapas, paginas, resumen) -> None:
        season_id = etiqueta_historica(temporada)
        with Session(self.engine) as s, s.begin():
            # Reemplazo completo de la temporada (ver docstring del módulo).
            for modelo in (HistBateo, HistPitcheo, HistEtapa, HistEquipoTemporada):
                s.execute(delete(modelo).where(modelo.temporada == temporada))

            for orden, (etapa, descripcion) in enumerate(etapas):
                s.add(HistEtapa(temporada=temporada, etapa=etapa, descripcion=descripcion, orden=orden))

            nombres: dict[str, Optional[str]] = {}
            jugadores: dict[int, str] = {}
            for tipo, etapa, id_equipo, tabla in paginas:
                modelo = HistBateo if tipo == "bateo" else HistPitcheo
                if tipo == "pitcheo" and tabla.nombre_equipo and not nombres.get(id_equipo):
                    nombres[id_equipo] = tabla.nombre_equipo
                nombres.setdefault(id_equipo, None)
                for fila in tabla.filas:
                    jugadores[fila["id_miembro"]] = fila["nombre"]
                    datos = {k: v for k, v in fila.items() if k != "nombre"}
                    s.add(modelo(
                        temporada=temporada,
                        etapa=etapa,
                        id_equipo=id_equipo,
                        season_id=season_id,
                        team_code=self.equipos[id_equipo],
                        **datos,
                    ))
                    resumen[tipo] += 1

            for id_equipo, nombre in nombres.items():
                s.add(HistEquipoTemporada(
                    temporada=temporada,
                    id_equipo=id_equipo,
                    team_code=self.equipos[id_equipo],
                    nombre=nombre,
                ))
            # merge: el jugador puede venir de otra temporada ya cargada. Se
            # queda el nombre más reciente que dio la fuente.
            for id_miembro, nombre in jugadores.items():
                s.merge(HistJugador(id_miembro=id_miembro, nombre=nombre))

    # ─── Un rango ───────────────────────────────────────────────────────────

    def ingest(self, temporadas: Iterable[int]) -> dict[str, Any]:
        total: dict[str, Any] = {
            "temporadas": 0,
            "no_jugadas": [],
            "bateo": 0,
            "pitcheo": 0,
            "discrepancias": [],
            "avisos": [],
            "omitidas_por_peso": [],
        }
        for temporada in temporadas:
            try:
                r = self.ingest_temporada(temporada)
            except PaginaDemasiadoPesada as e:
                # La excepción salta antes de _guardar(): de esa temporada no
                # se escribe nada, ni siquiera lo que ya se había bajado.
                logger.warning(f"{etiqueta_historica(temporada)} se salta entera: {e}")
                total["omitidas_por_peso"].append(temporada)
                continue
            if not r["etapas"]:
                total["no_jugadas"].append(temporada)
                continue
            total["temporadas"] += 1
            total["bateo"] += r["bateo"]
            total["pitcheo"] += r["pitcheo"]
            total["discrepancias"] += r["discrepancias"]
            total["avisos"] += r["avisos"]
            logger.info(
                f"{r['season_id']}: {len(r['equipos'])} equipos, etapas {','.join(r['etapas'])}, "
                f"{r['bateo']} líneas de bateo y {r['pitcheo']} de pitcheo"
                + (f" — {len(r['discrepancias'])} discrepancias" if r["discrepancias"] else "")
            )
        total["pedidos_red"] = self.client.pedidos_red
        total["pedidos_cache"] = self.client.pedidos_cache
        return total
