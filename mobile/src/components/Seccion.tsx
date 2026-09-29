import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants';

/**
 * Título de sección de las fichas, en Bebas como los de la web.
 *
 * `titular` es la frase que escribe el dato ("Tercer mejor OPS de la liga, a
 * los 38."): la compone el servidor, este componente solo la pone donde se lee
 * primero. `sub` explica cómo leer lo que viene debajo.
 *
 * Escala: 22 el título, 14 el titular (en negrita), 11 lo demás. La cabecera
 * héroe es la única que se sale de la escala, a propósito: es el momento de
 * la pantalla.
 */
export default function Seccion({
  titulo,
  nota,
  titular,
  sub,
}: {
  titulo: string;
  /** Texto chico a la derecha: el "cuántos" o el "de cuándo". */
  nota?: string;
  titular?: string | null;
  sub?: string;
}) {
  return (
    <View style={styles.caja}>
      <View style={styles.fila}>
        <Text style={styles.titulo} accessibilityRole="header">
          {titulo}
        </Text>
        {!!nota && <Text style={styles.nota}>{nota}</Text>}
      </View>
      {!!titular && <Text style={styles.titular}>{titular}</Text>}
      {!!sub && <Text style={styles.sub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8, gap: 4 },
  fila: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  // Sin fontWeight: Bebas tiene un solo peso (ver FONTS).
  titulo: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: 0.4, color: COLORS.textPrimary },
  nota: { fontSize: 11, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  titular: { fontSize: 14, fontWeight: '700', lineHeight: 19, color: COLORS.textPrimary },
  sub: { fontSize: 11, lineHeight: 16, color: COLORS.textSecondary },
});
