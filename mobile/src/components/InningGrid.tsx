import React, { useState } from 'react';
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
 * Va en la pantalla principal del juego, en su tarjeta (pedido de Arturo con
 * una captura de SofaScore, 6-oct): las columnas se reparten el ancho medido,
 * así las nueve entradas caben sin deslizar en un iPhone. Con entradas extra
 * las columnas no bajan de CELDA_MIN y el cuadro se desliza en horizontal.
 * La entrada en curso lleva su número en rojo, el de "EN VIVO".
 */

const CELDA_MIN = 20;
const CELDA_MAX = 32;
const EQUIPO = 52;
const TOTAL = 28;
const RELLENO = 12;

function Row({
  code,
  cells,
  totals,
  batting,
  celda,
  ultima = false,
}: {
  code: string | null;
  cells: (number | null)[];
  totals: [number, number, number];
  batting: boolean;
  celda: number;
  ultima?: boolean;
}) {
  return (
    <View style={[styles.row, ultima && styles.rowUltima]}>
      <View style={styles.teamCell}>
        {/* El triángulo marca quién batea, como en el marcador de la tarjeta. */}
        <Text style={styles.arrow}>{batting ? '▸' : ' '}</Text>
        <TeamBadge code={code ?? '—'} size={24} />
      </View>

      {cells.map((v, i) => (
        <Text key={i} style={[styles.cell, { width: celda }, v === null && styles.cellEmpty]}>
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
  const [ancho, setAncho] = useState(0);
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
  const enCurso = detail.status === 'live' ? last.num : null;

  // El ancho de cada columna sale del medido; hasta medirlo, el mínimo.
  const libre = ancho - 2 * RELLENO - EQUIPO - 3 * TOTAL;
  const celda = ancho
    ? Math.max(CELDA_MIN, Math.min(CELDA_MAX, Math.floor(libre / innings.length)))
    : CELDA_MIN;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={e => setAncho(e.nativeEvent.layout.width)}
    >
      <View style={styles.grid}>
        <View style={[styles.row, styles.headerRow]}>
          <View style={styles.teamCell} />
          {innings.map(i => (
            <Text
              key={i.num}
              style={[styles.cell, { width: celda }, styles.headText, i.num === enCurso && styles.headAhora]}
              accessibilityLabel={i.num === enCurso ? `Entrada ${i.num}, en curso` : undefined}
            >
              {i.num}
            </Text>
          ))}
          <Text style={[styles.total, styles.headText]}>R</Text>
          <Text style={[styles.total, styles.headText]}>H</Text>
          <Text style={[styles.total, styles.headText]}>E</Text>
        </View>

        <Row
          code={detail.away.team_code}
          cells={innings.map(i => i.away_runs)}
          totals={[detail.away.runs, detail.away.hits, detail.away.errors]}
          batting={awayBatting}
          celda={celda}
        />
        <Row
          code={detail.home.team_code}
          cells={innings.map(i => i.home_runs)}
          totals={[detail.home.runs, detail.home.hits, detail.home.errors]}
          batting={homeBatting}
          celda={celda}
          ultima
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { paddingVertical: 6, paddingHorizontal: RELLENO },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowUltima: { borderBottomWidth: 0 },
  headerRow: { borderBottomColor: COLORS.textSecondary },
  teamCell: { width: EQUIPO, flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { width: 10, color: COLORS.warning, fontSize: 11 },

  cell: {
    textAlign: 'center',
    color: COLORS.textSupport,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  cellEmpty: { color: COLORS.textFaint },
  headText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  headAhora: { color: COLORS.live },

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
