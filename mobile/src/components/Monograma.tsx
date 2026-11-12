import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants';
import { iniciales } from '../formato';

/**
 * El monograma del jugador: sus iniciales en una teja grafito redondeada.
 * Ocupa el lugar de la foto — que no podemos usar — con una marca propia,
 * igual que las tejas de equipo ocupan el de los escudos.
 *
 * Grafito con letra clara (17.4:1) y no el color del club: va encima del
 * plano del club en la cabecera, y así se recorta contra él con cualquiera de
 * los seis. Radio de un cuarto del lado, como en `TeamBadge`. `tinta` permite
 * otra letra.
 */
export default function Monograma({
  nombre,
  size = 88,
  tinta = COLORS.inkFg,
}: {
  nombre: string;
  size?: number;
  tinta?: string;
}) {
  const r = Math.round(size * 0.25);
  return (
    <View
      style={[styles.teja, { width: size, height: size, borderRadius: r }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.letras, { fontSize: size * 0.54, lineHeight: size * 0.6, color: tinta }]}>
        {iniciales(nombre)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  teja: { backgroundColor: COLORS.bgPage, alignItems: 'center', justifyContent: 'center' },
  letras: { fontFamily: FONTS.display, textTransform: 'uppercase', letterSpacing: 0.5 },
});
