# analitica

La capa analítica de Deportiv: dbt sobre DuckDB, leyendo la base exportada a
Parquet. Ver "La capa analítica (dbt)" en `CLAUDE.md`.

```bash
pip install -r requirements-analitica.txt     # desde la raíz del repo
python main.py exportar-parquet               # data/parquet/<tabla>.parquet
cd analitica
dbt build                                     # modelos y pruebas → data/analitica.duckdb
```

Si `dbt` no está en el PATH (Python de la Microsoft Store):
`python -m dbt.cli.main build`.

| Carpeta | Qué hay |
|---------|---------|
| `models/sources.yml` | Las tablas exportadas, incluidas las reglas de Python (mínimos, categorías, corte) |
| `models/staging/` | Las líneas de cada fuente con nombres comunes. Efímeros: no quedan en la base |
| `models/marts/` | Temporadas y carreras por persona, `dim_personas` y `mejores_temporadas` |
| `macros/tasas.sql` | Las tasas recompuestas de conteos sumados, con el redondeo de `src/historia.py` |
| `tests/` | Las pruebas singulares; las genéricas están en `models/marts/schema.yml` |

Para mirar el resultado:

```python
import duckdb
con = duckdb.connect("data/analitica.duckdb", read_only=True)
con.sql("SELECT puesto, nombre, season_id, valor FROM mejores_temporadas WHERE stat = 'hr' ORDER BY puesto")
```
