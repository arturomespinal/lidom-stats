"use client";

import TablaLideres, { type ColumnaLideres } from "@/components/TablaLideres";
import { PitchingRow } from "@/lib/types";
import { entradas } from "@/lib/formato";

const dos = (v: number | null) => (v != null ? v.toFixed(2) : "—");

const COLUMNAS: ColumnaLideres<PitchingRow>[] = [
  { key: "era", label: "EFE", title: "Efectividad (menos es mejor)", asc: true, fmt: dos },
  { key: "whip", label: "WHIP", title: "Hits y boletos por entrada (menos es mejor)", asc: true, fmt: dos },
  // Notación de béisbol: después del punto van los outs (36.1), no décimas.
  { key: "innings_pitched", label: "IP", title: "Entradas lanzadas", fmt: (v) => (v != null ? entradas(v) : "—") },
  { key: "strikeouts", label: "K", title: "Ponches" },
  { key: "strikeouts_per_nine", label: "K/9", title: "Ponches por nueve entradas", fmt: dos },
  { key: "walks_per_nine", label: "BB/9", title: "Boletos por nueve entradas (menos es mejor)", asc: true, fmt: dos },
  { key: "wins", label: "G", title: "Ganados" },
  { key: "saves", label: "SV", title: "Salvados" },
];

export default function PitchingTable({ data, season }: { data: PitchingRow[]; season?: string }) {
  return (
    <TablaLideres
      data={data}
      columnas={COLUMNAS}
      inicial="era"
      titulo="Lanzador"
      temporada={season}
      extra={{ label: "JI", title: "Juegos iniciados", corto: "JI", valor: (f) => f.games_started }}
    />
  );
}
