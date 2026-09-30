import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants';
import type { LastGame } from '../types';

/**
 * Los últimos diez, del más viejo al más nuevo: se leen de izquierda a
 * derecha como una racha. Ganado relleno de navy, perdido en blanco con
 * borde — y la letra escrita en los dos, porque el relleno solo sería color.
 * Cada celda abre su juego.
 */
export default function UltimosDiez({
  juegos,
  onJuego,
}: {
  juegos: LastGame[];
  /** Tocar una celda abre ese juego. */
  onJuego?: (j: LastGame) => void;
}) {
  return (
    <View style={styles.fila}>
      {juegos.map((j, i) => {
        const g = j.result === 'G';
        return (
          <Pressable
            key={`${j.date}-${i}`}
            style={({ pressed }) => [styles.celda, pressed && { opacity: 0.6 }]}
            disabled={!onJuego || !j.game_id}
            onPress={() => onJuego?.(j)}
            accessibilityRole={onJuego ? 'button' : undefined}
            accessibilityLabel={`${g ? 'Ganó' : 'Perdió'} ${j.runs_for}-${j.runs_against} ${j.home ? 'contra' : 'en casa de'} ${j.opponent}, ${j.date}${onJuego ? '. Abrir el juego' : ''}`}
          >
            <View style={[styles.cuadro, g ? styles.ganado : styles.perdido]}>
              <Text style={[styles.letra, { color: g ? COLORS.inkFg : COLORS.textSecondary }]}>{j.result}</Text>
            </View>
            <Text style={styles.rival}>{j.opponent}</Text>
          </Pressable>
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
