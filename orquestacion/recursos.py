"""
orquestacion/recursos.py — La base de datos como recurso de Dagster.

Un recurso y no una ruta repetida en cada asset: así la suite le pasa una base
temporal y la PC o el servidor la de verdad, sin tocar los assets.
"""

import sqlite3

from dagster import ConfigurableResource
from sqlalchemy.engine import Engine

# Registrar las tablas planas y la capa histórica en Base.metadata antes de
# init_db(), igual que main.py: sin esto init_db() no las crea.
from src.models import flat_models, hist_models  # noqa: F401
from src.models.database import init_db
from src.validacion import conectar


class BaseDatos(ConfigurableResource):
    """La base del proyecto. `url` en formato SQLAlchemy (`sqlite:///…`)."""

    url: str

    def preparar(self) -> Engine:
        """Crea las tablas que falten y recrea las vistas (regla 5 de
        CLAUDE.md). Es lo primero que hace cada ingesta."""
        return init_db(self.url)

    def leer(self) -> sqlite3.Connection:
        """Conexión de solo lectura para las comprobaciones. Quien la abre la
        cierra (`contextlib.closing`)."""
        return conectar(self.url)
