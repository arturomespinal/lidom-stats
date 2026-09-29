import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, TEAM_STYLES } from '../constants';
import { rangoTemporadas } from '../formato';
import type { CareerTeam } from '../types';

/**
 * La trayectoria como una sola barra partida por equipo, cada tramo del largo
 * de las temporadas que jugó ahí y en orden cronológico. Se ve de un golpe
 * dónde pasó la mayor parte de su carrera — cosa que una lista de chips no
 * dice.
 *
 * Cada tramo abre el equipo. El código va escrito en la tinta del club debajo
 * de su color: el color solo nunca identifica.
 */
export default function Trayectoria({
  equipos,
  onEquipo,
}: {
  equipos: CareerTeam[];
  onEquipo: (code: string) => void;
}) {
  const orden = [...equipos].sort((a, b) => a.first_season.localeCompare(b.first_season));
  return (
    <View style={styles.fila}>
      {orden.map(t => {
        const st = TEAM_STYLES[t.team_code];
        return (
          <Pressable
            key={t.team_code}
            onPress={() => onEquipo(t.team_code)}
            style={({ pressed }) => [styles.tramo, { flexGrow: t.seasons }, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={`${t.team_code}, ${t.seasons} temporadas, ${rangoTemporadas(t.first_season, t.last_season)}. Abrir equipo`}
          >
            <View style={[styles.barra, { backgroundColor: st?.primary ?? COLORS.border }]} />
            <Text style={[styles.codigo, { color: st?.text ?? COLORS.textPrimary }]}>{t.team_code}</Text>
            <Text style={styles.detalle} numberOfLines={1}>
              {rangoTemporadas(t.first_season, t.last_season)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', gap: 4, paddingHorizontal: 16 },
  tramo: { flexBasis: 0, minWidth: 56, minHeight: 44, gap: 6 },
  barra: { height: 12, borderRadius: 3 },
  codigo: { fontFamily: FONTS.display, fontSize: 20, lineHeight: 20 },
  detalle: { fontSize: 11, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
});
