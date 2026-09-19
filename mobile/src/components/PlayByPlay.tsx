import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, ALPHA } from '../constants';
import { LiveGameDetail, PlayLine } from '../types';

/**
 * El relato, del más reciente al más viejo — que es como se lee un juego en
 * curso: lo último que pasó, arriba.
 *
 * El titular sale de `event_es`, compuesto en el backend desde campos
 * estructurados. `description` es el texto libre de la MLB y viene EN INGLÉS,
 * así que no se pinta: iría dentro de una pantalla en español.
 */

function inningHeader(label: string) {
  return (
    <View style={styles.inningBar}>
      <View style={styles.inningRule} />
      <Text style={styles.inningText}>{label}</Text>
      <View style={styles.inningRule} />
    </View>
  );
}

function Play({ play, detail }: { play: PlayLine; detail: LiveGameDetail }) {
  const anota = play.is_scoring_play;
  // El turno EN CURSO también viene en allPlays, todavía sin resultado:
  // event llega en null. Pintarlo como una jugada más lo dejaba con un guion
  // y sin sentido; es la jugada que está pasando ahora mismo.
  const enCurso = !play.is_complete;
  const awayCode = detail.away.team_code ?? 'VIS';
  const homeCode = detail.home.team_code ?? 'LOC';

  return (
    <View style={[styles.play, anota && styles.playScoring, enCurso && styles.playCurrent]}>
      <View
        style={[
          styles.marker,
          enCurso ? styles.markerCurrent : anota ? styles.markerScoring : styles.markerPlain,
        ]}
      />

      <View style={styles.body}>
        <Text style={[styles.event, anota && styles.eventScoring, enCurso && styles.eventCurrent]}>
          {enCurso ? 'En turno' : play.event_es ?? '—'}
          {enCurso && (
            <Text style={styles.count}>
              {'   '}
              {play.balls}-{play.strikes} · {play.outs}{' '}
              {play.outs === 1 ? 'out' : 'outs'}
            </Text>
          )}
          {!enCurso && play.rbi > 0 && (
            <Text style={styles.rbi}>
              {'  ·  '}
              {play.rbi} {play.rbi === 1 ? 'carrera' : 'carreras'}
            </Text>
          )}
        </Text>

        {!!play.batter && (
          <Text style={styles.names} numberOfLines={1}>
            {play.batter}
            {!!play.pitcher && (
              <Text style={styles.vs}>{'  ante  '}</Text>
            )}
            {play.pitcher}
          </Text>
        )}
      </View>

      <View style={styles.score}>
        <Text style={[styles.scoreNum, anota && styles.scoreNumScoring]}>
          {play.away_score}-{play.home_score}
        </Text>
        <Text style={styles.scoreCodes}>
          {awayCode}-{homeCode}
        </Text>
      </View>
    </View>
  );
}

export default function PlayByPlay({ detail }: { detail: LiveGameDetail }) {
  if (detail.plays.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {detail.status === 'preview'
            ? 'El juego no ha comenzado.'
            : 'Todavía no hay jugadas.'}
        </Text>
      </View>
    );
  }

  // Cabecera cada vez que cambia la media entrada. Como la lista va al revés,
  // el cambio se detecta contra la jugada ANTERIOR de la lista.
  const rows: React.ReactNode[] = [];
  let lastHalf: string | null = null;

  detail.plays.forEach(p => {
    if (p.half_label && p.half_label !== lastHalf) {
      rows.push(<View key={`h-${p.index}`}>{inningHeader(p.half_label)}</View>);
      lastHalf = p.half_label;
    }
    rows.push(<Play key={p.index} play={p} detail={detail} />);
  });

  return (
    <View>
      {rows}
      {detail.plays_returned < detail.plays_total && (
        <Text style={styles.truncated}>
          Mostrando las {detail.plays_returned} jugadas más recientes de{' '}
          {detail.plays_total}.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: COLORS.bgPage,
  },
  inningRule: { flex: 1, height: 1, backgroundColor: COLORS.border },
  inningText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },

  play: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingLeft: 16,
    paddingRight: 14,
    gap: 10,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  playScoring: { backgroundColor: ALPHA.positive12 },
  playCurrent: { backgroundColor: COLORS.bgRaised },

  marker: { width: 7, height: 7, borderRadius: 4, flex: 0 },
  markerPlain: { backgroundColor: COLORS.border },
  markerScoring: { backgroundColor: COLORS.positive },
  markerCurrent: { backgroundColor: COLORS.warning },

  body: { flex: 1, minWidth: 0 },
  event: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  eventScoring: { color: COLORS.positive },
  rbi: { color: COLORS.positive, fontSize: 12, fontWeight: '700' },
  eventCurrent: { color: COLORS.warning },
  count: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  names: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  vs: { color: COLORS.border },

  score: { alignItems: 'flex-end', minWidth: 42 },
  scoreNum: {
    color: COLORS.textSupport,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  scoreNumScoring: { color: COLORS.positive },
  scoreCodes: {
    color: COLORS.textSecondary,
    fontSize: 9,
    letterSpacing: 0.3,
    marginTop: 1,
  },

  truncated: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
});
