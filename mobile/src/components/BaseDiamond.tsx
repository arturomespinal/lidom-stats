import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LiveRunners } from '../types';
import { COLORS } from '../constants';

/**
 * El diamante con los corredores.
 *
 * Hecho con Views rotadas 45° en vez de SVG: son tres cuadrados y un
 * triángulo. Se hizo antes de que `react-native-svg` entrara (para la franja
 * de probabilidad), y funciona: no hay razón para pasarlo a SVG.
 *
 * Primera a la derecha, segunda arriba, tercera a la izquierda, como se ve
 * desde detrás del home. Base ocupada = rellena; vacía = solo contorno.
 */

const OCCUPIED = COLORS.warning;
const EMPTY = COLORS.border;

/**
 * El centro de cada base y del home, en puntos dentro del diamante: por donde
 * corre el corredor de la jugada (ver Situacion.tsx). Las mismas cuentas que
 * colocan las bases abajo.
 */
export function posicionesDiamante(size: number) {
  const b = Math.round(size * 0.22);
  const half = b / 2;
  return {
    home: { x: size / 2, y: size * 0.8 + b * 0.2 },
    first: { x: size * 0.84, y: size * 0.46 + half },
    second: { x: size / 2, y: size * 0.14 + half },
    third: { x: size * 0.16, y: size * 0.46 + half },
  };
}

type Ocupadas = { first: boolean; second: boolean; third: boolean };

const ocupadas = (r: LiveRunners): Ocupadas => ({
  first: !!r.first,
  second: !!r.second,
  third: !!r.third,
});

export default function BaseDiamond({
  runners,
  size = 62,
  retrasoLlenado = 0,
}: {
  runners: LiveRunners;
  size?: number;
  /** Milisegundos que espera una base para encenderse: lo que tarda el
   *  corredor de la jugada en llegar. Al vaciarse no espera. */
  retrasoLlenado?: number;
}) {
  const b = Math.round(size * 0.22); // lado de cada base
  const half = b / 2;

  // Lo que se pinta. Una base que se vacía se apaga en el acto; una que se
  // llena espera al corredor. Al montar se pinta lo que hay, sin esperar.
  const ahora = ocupadas(runners);
  const [pintadas, setPintadas] = useState<Ocupadas>(ahora);
  useEffect(() => {
    const vacias: Ocupadas = {
      first: pintadas.first && ahora.first,
      second: pintadas.second && ahora.second,
      third: pintadas.third && ahora.third,
    };
    const iguales = (a: Ocupadas, c: Ocupadas) =>
      a.first === c.first && a.second === c.second && a.third === c.third;
    if (iguales(pintadas, ahora)) return;
    if (retrasoLlenado <= 0) {
      setPintadas(ahora);
      return;
    }
    if (!iguales(pintadas, vacias)) setPintadas(vacias);
    const t = setTimeout(() => setPintadas(ahora), retrasoLlenado);
    return () => clearTimeout(t);
    // Solo cuando cambian los corredores; `pintadas` es el punto de partida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ahora.first, ahora.second, ahora.third, retrasoLlenado]);

  const bases: { key: string; on: boolean; left: number; top: number }[] = [
    { key: 'second', on: pintadas.second, left: size / 2 - half, top: size * 0.14 },
    { key: 'third', on: pintadas.third, left: size * 0.16 - half, top: size * 0.46 },
    { key: 'first', on: pintadas.first, left: size * 0.84 - half, top: size * 0.46 },
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
