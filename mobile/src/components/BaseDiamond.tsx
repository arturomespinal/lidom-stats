import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LiveRunners } from '../types';
import { COLORS } from '../constants';

/**
 * El diamante con los corredores.
 *
 * Hecho con Views rotadas 45° en vez de SVG a propósito: son tres cuadrados y
 * un triángulo, y `react-native-svg` no está en las dependencias. No vale
 * añadir una librería nativa por esto.
 *
 * Primera a la derecha, segunda arriba, tercera a la izquierda, como se ve
 * desde detrás del home. Base ocupada = rellena; vacía = solo contorno.
 */

const OCCUPIED = COLORS.warning;
const EMPTY = COLORS.border;

export default function BaseDiamond({
  runners,
  size = 62,
}: {
  runners: LiveRunners;
  size?: number;
}) {
  const b = Math.round(size * 0.22); // lado de cada base
  const half = b / 2;

  const bases: { key: string; on: boolean; left: number; top: number }[] = [
    { key: 'second', on: !!runners.second, left: size / 2 - half, top: size * 0.14 },
    { key: 'third', on: !!runners.third, left: size * 0.16 - half, top: size * 0.46 },
    { key: 'first', on: !!runners.first, left: size * 0.84 - half, top: size * 0.46 },
  ];

  return (
    <View style={{ width: size, height: size }}>
      {bases.map(base => (
        <View
          key={base.key}
          style={[
            styles.base,
            {
              width: b,
              height: b,
              left: base.left,
              top: base.top,
              backgroundColor: base.on ? OCCUPIED : 'transparent',
              borderColor: base.on ? OCCUPIED : EMPTY,
            },
          ]}
        />
      ))}

      {/* El home es referencia, no estado: siempre presente y tenue. */}
      <View
        style={[
          styles.home,
          {
            left: size / 2 - b * 0.3,
            top: size * 0.80,
            borderLeftWidth: b * 0.3,
            borderRightWidth: b * 0.3,
            borderTopWidth: b * 0.4,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  home: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: EMPTY,
  },
});
