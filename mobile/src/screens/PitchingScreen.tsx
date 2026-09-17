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
import { fetchPitching } from '../api';
import { COLORS } from '../constants';
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

const fmtIP = (v: number | null) => {
  if (v == null) return '—';
  const w = Math.floor(v);
  const t = Math.round((v - w) * 3);
  return t === 0 ? `${w}.0` : `${w}.${t}`;
};

const SORT_OPTIONS: SortOption[] = [
  { key: 'era',               label: 'ERA',  fmt: r => r.era?.toFixed(2)               ?? '—', ascending: true  },
  { key: 'whip',              label: 'WHIP', fmt: r => r.whip?.toFixed(2)              ?? '—', ascending: true  },
  { key: 'strikeouts_per_nine', label: 'K/9', fmt: r => r.strikeouts_per_nine?.toFixed(1) ?? '—', ascending: false },
  { key: 'strikeouts',        label: 'SO',   fmt: r => String(r.strikeouts),                    ascending: false },
  { key: 'innings_pitched',   label: 'IP',   fmt: r => fmtIP(r.innings_pitched),               ascending: false },
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

function PitcherRow({ item, rank, sortOpt }: { item: PitchingRow; rank: number; sortOpt: SortOption }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rank}>{rank}</Text>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.playerName} numberOfLines={1}>{item.player}</Text>
          <TeamBadge code={item.team_id} size={28} />
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statLabel}>IP </Text>
          <Text style={styles.statVal}>{fmtIP(item.innings_pitched)}</Text>
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
    </View>
  );
}

export default function PitchingScreen() {
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
          keyExtractor={(item, i) => `${item.player}-${i}`}
          renderItem={({ item, index }) => (
            <PitcherRow item={item} rank={index + 1} sortOpt={sortOpt} />
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
  chipActive: { borderColor: COLORS.accent, backgroundColor: '#58a6ff20' },
  chipLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  chipLabelActive: { color: COLORS.accent },
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
