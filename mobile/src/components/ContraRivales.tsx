import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, TEAM_SHORT_NAMES } from '../constants';
import { tematico } from '../tema';
import type { TeamProfile } from '../types';
import TeamBadge from './TeamBadge';

/**
 * "Contra cada rival": el récord de la temporada contra cada uno de los otros
 * cinco, y la puerta a cada enfrentamiento. Lo cuenta el servidor
 * (src/enfrentamiento.py). Un rival sin juegos sale "Sin juegos" y quieto.
 * Misma sección que la web (components/team/ContraRivales.tsx).
 */
export default function ContraRivales({
  rivales,
  onRival,
}: {
  rivales: NonNullable<TeamProfile['rivals']>;
  onRival: (code: string) => void;
}) {
  return (
    <View style={styles.lista}>
      {rivales.map((r, i) => {
        const jugados = r.wins + r.losses;
        const nombre = TEAM_SHORT_NAMES[r.team_code] ?? r.team_code;
        return (
          <Pressable
            key={r.team_code}
            disabled={jugados === 0}
            onPress={() => onRival(r.team_code)}
            style={({ pressed }) => [styles.fila, i > 0 && styles.borde, pressed && styles.presionada]}
            accessibilityRole={jugados ? 'button' : undefined}
            accessibilityLabel={
              jugados ? `${nombre}: ${r.wins} ganados, ${r.losses} perdidos. Ver el enfrentamiento` : `${nombre}: sin juegos`
            }
          >
            <TeamBadge code={r.team_code} size={30} />
            <Text style={styles.nombre} numberOfLines={1}>{nombre}</Text>
            {jugados > 0 ? (
              <>
                <Text style={styles.record}>{r.wins}-{r.losses}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
              </>
            ) : (
              <Text style={styles.sin}>Sin juegos</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = tematico(() => StyleSheet.create({
  lista: {
    marginHorizontal: 16,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    overflow: 'hidden',
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14 },
  borde: { borderTopWidth: 1, borderTopColor: COLORS.border },
  presionada: { backgroundColor: COLORS.bgRaised },
  nombre: { flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  record: { color: COLORS.textPrimary, fontFamily: FONTS.display, fontSize: 22, fontVariant: ['tabular-nums'] },
  sin: { color: COLORS.textSecondary, fontSize: 13 },
}));
