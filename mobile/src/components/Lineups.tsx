import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants';
import { TeamDetail } from '../types';
import TeamBadge from './TeamBadge';

/**
 * Quién está en el terreno, quién ya lanzó y quién queda disponible.
 *
 * `bullpen` y `bench` son los que TODAVÍA NO han entrado: la MLB los saca de
 * esas listas cuando entran al juego. Por eso el bullpen encoge a medida que
 * avanza el juego, y eso mismo es la información útil — cuántos brazos le
 * quedan al manager.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      {children}
    </View>
  );
}

function Block({ team }: { team: TeamDetail }) {
  const titulares = team.batters.filter(b => b.is_starter);
  const usados = team.pitchers;

  return (
    <View style={styles.block}>
      <View style={styles.teamHeader}>
        <TeamBadge code={team.team_code ?? '—'} size={28} />
        <Text style={styles.teamName} numberOfLines={1}>
          {team.team_name ?? '—'}
        </Text>
      </View>

      <Section title="Alineación">
        {titulares.length === 0 ? (
          <Text style={styles.none}>Sin publicar.</Text>
        ) : (
          titulares.map((b, i) => (
            <View key={b.player_id} style={styles.row}>
              <Text style={styles.order}>{i + 1}</Text>
              <Text style={styles.pos}>{b.position ?? ''}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {b.name}
              </Text>
              {!!b.summary && <Text style={styles.aside}>{b.summary}</Text>}
            </View>
          ))
        )}
      </Section>

      <Section title={`Ya lanzaron (${usados.length})`}>
        {usados.length === 0 ? (
          <Text style={styles.none}>Ninguno todavía.</Text>
        ) : (
          usados.map(p => (
            <View key={p.player_id} style={styles.row}>
              <Text style={styles.order}>{p.order}</Text>
              <Text style={styles.pos}>{p.is_starter ? 'AB' : 'RL'}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {p.name}
                {!!p.note && <Text style={styles.note}> {p.note}</Text>}
              </Text>
              <Text style={styles.aside}>
                {p.innings_pitched ?? '—'} IP · {p.pitches} lan.
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section title={`Bullpen disponible (${team.bullpen.length})`}>
        {team.bullpen.length === 0 ? (
          <Text style={styles.none}>Sin brazos disponibles.</Text>
        ) : (
          <Text style={styles.list}>
            {team.bullpen.map(a => a.name).join(' · ')}
          </Text>
        )}
      </Section>

      <Section title={`Banca (${team.bench.length})`}>
        {team.bench.length === 0 ? (
          <Text style={styles.none}>Sin sustitutos disponibles.</Text>
        ) : (
          <Text style={styles.list}>
            {team.bench.map(a => a.name).join(' · ')}
          </Text>
        )}
      </Section>
    </View>
  );
}

export default function Lineups({
  home,
  away,
}: {
  home: TeamDetail;
  away: TeamDetail;
}) {
  return (
    <View>
      <Block team={away} />
      <Block team={home} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 20 },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: COLORS.bgPage,
  },
  teamName: { flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },

  section: {
    color: COLORS.textSecondary,
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 6,
    backgroundColor: COLORS.bgCard,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  order: {
    width: 14,
    color: COLORS.textSecondary,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  pos: { width: 24, color: COLORS.textSecondary, fontSize: 9.5, fontWeight: '700' },
  name: { flex: 1, color: COLORS.textSupport, fontSize: 13 },
  note: { color: COLORS.positive, fontSize: 11, fontWeight: '700' },
  aside: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  list: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 19,
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: COLORS.bgCard,
  },
  none: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: COLORS.bgCard,
  },
});
