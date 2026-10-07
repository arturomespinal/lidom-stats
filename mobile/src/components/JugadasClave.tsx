import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants';
import { KeyPlay } from '../types';
import TeamBadge from './TeamBadge';

/**
 * Las jugadas que más movieron la probabilidad de ganar, de la que más a la
 * que menos. Las calcula el backend (`jugadas_clave` en src/live/store.py)
 * con la misma curva que la franja de arriba; el cambio es desde el equipo
 * que bateaba: un doble play le resta al suyo. Igual que en la web.
 */
export default function JugadasClave({
  jugadas,
  awayCode,
  homeCode,
}: {
  jugadas: KeyPlay[];
  awayCode: string;
  homeCode: string;
}) {
  if (jugadas.length === 0) return null;
  return (
    <View style={styles.caja}>
      <Text style={styles.etiqueta}>JUGADAS CLAVE</Text>
      {jugadas.map(j => {
        const sube = j.swing > 0;
        return (
          <View
            key={j.index}
            style={styles.fila}
            accessible
            accessibilityLabel={`${j.event_es ?? 'Jugada'}${j.batter ? ` de ${j.batter}` : ''}, ${
              j.half_label
            }, ${awayCode} ${j.away}, ${homeCode} ${j.home}. ${sube ? 'Subió' : 'Bajó'} ${Math.abs(
              j.swing,
            )} puntos la probabilidad de ${j.team_code ?? 'su equipo'}`}
          >
            <TeamBadge code={j.team_code ?? '—'} size={26} />
            <View style={styles.texto}>
              <Text style={styles.jugada} numberOfLines={1}>
                <Text style={styles.evento}>{j.event_es ?? 'Jugada'}</Text>
                {j.batter ? ` de ${j.batter}` : ''}
              </Text>
              <Text style={styles.contexto} numberOfLines={1}>
                {j.half_label} · {awayCode} {j.away}-{j.home} {homeCode}
              </Text>
            </View>
            <Text style={[styles.cambio, !sube && styles.cambioBaja]}>
              {sube ? '+' : '−'}
              {Math.abs(j.swing)}%
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, marginTop: 4, paddingBottom: 6, gap: 10 },
  etiqueta: { color: COLORS.textFaint, fontSize: 10, letterSpacing: 0.6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texto: { flex: 1, minWidth: 0 },
  jugada: { color: COLORS.textPrimary, fontSize: 14 },
  evento: { fontWeight: '600' },
  contexto: { color: COLORS.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 1 },
  // Bebas, sin fontWeight (ver FONTS).
  cambio: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.display,
    fontSize: 26,
    lineHeight: 26,
    paddingTop: 4,
    marginTop: -4,
    fontVariant: ['tabular-nums'],
  },
  cambioBaja: { color: COLORS.textSecondary },
});
