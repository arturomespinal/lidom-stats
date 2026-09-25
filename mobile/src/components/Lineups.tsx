import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants';
import { BullpenArm, TeamDetail } from '../types';
import TeamBadge from './TeamBadge';
import { useFichas } from '../navigation';

/**
 * Quién está en el terreno, quién ya lanzó y quién queda disponible.
 *
 * `bullpen` y `bench` son los que TODAVÍA NO han entrado: la MLB los saca de
 * esas listas cuando entran al juego. Por eso el bullpen encoge a medida que
 * avanza el juego, y eso mismo es la información útil — cuántos brazos le
 * quedan al manager.
 *
 * Todos los nombres abren la ficha (`profile_id`). Las filas miden 44 pt; el
 * bullpen y la banca, que eran un párrafo de nombres separados por "·",
 * pasan a fichas sueltas: un toque sobre una palabra dentro de un renglón no
 * se acierta con el pulgar.
 */

/** Una fila de 44 pt que abre la ficha, si el jugador tiene una. */
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
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole={profileId ? 'button' : undefined}
      accessibilityHint={profileId ? 'Abre su ficha' : undefined}
    >
      {children}
    </Pressable>
  );
}

/**
 * Bullpen o banca: nombres en fichas que se envuelven. 36 pt de alto más 4
 * de `hitSlop` arriba y abajo llegan a los 44 sin pisar a la de al lado — el
 * hueco entre filas es de 8.
 */
function Disponibles({ lista }: { lista: BullpenArm[] }) {
  const nav = useFichas();
  return (
    <View style={styles.chips}>
      {lista.map(a => (
        <Pressable
          key={a.player_id}
          disabled={!a.profile_id}
          onPress={() => a.profile_id && nav.push('Jugador', { playerId: a.profile_id, nombre: a.name })}
          hitSlop={{ top: 4, bottom: 4 }}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          accessibilityRole={a.profile_id ? 'button' : undefined}
        >
          <Text style={styles.chipText}>{a.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

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
            <Fila key={b.player_id} profileId={b.profile_id} nombre={b.name}>
              <Text style={styles.order}>{i + 1}</Text>
              <Text style={styles.pos}>{b.position ?? ''}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {b.name}
              </Text>
              {!!b.summary && <Text style={styles.aside}>{b.summary}</Text>}
            </Fila>
          ))
        )}
      </Section>

      <Section title={`Ya lanzaron (${usados.length})`}>
        {usados.length === 0 ? (
          <Text style={styles.none}>Ninguno todavía.</Text>
        ) : (
          usados.map(p => (
            <Fila key={p.player_id} profileId={p.profile_id} nombre={p.name}>
              <Text style={styles.order}>{p.order}</Text>
              <Text style={styles.pos}>{p.is_starter ? 'AB' : 'RL'}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {p.name}
                {!!p.note && <Text style={styles.note}> {p.note}</Text>}
              </Text>
              <Text style={styles.aside}>
                {p.innings_pitched ?? '—'} IP · {p.pitches} lan.
              </Text>
            </Fila>
          ))
        )}
      </Section>

      <Section title={`Bullpen disponible (${team.bullpen.length})`}>
        {team.bullpen.length === 0 ? (
          <Text style={styles.none}>Sin brazos disponibles.</Text>
        ) : (
          <Disponibles lista={team.bullpen} />
        )}
      </Section>

      <Section title={`Banca (${team.bench.length})`}>
        {team.bench.length === 0 ? (
          <Text style={styles.none}>Sin sustitutos disponibles.</Text>
        ) : (
          <Disponibles lista={team.bench} />
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
    minHeight: 44,
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
  pressed: { backgroundColor: COLORS.bgRaised },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 16,
    backgroundColor: COLORS.bgCard,
  },
  chip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  chipText: { color: COLORS.textSupport, fontSize: 13 },
  none: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: COLORS.bgCard,
  },
});
