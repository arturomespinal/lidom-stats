import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants';
import { LiveGameDetail } from '../types';
import TeamBadge from './TeamBadge';

/**
 * El cuadro clásico por entradas, con R-H-E al final.
 *
 * Una media entrada que no se jugó lleva GUION, no cero: el local que va
 * ganando no batea en la baja del 9na, y pintar un 0 ahí sería decir que
 * bateó y no anotó. El backend manda null justamente para poder distinguirlo.
 *
 * Va en un ScrollView horizontal: en entradas extra la fila crece y no hay
 * pantalla de teléfono que aguante quince columnas.
 */

const CELL = 26;
const TOTAL = 30;

function Row({
  code,
  runs,
  cells,
  totals,
  batting,
}: {
  code: string | null;
  runs: number;
  cells: (number | null)[];
  totals: [number, number, number];
  batting: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.teamCell}>
        {/* El triángulo marca quién batea, como en el marcador de la tarjeta. */}
        <Text style={styles.arrow}>{batting ? '▸' : ' '}</Text>
        <TeamBadge code={code ?? '—'} size={24} />
      </View>

      {cells.map((v, i) => (
        <Text key={i} style={[styles.cell, v === null && styles.cellEmpty]}>
          {v === null ? '·' : v}
        </Text>
      ))}

      <Text style={[styles.total, styles.totalRuns]}>{totals[0]}</Text>
      <Text style={styles.total}>{totals[1]}</Text>
      <Text style={styles.total}>{totals[2]}</Text>
    </View>
  );
}

export default function InningGrid({ detail }: { detail: LiveGameDetail }) {
  // El backend solo manda las entradas JUGADAS, así que en el 2do el cuadro
  // salía con dos columnas y media pantalla vacía. Un marcador de béisbol
  // enseña las nueve desde el primer lanzamiento: las que faltan van en
  // blanco, y eso también dice cuánto queda de juego.
  const jugadas = detail.innings;
  const minimas = Math.max(detail.scheduled_innings, jugadas.length);
  const innings = Array.from({ length: minimas }, (_, i) =>
    jugadas[i] ?? {
      num: i + 1,
      ordinal_es: null,
      away_runs: null,
      home_runs: null,
      away_hits: 0,
      home_hits: 0,
    },
  );

  if (jugadas.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>El juego no ha comenzado.</Text>
      </View>
    );
  }

  // Quién batea ahora: la última entrada JUGADA con la baja sin jugar. Se mira
  // sobre `jugadas` y no sobre `innings`, que ahora lleva relleno en blanco.
  const last = jugadas[jugadas.length - 1];
  const homeBatting =
    detail.status === 'live' && last.away_runs !== null && last.home_runs === null;
  const awayBatting = detail.status === 'live' && !homeBatting;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.grid}>
        <View style={[styles.row, styles.headerRow]}>
          <View style={styles.teamCell} />
          {innings.map(i => (
            <Text key={i.num} style={[styles.cell, styles.headText]}>
              {i.num}
            </Text>
          ))}
          <Text style={[styles.total, styles.headText]}>R</Text>
          <Text style={[styles.total, styles.headText]}>H</Text>
          <Text style={[styles.total, styles.headText]}>E</Text>
        </View>

        <Row
          code={detail.away.team_code}
          runs={detail.away.runs}
          cells={innings.map(i => i.away_runs)}
          totals={[detail.away.runs, detail.away.hits, detail.away.errors]}
          batting={awayBatting}
        />
        <Row
          code={detail.home.team_code}
          runs={detail.home.runs}
          cells={innings.map(i => i.home_runs)}
          totals={[detail.home.runs, detail.home.hits, detail.home.errors]}
          batting={homeBatting}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { paddingVertical: 14, paddingHorizontal: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerRow: { borderBottomColor: COLORS.textSecondary },
  teamCell: { width: 54, flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { width: 10, color: COLORS.warning, fontSize: 11 },

  cell: {
    width: CELL,
    textAlign: 'center',
    color: COLORS.textSupport,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  cellEmpty: { color: COLORS.border },
  headText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  total: {
    width: TOTAL,
    textAlign: 'center',
    color: COLORS.textSupport,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  totalRuns: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 15 },

  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
});
