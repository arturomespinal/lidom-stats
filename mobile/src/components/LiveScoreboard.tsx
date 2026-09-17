import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants';
import { LiveGameState, LiveTeamLine } from '../types';
import BaseDiamond from './BaseDiamond';
import TeamBadge from './TeamBadge';

/* El punto rojo que late junto a "EN VIVO". Animated corre en el hilo nativo
   con useNativeDriver, así que no compite con el sondeo ni con el scroll. */
function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
}

function StatusPill({ state }: { state: LiveGameState }) {
  if (state.status === 'live') {
    return (
      <View style={[styles.pill, styles.pillLive]}>
        <PulsingDot />
        <Text style={styles.pillLiveText}>EN VIVO</Text>
      </View>
    );
  }
  if (state.status === 'final') {
    const extra =
      state.inning && state.inning !== state.scheduled_innings ? ` (${state.inning})` : '';
    return (
      <View style={[styles.pill, styles.pillFinal]}>
        <Text style={styles.pillFinalText}>FINAL{extra}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pill, styles.pillPreview]}>
      <Text style={styles.pillPreviewText}>
        {state.detailed_status || 'PREVIA'}
      </Text>
    </View>
  );
}

function TeamRow({
  team,
  batting,
  won,
}: {
  team: LiveTeamLine;
  batting: boolean;
  won: boolean;
}) {
  return (
    <View style={styles.teamRow}>
      {/* La flecha ocupa su ancho siempre, para que las dos filas queden
          alineadas aunque nadie esté bateando. */}
      <Text style={styles.battingArrow}>{batting ? '▸' : ''}</Text>
      <TeamBadge code={team.team_code} size={32} />
      <Text
        style={[styles.teamName, won && styles.teamNameWon]}
        numberOfLines={1}
      >
        {team.team_name}
      </Text>
      <Text style={[styles.runs, won && styles.runsWon]}>{team.runs}</Text>
      <Text style={styles.minor}>{team.hits}</Text>
      <Text style={styles.minor}>{team.errors}</Text>
    </View>
  );
}

function LineScore({ state }: { state: LiveGameState }) {
  const cell = (v: number | null) => (v === null ? '-' : String(v));

  const row = (team: LiveTeamLine, pick: (i: LiveGameState['line_score'][0]) => number | null) => (
    <View style={styles.lsRow}>
      <Text style={styles.lsCode}>{team.team_code}</Text>
      {state.line_score.map(i => (
        <Text key={i.inning} style={styles.lsCell}>
          {cell(pick(i))}
        </Text>
      ))}
      <Text style={[styles.lsCell, styles.lsTotal]}>{team.runs}</Text>
      <Text style={styles.lsCell}>{team.hits}</Text>
      <Text style={styles.lsCell}>{team.errors}</Text>
    </View>
  );

  return (
    <View style={styles.lineScore}>
      <View style={styles.lsRow}>
        <Text style={styles.lsCode} />
        {state.line_score.map(i => (
          <Text key={i.inning} style={[styles.lsCell, styles.lsHead]}>
            {i.inning}
          </Text>
        ))}
        <Text style={[styles.lsCell, styles.lsHead, styles.lsTotal]}>R</Text>
        <Text style={[styles.lsCell, styles.lsHead]}>H</Text>
        <Text style={[styles.lsCell, styles.lsHead]}>E</Text>
      </View>
      {row(state.away, i => i.away_runs)}
      {row(state.home, i => i.home_runs)}
    </View>
  );
}

function Situation({ state }: { state: LiveGameState }) {
  return (
    <View style={styles.situation}>
      <BaseDiamond runners={state.runners} />

      <View style={styles.counters}>
        <View style={styles.counterRow}>
          <Text style={styles.counterLabel}>OUTS</Text>
          <View style={styles.outs}>
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={[styles.out, i < state.outs && styles.outFilled]}
              />
            ))}
          </View>
        </View>
        <View style={styles.counterRow}>
          <Text style={styles.counterLabel}>CUENTA</Text>
          <Text style={styles.count}>
            {state.balls}-{state.strikes}
          </Text>
        </View>
      </View>

      <View style={styles.matchup}>
        {!!state.batter && (
          <Text style={styles.matchupLine} numberOfLines={1}>
            <Text style={styles.matchupLabel}>Al bate </Text>
            {state.batter}
          </Text>
        )}
        {!!state.pitcher && (
          <Text style={styles.matchupLine} numberOfLines={1}>
            <Text style={styles.matchupLabel}>Lanza </Text>
            {state.pitcher}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function LiveScoreboard({
  state,
  stale,
}: {
  state: LiveGameState;
  stale?: boolean;
}) {
  const isLive = state.status === 'live';
  const homeWon = state.status === 'final' && state.home.runs > state.away.runs;
  const awayWon = state.status === 'final' && state.away.runs > state.home.runs;

  const decisions = state.decisions;
  const hasDecisions = !!decisions && (!!decisions.winner || !!decisions.loser);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <StatusPill state={state} />
        {/* inning_ordinal_es, no inning_ordinal: el crudo de la MLB viene en
            inglés y dentro de esta frase daba "Baja del 1st". */}
        {isLive && !!(state.inning_ordinal_es ?? state.inning_ordinal) && (
          <Text style={styles.inning}>
            {state.is_top_inning ? 'Alta' : 'Baja'} del{' '}
            {state.inning_ordinal_es ?? state.inning_ordinal}
          </Text>
        )}
        {stale && <Text style={styles.stale}>sin señal</Text>}
        <Text style={styles.venue} numberOfLines={1}>
          {state.venue}
        </Text>
      </View>

      <View style={styles.teams}>
        <View style={styles.colHeader}>
          <Text style={styles.colHeaderSpacer} />
          <Text style={styles.colHeaderCell}>R</Text>
          <Text style={styles.colHeaderCell}>H</Text>
          <Text style={styles.colHeaderCell}>E</Text>
        </View>
        <TeamRow
          team={state.away}
          batting={isLive && state.is_top_inning === true}
          won={awayWon}
        />
        <TeamRow
          team={state.home}
          batting={isLive && state.is_top_inning === false}
          won={homeWon}
        />
      </View>

      {isLive && (
        <View style={styles.section}>
          <Situation state={state} />
        </View>
      )}

      {state.line_score.length > 0 && state.status !== 'preview' && (
        <View style={styles.section}>
          <LineScore state={state} />
        </View>
      )}

      {!!state.last_play && state.status !== 'preview' && (
        <View
          style={[
            styles.section,
            state.last_play_is_scoring && styles.scoringPlay,
          ]}
        >
          <Text
            style={[
              styles.lastPlay,
              state.last_play_is_scoring && styles.scoringPlayText,
            ]}
          >
            {state.last_play_is_scoring ? '⚾  ' : ''}
            {state.last_play}
          </Text>
        </View>
      )}

      {hasDecisions && (
        <View style={[styles.section, styles.decisions]}>
          {!!decisions!.winner && (
            <Text style={styles.decision}>
              <Text style={styles.decisionLabel}>G: </Text>
              {decisions!.winner}
            </Text>
          )}
          {!!decisions!.loser && (
            <Text style={styles.decision}>
              <Text style={styles.decisionLabel}>P: </Text>
              {decisions!.loser}
            </Text>
          )}
          {!!decisions!.save && (
            <Text style={styles.decision}>
              <Text style={styles.decisionLabel}>S: </Text>
              {decisions!.save}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.bgPage,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  pillLive: { backgroundColor: '#da363320', borderColor: '#da363350' },
  pillLiveText: { color: '#ff6b6b', fontSize: 10, fontWeight: '700' },
  pillFinal: { backgroundColor: COLORS.bgHeader, borderColor: COLORS.border },
  pillFinalText: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '700' },
  pillPreview: { backgroundColor: '#1f6feb20', borderColor: '#1f6feb50' },
  pillPreviewText: { color: COLORS.accent, fontSize: 10, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff6b6b' },
  inning: { color: '#c9d1d9', fontSize: 12 },
  stale: { color: '#d29922', fontSize: 10 },
  venue: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginLeft: 'auto',
    maxWidth: '40%',
    textAlign: 'right',
  },

  teams: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomColor: COLORS.bgHeader,
    borderBottomWidth: 1,
  },
  colHeaderSpacer: { flex: 1 },
  colHeaderCell: {
    width: 30,
    textAlign: 'right',
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
  battingArrow: { width: 10, color: '#facc15', fontSize: 11 },
  teamName: { flex: 1, color: '#c9d1d9', fontSize: 14 },
  teamNameWon: { color: COLORS.textPrimary, fontWeight: '700' },
  runs: { width: 30, textAlign: 'right', color: '#c9d1d9', fontSize: 16, fontWeight: '700' },
  runsWon: { color: COLORS.textPrimary },
  minor: { width: 30, textAlign: 'right', color: COLORS.textSecondary, fontSize: 12 },

  section: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
  },

  situation: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  counters: { gap: 8 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterLabel: {
    width: 46,
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  outs: { flexDirection: 'row', gap: 5 },
  out: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  outFilled: { backgroundColor: '#facc15' },
  count: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },

  matchup: { flex: 1, gap: 3 },
  matchupLine: { color: COLORS.textPrimary, fontSize: 12 },
  matchupLabel: { color: COLORS.textSecondary },

  lineScore: { gap: 3 },
  lsRow: { flexDirection: 'row', alignItems: 'center' },
  lsCode: { width: 34, color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  lsCell: { width: 22, textAlign: 'center', color: '#c9d1d9', fontSize: 11 },
  lsHead: { color: COLORS.textSecondary, fontWeight: '600' },
  lsTotal: { color: COLORS.textPrimary, fontWeight: '700', marginLeft: 6 },

  scoringPlay: { backgroundColor: '#23863618' },
  lastPlay: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17 },
  scoringPlayText: { color: '#7ee787' },

  decisions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  decision: { color: '#c9d1d9', fontSize: 11 },
  decisionLabel: { color: COLORS.textSecondary },
});
