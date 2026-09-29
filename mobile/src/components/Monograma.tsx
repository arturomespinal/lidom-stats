import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants';
import { iniciales } from '../formato';

/**
 * El monograma del jugador: sus iniciales en una teja navy con la esquina
 * cortada. Ocupa el lugar de la foto — que no podemos usar — con una marca
 * propia, igual que las tejas de equipo ocupan el de los escudos.
 *
 * Navy con letra blanca (16.9:1) y no el color del club: va encima del plano
 * del club en la cabecera, y así se recorta contra él con cualquiera de los
 * seis. `tinta` permite otra letra cuando va sobre fondo claro.
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
  const r = Math.round(size * 0.11);
  return (
    <View
      style={[styles.teja, { width: size, height: size, borderRadius: r, borderBottomRightRadius: r * 2 }]}
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
  teja: { backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  letras: { fontFamily: FONTS.display, letterSpacing: 0.5 },
});
