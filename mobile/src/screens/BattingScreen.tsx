import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchBatting } from '../api';
import { COLORS } from '../constants';
import { BattingRow } from '../types';
import EmptyState from '../components/EmptyState';
import TeamBadge from '../components/TeamBadge';

type SortKey = 'ops' | 'batting_avg' | 'on_base_pct' | 'slugging_pct' | 'home_runs' | 'rbi' | 'hits' | 'stolen_bases';

interface SortOption {
  key: SortKey;
  label: string;
  fmt: (row: BattingRow) => string;
  sublabel: string;
}

const SORT_OPTIONS: SortOption[] = [
  { key: 'ops',          label: 'OPS',  fmt: r => r.ops?.toFixed(3)                          ?? '—', sublabel: 'On-base + Slugging' },
  { key: 'batting_avg',  label: 'AVG',  fmt: r => r.batting_avg?.toFixed(3).replace(/^0/,'') ?? '—', sublabel: 'Promedio de bateo' },
  { key: 'on_base_pct',  label: 'OBP',  fmt: r => r.on_base_pct?.toFixed(3).replace(/^0/,'') ?? '—', sublabel: 'On-base %' },
  { key: 'slugging_pct', label: 'SLG',  fmt: r => r.slugging_pct?.toFixed(3).replace(/^0/,'')  ?? '—', sublabel: 'Slugging %' },
  { key: 'home_runs',    label: 'HR',   fmt: r => String(r.home_runs),                               sublabel: 'Home runs' },
  { key: 'rbi',          label: 'RBI',  fmt: r => String(r.rbi),                                     sublabel: 'Carreras impulsadas' },
  { key: 'hits',         label: 'H',    fmt: r => String(r.hits),                                    sublabel: 'Hits' },
  { key: 'stolen_bases', label: 'SB',   fmt: r => String(r.stolen_bases),                            sublabel: 'Bases robadas' },
];

const fmtAvg = (v: number | null) => v?.toFixed(3).replace(/^0/, '') ?? '—';

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
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function PlayerRow({ item, rank, sortOpt }: { item: BattingRow; rank: number; sortOpt: SortOption }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rank}>{rank}</Text>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.playerName} numberOfLines={1}>{item.player}</Text>
          <TeamBadge code={item.team_id} size={28} />
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statLabel}>AVG </Text>
          <Text style={styles.statVal}>{fmtAvg(item.batting_avg)}</Text>
          <Text style={styles.dot}> · </Text>
          <Text style={styles.statLabel}>HR </Text>
          <Text style={styles.statVal}>{item.home_runs}</Text>
          <Text style={styles.dot}> · </Text>
          <Text style={styles.statLabel}>RBI </Text>
          <Text style={styles.statVal}>{item.rbi}</Text>
          <Text style={styles.dot}> · </Text>
          <Text style={styles.statLabel}>JJ </Text>
          <Text style={styles.statVal}>{item.games}</Text>
        </View>
      </View>
      <View style={styles.primaryStat}>
        <Text style={styles.primaryVal}>{sortOpt.fmt(item)}</Text>
        <Text style={styles.primaryKey}>{sortOpt.label}</Text>
      </View>
    </View>
  );
}

export default function BattingScreen() {
  const [data, setData] = useState<BattingRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('ops');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (key: SortKey, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const rows = await fetchBatting(undefined, key);
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
        <EmptyState message="No hay datos de bateo." />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => `${item.player}-${i}`}
          renderItem={({ item, index }) => (
            <PlayerRow item={item} rank={index + 1} sortOpt={sortOpt} />
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
  dot: { color: COLORS.border, fontSize: 12 },
  primaryStat: { alignItems: 'flex-end', minWidth: 58 },
  primaryVal: { color: COLORS.accent, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  primaryKey: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  sep: { height: 1, backgroundColor: COLORS.border },
});
