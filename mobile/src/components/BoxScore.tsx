import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants';
import { BatterLine, PitcherLine, TeamDetail } from '../types';
import TeamBadge from './TeamBadge';
import { useFichas } from '../navigation';

/**
 * Boxscore: los números de HOY, no el acumulado de temporada.
 *
 * Los bateadores vienen ya ordenados por turno al bate desde el backend, con
 * cada sustituto justo debajo del titular al que relevó (100, 101, 200, …).
 * Aquí se refleja con sangría: el orden ya carga la información, la sangría
 * solo la hace visible.
 *
 * Cada fila abre la ficha del jugador (`profile_id`, el slug que pone la
 * API; `player_id` aquí es el número de la MLB y no sirve para enlazar).
 * Por eso las filas miden 44 pt: son área táctil, y las reglas no bajan de
 * ahí. Un debutante sin ficha tiene su fila igual, pero quieta.
 */

/** Fila que abre la ficha si el jugador tiene una. */
function Fila({
  profileId,
  nombre,
  children,
}: {
  profileId: string | null;
  nombre: string;
  children: React.ReactNode;
}) {
  const nav = useFichas();
  return (
    <Pressable
      disabled={!profileId}
      onPress={() => profileId && nav.push('Jugador', { playerId: profileId, nombre })}
      style={({ pressed }) => [styles.row, styles.rowTactil, pressed && styles.rowPressed]}
      accessibilityRole={profileId ? 'button' : undefined}
      accessibilityHint={profileId ? 'Abre su ficha' : undefined}
    >
      {children}
    </Pressable>
  );
}

function TeamHeader({ team }: { team: TeamDetail }) {
  return (
    <View style={styles.teamHeader}>
      <TeamBadge code={team.team_code ?? '—'} size={28} />
      <Text style={styles.teamName} numberOfLines={1}>
        {team.team_name ?? '—'}
      </Text>
      <Text style={styles.teamLine}>
        {team.runs} C · {team.hits} H · {team.errors} E
      </Text>
    </View>
  );
}

function BatterRow({ b }: { b: BatterLine }) {
  return (
    <Fila profileId={b.profile_id} nombre={b.name}>
      <View style={[styles.nameCell, !b.is_starter && styles.sub]}>
        <Text style={styles.pos}>{b.position ?? ''}</Text>
        <Text
          style={[styles.name, !b.is_starter && styles.subName]}
          numberOfLines={1}
        >
          {b.name}
        </Text>
      </View>
      <Text style={styles.n}>{b.at_bats}</Text>
      <Text style={styles.n}>{b.runs}</Text>
      <Text style={[styles.n, styles.nStrong]}>{b.hits}</Text>
      <Text style={styles.n}>{b.rbi}</Text>
      <Text style={styles.n}>{b.walks}</Text>
      <Text style={styles.n}>{b.strikeouts}</Text>
    </Fila>
  );
}

function PitcherRow({ p }: { p: PitcherLine }) {
  return (
    <Fila profileId={p.profile_id} nombre={p.name}>
      <View style={styles.nameCell}>
        <Text style={styles.pos}>{p.is_starter ? 'AB' : 'RL'}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {p.name}
            {!!p.note && <Text style={styles.note}> {p.note}</Text>}
          </Text>
        </View>
      </View>
      {/* Texto y no número: "0.2" son dos outs, no dos décimas. */}
      <Text style={[styles.n, styles.nWide, styles.nStrong]}>
        {p.innings_pitched ?? '—'}
      </Text>
      <Text style={styles.n}>{p.hits}</Text>
      <Text style={styles.n}>{p.earned_runs}</Text>
      <Text style={styles.n}>{p.walks}</Text>
      <Text style={styles.n}>{p.strikeouts}</Text>
    </Fila>
  );
}

function TeamBlock({ team }: { team: TeamDetail }) {
  return (
    <View style={styles.block}>
      <TeamHeader team={team} />

      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.nameCell, styles.head]}>Bateadores</Text>
        <Text style={[styles.n, styles.head]}>VB</Text>
        <Text style={[styles.n, styles.head]}>C</Text>
        <Text style={[styles.n, styles.head]}>H</Text>
        <Text style={[styles.n, styles.head]}>CI</Text>
        <Text style={[styles.n, styles.head]}>BB</Text>
        <Text style={[styles.n, styles.head]}>K</Text>
      </View>
      {team.batters.map(b => (
        <BatterRow key={`${b.player_id}-${b.batting_order}`} b={b} />
      ))}

      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.nameCell, styles.head]}>Lanzadores</Text>
        <Text style={[styles.n, styles.nWide, styles.head]}>IP</Text>
        <Text style={[styles.n, styles.head]}>H</Text>
        <Text style={[styles.n, styles.head]}>CL</Text>
        <Text style={[styles.n, styles.head]}>BB</Text>
        <Text style={[styles.n, styles.head]}>K</Text>
      </View>
      {team.pitchers.map(p => (
        <PitcherRow key={p.player_id} p={p} />
      ))}
    </View>
  );
}

export default function BoxScore({
  home,
  away,
}: {
  home: TeamDetail;
  away: TeamDetail;
}) {
  if (away.batters.length === 0 && home.batters.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Todavía no hay boxscore.</Text>
      </View>
    );
  }
  // El visitante primero, como en el cuadro por entradas y en cualquier
  // boxscore impreso.
  return (
    <View>
      <TeamBlock team={away} />
      <TeamBlock team={home} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 18 },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: COLORS.bgPage,
  },
  teamName: { flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  teamLine: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowTactil: { minHeight: 44 },
  rowPressed: { backgroundColor: COLORS.bgRaised },
  headRow: { backgroundColor: COLORS.bgHeader, paddingVertical: 6 },
  head: {
    color: COLORS.textSecondary,
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  nameCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  sub: { paddingLeft: 12 },
  pos: {
    width: 24,
    color: COLORS.textSecondary,
    fontSize: 9.5,
    fontWeight: '700',
  },
  name: { flex: 1, color: COLORS.textSupport, fontSize: 12.5 },
  subName: { color: COLORS.textSecondary },
  note: { color: COLORS.positive, fontSize: 11, fontWeight: '700' },

  n: {
    width: 26,
    textAlign: 'right',
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  nWide: { width: 34 },
  nStrong: { color: COLORS.textPrimary, fontWeight: '700' },

  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
});
