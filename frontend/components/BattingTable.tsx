"use client";

import TablaLideres, { type ColumnaLideres } from "@/components/TablaLideres";
import { BattingRow } from "@/lib/types";

/**
 * Promedios al modo del béisbol: tres cifras y sin el cero de delante
 * (".368"), también el OPS (".904"; "1.195" cuando pasa de uno). El OPS
 * salía como "0.904" al lado de un ".368": dos formas en la misma fila.
 */
const tasa = (v: number | null) => (v != null ? v.toFixed(3).replace(/^0(?=\.)/, "") : "—");

const COLUMNAS: ColumnaLideres<BattingRow>[] = [
  { key: "batting_avg", label: "AVG", title: "Promedio de bateo", fmt: tasa },
  { key: "on_base_pct", label: "OBP", title: "Porcentaje de embasado", fmt: tasa },
  { key: "slugging_pct", label: "SLG", title: "Slugging", fmt: tasa },
  { key: "ops", label: "OPS", title: "Embasado más slugging", fmt: tasa },
  { key: "home_runs", label: "HR", title: "Jonrones" },
  { key: "rbi", label: "CI", title: "Carreras impulsadas" },
  { key: "hits", label: "H", title: "Hits" },
  { key: "stolen_bases", label: "BR", title: "Bases robadas" },
  { key: "plate_appearances", label: "AP", title: "Apariciones al plato" },
];

export default function BattingTable({ data, season }: { data: BattingRow[]; season?: string }) {
  return <TablaLideres data={data} columnas={COLUMNAS} inicial="ops" titulo="Jugador" temporada={season} />;
}
