import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { COLORS } from '../constants';
import { useReducirMovimiento } from './Movimiento';

export interface Pestana<K extends string> {
  key: K;
  label: string;
}

/**
 * Pestañas con SUBRAYADO — la firma del kit de referencia, igual que en la
 * web. Las usan el detalle de juego (GameTabs) y las dos fichas.
 *
 * Cada una mide 44 pt de alto: el área táctil que piden las reglas de diseño,
 * sin `hitSlop`. La activa se marca con la raya navy Y con el texto en tinta
 * y más peso: la raya sola, de 2 pt, es poca señal para un ojo cansado.
 *
 * `llenar` reparte el ancho entre las pestañas en vez de alinearlas a la
 * izquierda. Con dos pestañas (Bateo / Pitcheo) alineadas a la izquierda,
 * media barra queda vacía y la segunda parece un botón suelto.
 *
 * ── La raya se desliza ─────────────────────────────────────────────────────
 * Es UNA sola raya que viaja a la pestaña elegida, no una por pestaña que se
 * enciende y se apaga: el ojo sigue el movimiento en vez de buscar cuál quedó
 * marcada. Cada pestaña reporta su posición con onLayout; hasta que la activa
 * se mide, la raya no se pinta. La primera vez se coloca sin animar —si no,
 * entraría volando desde la izquierda al abrir la pantalla—. Con "reducir
 * movimiento" salta.
 *
 * El ancho no admite el driver nativo, así que esta animación corre en JS.
 * Son 180 ms una vez por toque: no compite con nada.
 *
 * ── `abajo` ────────────────────────────────────────────────────────────────
 * Para la barra que va al pie de la pantalla (detalle de juego, zona del
 * pulgar): el borde va arriba y la raya también, del lado del contenido que
 * la pestaña controla.
 */
export default function Pestanas<K extends string>({
  tabs,
  active,
  onChange,
  llenar = false,
  abajo = false,
}: {
  tabs: Pestana<K>[];
  active: K;
  onChange: (k: K) => void;
  llenar?: boolean;
  abajo?: boolean;
}) {
  const reducir = useReducirMovimiento();
  const [medidas, setMedidas] = useState<Partial<Record<K, { x: number; w: number }>>>({});
  const x = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(0)).current;
  const colocada = useRef(false);

  const m = medidas[active];

  useEffect(() => {
    if (!m) return;
    if (!colocada.current || reducir) {
      x.setValue(m.x);
      w.setValue(m.w);
      colocada.current = true;
      return;
    }
    const cfg = { duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: false };
    const a = Animated.parallel([
      Animated.timing(x, { toValue: m.x, ...cfg }),
      Animated.timing(w, { toValue: m.w, ...cfg }),
    ]);
    a.start();
    return () => a.stop();
  }, [m?.x, m?.w, reducir, x, w]);

  const medir = (k: K) => (e: LayoutChangeEvent) => {
    const { x: px, width } = e.nativeEvent.layout;
    setMedidas(prev => {
      const p = prev[k];
      if (p && p.x === px && p.w === width) return prev;
      return { ...prev, [k]: { x: px, w: width } };
    });
  };

  return (
    <ScrollView
      horizontal
      scrollEnabled={!llenar}
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, abajo && styles.scrollAbajo]}
      contentContainerStyle={[styles.content, llenar && styles.contentLleno]}
      accessibilityRole="tablist"
    >
      {tabs.map(t => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            onLayout={medir(t.key)}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => [styles.tab, llenar && styles.tabLlena, pressed && !on && styles.tabPressed]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
      {!!m && (
        <Animated.View
          pointerEvents="none"
          style={[styles.raya, abajo ? styles.rayaArriba : styles.rayaAbajo, { left: x, width: w }]}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: COLORS.bgCard,
    maxHeight: 44,
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  scrollAbajo: {
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  content: { paddingHorizontal: 8, flexDirection: 'row' },
  contentLleno: { flexGrow: 1, paddingHorizontal: 0 },
  tab: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  tabLlena: { flex: 1 },
  tabPressed: { backgroundColor: COLORS.bgRaised },
  label: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  labelOn: { color: COLORS.textPrimary, fontWeight: '700' },
  raya: { position: 'absolute', height: 2, backgroundColor: COLORS.accent },
  rayaAbajo: { bottom: 0 },
  rayaArriba: { top: 0 },
});
