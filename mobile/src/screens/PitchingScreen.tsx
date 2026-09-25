import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchPitching } from '../api';
import { COLORS, FONTS } from '../constants';
import { useFichas } from '../navigation';
import { entradas } from '../formato';
import { PitchingRow } from '../types';
import EmptyState from '../components/EmptyState';
import TeamBadge from '../components/TeamBadge';

type SortKey = 'era' | 'whip' | 'strikeouts_per_nine' | 'strikeouts' | 'innings_pitched' | 'wins' | 'saves' | 'walks_per_nine';

interface SortOption {
  key: SortKey;
  label: string;
  fmt: (row: PitchingRow) => string;
  ascending: boolean;
}


const SORT_OPTIONS: SortOption[] = [
  { key: 'era',               label: 'ERA',  fmt: r => r.era?.toFixed(2)               ?? '—', ascending: true  },
  { key: 'whip',              label: 'WHIP', fmt: r => r.whip?.toFixed(2)              ?? '—', ascending: true  },
  { key: 'strikeouts_per_nine', label: 'K/9', fmt: r => r.strikeouts_per_nine?.toFixed(1) ?? '—', ascending: false },
  { key: 'strikeouts',        label: 'SO',   fmt: r => String(r.strikeouts),                    ascending: false },
  { key: 'innings_pitched',   label: 'IP',   fmt: r => entradas(r.innings_pitched),               ascending: false },
  { key: 'wins',              label: 'W',    fmt: r => String(r.wins),                          ascending: false },
  { key: 'saves',             label: 'SV',   fmt: r => String(r.saves),                         ascending: false },
  { key: 'walks_per_nine',    label: 'BB/9', fmt: r => r.walks_per_nine?.toFixed(1)  ?? '—', ascending: true  },
];

function SortChips({ active, onChange }: { active: SortKey; onChange: (k: SortKey) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={styles.chipsContent}
    >
      {SORT_OPTIONS.map(opt => {
        const isActive = opt.key === active;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.chip, isActive && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
              {opt.label} {isActive ? (opt.ascending ? '↑' : '↓') : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function PitcherRow({
  item,
  rank,
  sortOpt,
  onPress,
}: {
  item: PitchingRow;
  rank: number;
  sortOpt: SortOption;
  /** null cuando el jugador no está en el esquema de juego: no hay ficha. */
  onPress: (() => void) | null;
}) {
  return (
    // La fila abre la ficha. El slug llega en `player_id` porque /batting y
    // /pitching lo cruzan por mlb_id; si no hay, la fila queda quieta.
    <Pressable
      onPress={onPress ?? undefined}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Text style={styles.rank}>{rank}</Text>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.playerName} numberOfLines={1}>{item.player}</Text>
          <TeamBadge code={item.team_id} size={28} />
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statLabel}>IP </Text>
          <Text style={styles.statVal}>{entradas(item.innings_pitched)}</Text>
          <Text style={styles.dot}> · </Text>
          <Text style={styles.statLabel}>K </Text>
          <Text style={styles.statVal}>{item.strikeouts}</Text>
          <Text style={styles.dot}> · </Text>
          <Text style={styles.statLabel}>W </Text>
          <Text style={styles.statVal}>{item.wins}</Text>
          <Text style={styles.dot}> · </Text>
          <Text style={styles.statLabel}>SV </Text>
          <Text style={styles.statVal}>{item.saves}</Text>
        </View>
      </View>
      <View style={styles.primaryStat}>
        <Text style={styles.primaryVal}>{sortOpt.fmt(item)}</Text>
        <Text style={styles.primaryKey}>{sortOpt.label}</Text>
      </View>
    </Pressable>
  );
}

export default function PitchingScreen() {
  const nav = useFichas();
  const [data, setData] = useState<PitchingRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('era');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (key: SortKey, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const rows = await fetchPitching(undefined, key);
    setData(rows);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(sortKey); }, [load, sortKey]));

  const handleSort = (k: SortKey) => { setSortKey(k); load(k); };

  const sortOpt = SORT_OPTIONS.find(o => o.key === sortKey) ?? SORT_OPTIONS[0];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPage }}>
      <SortChips active={sortKey} onChange={handleSort} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : data.length === 0 ? (
        <EmptyState message="No hay datos de pitcheo." />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => item.player_id ?? `${item.player}-${i}`}
          renderItem={({ item, index }) => (
            <PitcherRow
              item={item}
              rank={index + 1}
              sortOpt={sortOpt}
              onPress={
                item.player_id
                  ? () => nav.push('Jugador', { playerId: item.player_id!, nombre: item.player })
                  : null
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(sortKey, true)} tintColor={COLORS.accent} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chipsScroll: { backgroundColor: COLORS.bgHeader, maxHeight: 52 },
  chipsContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  // Invertido, no teñido: con el acento igual al texto, un fondo tenue del
  // acento sería invisible. Relleno claro y texto oscuro.
  chipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent },
  chipLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  chipLabelActive: { color: COLORS.accentOn },
  rowPressed: { backgroundColor: COLORS.bgRaised },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.bgCard,
    gap: 10,
  },
  rank: { color: COLORS.textSecondary, fontSize: 13, width: 20, textAlign: 'center' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  playerName: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statLabel: { color: COLORS.textSecondary, fontSize: 12 },
  statVal: { color: COLORS.textSecondary, fontSize: 12 },
  // Separador en textFaint, no en `border`: los tokens de borde dan 1.4:1
  // y nunca son color de texto.
  dot: { color: COLORS.textFaint, fontSize: 12 },
  primaryStat: { alignItems: 'flex-end', minWidth: 58 },
  // Bebas Neue, sin fontWeight (ver FONTS).
  primaryVal: { color: COLORS.accent, fontSize: 28, fontFamily: FONTS.display, fontVariant: ['tabular-nums'] },
  primaryKey: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  sep: { height: 1, backgroundColor: COLORS.border },
});
