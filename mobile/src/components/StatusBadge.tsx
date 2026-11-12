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
 * Antes había dos copias de esta etiqueta en el móvil (y dos más en la web),
 * cada una con su propio relleno — ahora es una.
 *
 * Look "Pizarra": una etiqueta de 6 pt de radio, sin borde, igual que en la
 * web. La esquina con más radio del look anterior sigue en `main`.
 */
export default function StatusBadge({ status, label }: Props) {
  // EN VIVO va SÓLIDO, con el texto grafito encima: 6.2:1. El blanco sobre
  // este rojo daría 3.3:1.
  const fondo =
    status === 'live' ? COLORS.live : status === 'preview' ? ALPHA.neutral15 : COLORS.border;
  const tinta =
    status === 'live'
      ? COLORS.accentOn
      : status === 'preview'
        ? COLORS.textSupport
        : status === 'final'
          ? COLORS.textPrimary
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
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  // SIN fontWeight: el peso lo pone la familia. Ver FONTS en constants.ts.
  texto: { fontFamily: FONTS.displayMedia, textTransform: 'uppercase', fontSize: 14, letterSpacing: 0.9 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accentOn },
});
