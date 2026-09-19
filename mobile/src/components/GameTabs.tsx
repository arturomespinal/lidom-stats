import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { COLORS } from '../constants';

export type GameTab = 'relato' | 'linea' | 'boxscore' | 'alineaciones';

/* Etiquetas cortas a propósito: con "Por entradas" y "Alineaciones" la cuarta
   pestaña queda cortada por el borde en un iPhone, y una pestaña que hay que
   descubrir deslizando es una pestaña que nadie toca. */
const TABS: { key: GameTab; label: string }[] = [
  { key: 'relato', label: 'Relato' },
  { key: 'linea', label: 'Entradas' },
  { key: 'boxscore', label: 'Boxscore' },
  { key: 'alineaciones', label: 'Alineación' },
];

/**
 * Selector de pestaña del detalle de juego.
 *
 * La activa se INVIERTE —relleno claro, texto oscuro— en vez de teñirse. Con
 * el acento igual al blanco del texto (ver src/constants.ts) un fondo tenue
 * del acento sobre la tarjeta sería invisible.
 */
export default function GameTabs({
  active,
  onChange,
}: {
  active: GameTab;
  onChange: (t: GameTab) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {TABS.map(t => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => [
              styles.tab,
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
  scroll: { backgroundColor: COLORS.bgHeader, maxHeight: 50, flexGrow: 0 },
  // Medidas ajustadas para que las CUATRO quepan en 390 pt sin deslizar: con
  // 14 de padding y 7 de separación la última se salía por 9 pt.
  content: { paddingHorizontal: 10, paddingVertical: 9, gap: 6, flexDirection: 'row' },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  tabOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tabPressed: { backgroundColor: COLORS.bgRaised },
  label: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  labelOn: { color: COLORS.accentOn },
});
