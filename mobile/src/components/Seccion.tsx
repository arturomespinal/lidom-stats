import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants';

/**
 * Título de sección de las fichas, en Bebas como los de la web.
 *
 * Escala tipográfica de las fichas — las reglas piden 3 o 4 tamaños por
 * pantalla, y son estos cuatro: 28 (nombre y cifras del héroe), 22 (títulos
 * de sección y cifras secundarias), 14 (cuerpo y tablas) y 11 (etiquetas).
 */
export default function Seccion({
  titulo,
  nota,
}: {
  titulo: string;
  /** Texto chico a la derecha: el "cuántos" o el "de cuándo". */
  nota?: string;
}) {
  return (
    <View style={styles.fila}>
      <Text style={styles.titulo} accessibilityRole="header">
        {titulo}
      </Text>
      {!!nota && <Text style={styles.nota}>{nota}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  // Sin fontWeight: Bebas tiene un solo peso (ver FONTS).
  titulo: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: 0.4, color: COLORS.textPrimary },
  nota: { fontSize: 11, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
});
