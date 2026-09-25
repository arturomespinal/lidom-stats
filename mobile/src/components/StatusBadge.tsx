import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { ALPHA, COLORS, FONTS } from '../constants';
import { LiveStatus } from '../types';

interface Props {
  status: LiveStatus;
  /** Texto en vez del de por defecto: "FINAL (10)", "Warmup"… */
  label?: string;
}

const TEXTO: Record<LiveStatus, string> = {
  live: 'EN VIVO',
  final: 'FINAL',
  preview: 'PREVIA',
  other: '—',
};

/* El punto rojo que late junto a "EN VIVO". Animated corre en el hilo nativo
   con useNativeDriver, así que no compite con el sondeo ni con el scroll.
   Quien activó "reducir movimiento" en el teléfono ve el punto quieto, que
   dice lo mismo. */
function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelado = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reducir) => {
      if (reducir || cancelado) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.25, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelado = true;
      loop?.stop();
    };
  }, [opacity]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
}

/**
 * El estado de un juego: EN VIVO, FINAL o PREVIA.
 *
 * La esquina cortada es la firma de Deportiv y vive en DOS sitios: las tejas
 * de equipo y esto. Antes había dos copias de esta píldora en el móvil (y dos
 * más en la web), cada una con su propio relleno — ahora es una.
 *
 * React Native no tiene `clip-path`, así que el corte es el mismo eco que en
 * TeamBadge: la esquina inferior derecha con más radio que las otras tres. Y
 * sin borde, igual que en la web: el relleno solo basta.
 */
export default function StatusBadge({ status, label }: Props) {
  // EN VIVO va SÓLIDO: en el tema claro, rojo sobre rojo al 15% daba menos
  // de 4:1. Blanco sobre el rojo, 5.0:1.
  const fondo =
    status === 'live' ? COLORS.live : status === 'preview' ? ALPHA.neutral15 : COLORS.bgRaised;
  const tinta =
    status === 'live'
      ? COLORS.accentOn
      : status === 'preview'
        ? COLORS.textSupport
        : COLORS.textSecondary;

  return (
    <View
      style={[styles.badge, { backgroundColor: fondo }]}
      accessibilityRole="text"
      accessibilityLabel={label ?? TEXTO[status]}
    >
      {status === 'live' && <PulsingDot />}
      <Text style={[styles.texto, { color: tinta }]}>{label ?? TEXTO[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    // Nunca se estira: dentro de una columna, sin esto, el "FINAL" ocupaba
    // todo el ancho de la pantalla.
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 3,
    borderRadius: 3,
    borderBottomRightRadius: 9,
  },
  // Bebas Neue y SIN fontWeight: en Android un peso pedido a una fuente de un
  // solo peso la cambia por la del sistema. Ver FONTS en constants.ts.
  texto: { fontFamily: FONTS.display, fontSize: 13, letterSpacing: 0.8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accentOn },
});
