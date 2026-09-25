import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, DimensionValue, StyleSheet, View } from 'react-native';
import { COLORS } from '../constants';

/**
 * Un bloque gris del tamaño de lo que va a llegar.
 *
 * Las reglas de diseño piden esqueletos en vez de un spinner que tapa la
 * pantalla: la forma de la ficha aparece al instante, el ojo ya sabe dónde va
 * el nombre y dónde los números, y cuando llegan los datos no salta nada.
 *
 * Late despacio (opacidad, en el hilo nativo). Con "reducir movimiento" se
 * queda quieto, que dice lo mismo.
 */
export function Bloque({
  w,
  h,
  r = 4,
}: {
  w: DimensionValue;
  h: number;
  r?: number;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelado = false;
    AccessibilityInfo.isReduceMotionEnabled().then(reducir => {
      if (reducir || cancelado) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.55, duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelado = true;
      loop?.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      style={{ width: w, height: h, borderRadius: r, backgroundColor: COLORS.bgSunken, opacity }}
    />
  );
}

/**
 * El esqueleto de una ficha: cabecera, fila de cifras y unas filas de tabla.
 * Sirve para las dos (jugador y equipo) porque las dos tienen esa forma.
 */
export function EsqueletoFicha() {
  return (
    <View
      style={styles.pagina}
      accessibilityLabel="Cargando"
      accessibilityState={{ busy: true }}
    >
      <View style={styles.tarjeta}>
        <View style={styles.fila}>
          <Bloque w={48} h={48} r={8} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bloque w="70%" h={24} />
            <Bloque w="45%" h={12} />
          </View>
        </View>
        <View style={[styles.fila, { marginTop: 24 }]}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={{ flex: 1, gap: 8 }}>
              <Bloque w="80%" h={20} />
              <Bloque w="60%" h={10} />
            </View>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, gap: 8, marginTop: 24 }}>
        <Bloque w={120} h={18} />
        {[0, 1, 2, 3, 4, 5].map(i => (
          <Bloque key={i} w="100%" h={44} r={6} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },
  tarjeta: {
    backgroundColor: COLORS.bgCard,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
