import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchStandings } from '../api';
import { COLORS } from '../constants';
import { StandingRow } from '../types';
import EmptyState from '../components/EmptyState';
import TeamBadge from '../components/TeamBadge';

const fmtPct = (v: number | null) =>
  v != null ? v.toFixed(3).replace(/^0/, '') : '—';
const fmtDiff = (v: number | null) => {
  if (v == null) return '—';
  return v > 0 ? `+${v}` : String(v);
};

function Header() {
  return (
    <View style={styles.headerRow}>
      <Text style={[styles.hCell, { width: 24 }]}> </Text>
      <Text style={[styles.hCell, { flex: 1 }]}>Equipo</Text>
      <Text style={[styles.hCell, styles.col]}>G</Text>
      <Text style={[styles.hCell, styles.col]}>P</Text>
      <Text style={[styles.hCell, styles.col]}>PCT</Text>
      <Text style={[styles.hCell, styles.col]}>GB</Text>
    </View>
  );
}

function TeamRow({ item, rank }: { item: StandingRow; rank: number }) {
  const diff = item.run_differential;
  const diffColor = diff == null ? COLORS.textSecondary
    : diff >= 0 ? '#4ade80' : '#f87171';

  return (
    <View style={styles.row}>
      <Text style={[styles.rank, { width: 24 }]}>{rank}</Text>
      <View style={styles.teamCell}>
        <TeamBadge code={item.team_id} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName} numberOfLines={1}>{item.team_name}</Text>
          {diff != null && (
            <Text style={[styles.diffLabel, { color: diffColor }]}>
              DCAR {fmtDiff(diff)}
            </Text>
          )}
        </View>
      </View>
      <Text style={[styles.statBold, styles.col]}>{item.wins}</Text>
      <Text style={[styles.statDim, styles.col]}>{item.losses}</Text>
      <Text style={[styles.statBold, styles.col]}>{fmtPct(item.win_loss_pct)}</Text>
      <Text style={[styles.statDim, styles.col]}>
        {item.games_back === '-' ? '—' : item.games_back}
      </Text>
    </View>
  );
}

export default function StandingsScreen() {
  const [data, setData] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const rows = await fetchStandings();
    const sorted = [...rows].sort((a, b) => (b.win_loss_pct ?? 0) - (a.win_loss_pct ?? 0));
    setData(sorted);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
      renderItem={({ item, index }) => <TeamRow item={item} rank={index + 1} />}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.accent} />
      }
      style={{ backgroundColor: COLORS.bgPage }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgPage },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
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
  col: { width: 46, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.bgCard,
  },
  rank: { color: COLORS.textSecondary, fontSize: 13 },
  teamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 4,
  },
  teamName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  diffLabel: { fontSize: 10, marginTop: 1 },
  statBold: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  statDim: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'right' },
  sep: { height: 1, backgroundColor: COLORS.border },
});
