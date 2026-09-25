import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { COLORS } from '../constants';

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
 */
export default function Pestanas<K extends string>({
  tabs,
  active,
  onChange,
  llenar = false,
}: {
  tabs: Pestana<K>[];
  active: K;
  onChange: (k: K) => void;
  llenar?: boolean;
}) {
  return (
    <ScrollView
      horizontal
      scrollEnabled={!llenar}
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={[styles.content, llenar && styles.contentLleno]}
      accessibilityRole="tablist"
    >
      {tabs.map(t => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => [
              styles.tab,
              llenar && styles.tabLlena,
              on && styles.tabOn,
              pressed && !on && styles.tabPressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
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
  content: { paddingHorizontal: 8, flexDirection: 'row' },
  contentLleno: { flexGrow: 1, paddingHorizontal: 0 },
  tab: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLlena: { flex: 1 },
  tabOn: { borderBottomColor: COLORS.accent },
  tabPressed: { backgroundColor: COLORS.bgRaised },
  label: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  labelOn: { color: COLORS.textPrimary, fontWeight: '700' },
});
