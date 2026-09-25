import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchStandings } from '../api';
import { COLORS, TEAM_STYLES } from '../constants';
import { useFichas } from '../navigation';
import { StandingRow } from '../types';
import EmptyState from '../components/EmptyState';
import TeamBadge from '../components/TeamBadge';

const POS = COLORS.positive;
const NEG = COLORS.negative;
const EVEN = COLORS.warning;

const fmtPct = (v: number | null) =>
  v != null ? v.toFixed(3).replace(/^0/, '') : '—';

const fmtDiff = (v: number | null) => {
  if (v == null) return '—';
  return v > 0 ? `+${v}` : String(v);
};

/** La distancia a la línea se lee con signo: +2.0 de colchón, −1.5 de atraso. */
const fmtClas = (v: number | null) => {
  if (v == null) return '—';
  if (v === 0) return '0.0';
  // Signo menos tipográfico (U+2212), no el guion del teclado: en una columna
  // de números alineados a la derecha el guion se ve como un punto suelto.
  return v > 0 ? `+${v.toFixed(1)}` : `−${Math.abs(v).toFixed(1)}`;
};

const clasColor = (v: number | null) => {
  if (v == null) return COLORS.textSecondary;
  if (v > 0) return POS;
  if (v < 0) return NEG;
  return EVEN;
};

function Header() {
  return (
    <View style={styles.headerRow}>
      <Text style={[styles.hCell, styles.rankCol]}> </Text>
      <Text style={[styles.hCell, styles.teamHeader]}>Equipo</Text>
      <Text style={[styles.hCell, styles.colNarrow]}>G</Text>
      <Text style={[styles.hCell, styles.colNarrow]}>P</Text>
      <Text style={[styles.hCell, styles.colWide]}>PCT</Text>
      <Text style={[styles.hCell, styles.colMid]}>GB</Text>
      <Text style={[styles.hCell, styles.colWide]}>CLAS</Text>
    </View>
  );
}

/**
 * El corte del round robin. Es la línea más significativa de la tabla: en una
 * liga de seis donde clasifican cuatro, estar del lado correcto es todo lo que
 * se juega la temporada regular. Antes no existía visualmente y la tabla se
 * leía como una lista plana de seis equipos.
 */
function Cutline() {
  return (
    <View style={styles.cutline}>
      <View style={styles.cutlineBar} />
      <Text style={styles.cutlineLabel}>Clasifican al round robin</Text>
      <View style={styles.cutlineBar} />
    </View>
  );
}

function TeamRow({
  item,
  rank,
  onPress,
}: {
  item: StandingRow;
  rank: number;
  onPress: () => void;
}) {
  const diff = item.run_differential;
  const diffColor =
    diff == null ? COLORS.textSecondary : diff >= 0 ? POS : NEG;

  // El color oficial del equipo como borde estructural de la fila, no solo
  // dentro del cuadrito de las siglas. Es lo único que distingue una tabla de
  // LIDOM de cualquier otra tabla oscura.
  const accent = TEAM_STYLES[item.team_id]?.primary ?? COLORS.border;

  return (
    // La fila entera abre la ficha del equipo. Es la entrada natural: quien
    // mira la tabla y ve a su equipo quinto quiere saber por qué.
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !item.playoff_spot && styles.rowOut,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${item.short_name ?? item.team_name}, ${item.wins} ganados, ${item.losses} perdidos. Abrir equipo`}
    >
      <View style={[styles.teamStripe, { backgroundColor: accent }]} />

      <Text
        style={[
          styles.rankCol,
          item.playoff_spot ? styles.rankIn : styles.rankOut,
        ]}
      >
        {rank}
      </Text>

      <View style={styles.teamCell}>
        <TeamBadge code={item.team_id} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName} numberOfLines={1}>
            {item.short_name ?? item.team_name}
          </Text>
          {diff != null && (
            <Text style={[styles.diffLabel, { color: diffColor }]}>
              DCAR {fmtDiff(diff)}
            </Text>
          )}
        </View>
      </View>

      <Text style={[styles.statBold, styles.colNarrow]}>{item.wins}</Text>
      <Text style={[styles.statDim, styles.colNarrow]}>{item.losses}</Text>
      <Text style={[styles.statBold, styles.colWide]}>
        {fmtPct(item.win_loss_pct)}
      </Text>
      <Text style={[styles.statDim, styles.colMid]}>
        {item.games_back === '-' ? '—' : item.games_back}
      </Text>
      <Text
        style={[styles.statClas, styles.colWide, { color: clasColor(item.playoff_games) }]}
      >
        {fmtClas(item.playoff_games)}
      </Text>
    </Pressable>
  );
}

export default function StandingsScreen() {
  const nav = useFichas();
  const [data, setData] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    // NO se reordena aquí. La API ya ordena por PCT y calcula playoff_spot
    // sobre ESE orden; reordenar en el cliente desincronizaría la bandera de
    // la posición mostrada y el corte caería en el equipo equivocado.
    setData(await fetchStandings());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Índice del último equipo dentro. Si ninguno queda fuera da -2 y el corte
  // simplemente no se dibuja.
  const cutIndex = useMemo(
    () => data.findIndex(r => !r.playoff_spot) - 1,
    [data],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (data.length === 0) return <EmptyState />;

  return (
    <FlatList
      data={data}
      keyExtractor={item => item.team_id}
      ListHeaderComponent={Header}
      renderItem={({ item, index }) => (
        <>
          <TeamRow
            item={item}
            rank={index + 1}
            onPress={() => nav.push('Equipo', { code: item.team_id })}
          />
          {index === cutIndex && <Cutline />}
        </>
      )}
      ListFooterComponent={<Legend />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={COLORS.accent}
        />
      }
      style={{ backgroundColor: COLORS.bgPage }}
    />
  );
}

/** Una columna nueva sin explicación es una columna que nadie usa. */
function Legend() {
  return (
    <View style={styles.legend}>
      <Text style={styles.legendText}>
        <Text style={styles.legendKey}>CLAS</Text> — juegos de ventaja sobre el
        primer equipo fuera, o de atraso contra el último clasificado.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgPage,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.bgHeader,
  },
  hCell: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'right',
  },
  teamHeader: { flex: 1, textAlign: 'left', marginLeft: 8 },

  // Anchos ajustados para que cinco columnas de números y el nombre corto
  // quepan en un iPhone sin scroll horizontal.
  rankCol: { width: 18, textAlign: 'center' },
  colNarrow: { width: 28, textAlign: 'right' },
  colMid: { width: 38, textAlign: 'right' },
  colWide: { width: 48, textAlign: 'right' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  // Quien está fuera se hunde un tono contra el fondo de la página.
  rowOut: { backgroundColor: COLORS.bgPage },
  rowPressed: { backgroundColor: COLORS.bgRaised },
  teamStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  rankIn: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },
  rankOut: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '400' },

  teamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
    marginRight: 4,
  },
  teamName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  diffLabel: { fontSize: 10, marginTop: 1 },

  statBold: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statDim: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  statClas: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  cutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: COLORS.bgPage,
  },
  cutlineBar: { flex: 1, height: 1, backgroundColor: `${POS}66` },
  cutlineLabel: {
    color: POS,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  legend: { paddingHorizontal: 16, paddingVertical: 14 },
  legendText: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
  legendKey: { color: COLORS.textPrimary, fontWeight: '700' },
});
