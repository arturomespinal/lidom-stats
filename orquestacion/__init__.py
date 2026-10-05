"""
La orquestación del pipeline con Dagster.

    pip install -r requirements-orquestacion.txt
    dagster dev -m orquestacion          # desde la raíz del repo

Ver CLAUDE.md, "La orquestación con Dagster".
"""

from .definitions import defs

__all__ = ["defs"]
