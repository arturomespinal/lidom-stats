import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants';
import type { LastGame } from '../types';

/**
 * Los últimos diez, del más viejo al más nuevo: se leen de izquierda a
 * derecha como una racha. Ganado relleno de navy, perdido en blanco con
 * borde — y la letra escrita en los dos, porque el relleno solo sería color.
 */
export default function UltimosDiez({ juegos }: { juegos: LastGame[] }) {
  return (
    <View style={styles.fila}>
      {juegos.map((j, i) => {
        const g = j.result === 'G';
        return (
          <View
            key={`${j.date}-${i}`}
            style={styles.celda}
            accessible
            accessibilityLabel={`${g ? 'Ganó' : 'Perdió'} ${j.runs_for}-${j.runs_against} ${j.home ? 'contra' : 'en casa de'} ${j.opponent}, ${j.date}`}
          >
            <View style={[styles.cuadro, g ? styles.ganado : styles.perdido]}>
              <Text style={[styles.letra, { color: g ? COLORS.inkFg : COLORS.textSecondary }]}>{j.result}</Text>
            </View>
            <Text style={styles.rival}>{j.opponent}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', gap: 4, paddingHorizontal: 16 },
  celda: { flex: 1, alignItems: 'center', gap: 4 },
  cuadro: { alignSelf: 'stretch', height: 32, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  ganado: { backgroundColor: COLORS.ink },
  perdido: { backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border },
  letra: { fontFamily: FONTS.display, fontSize: 20 },
  rival: { fontSize: 10, color: COLORS.textSecondary },
});
