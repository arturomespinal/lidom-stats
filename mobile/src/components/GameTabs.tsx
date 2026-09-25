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

/*
 * Pestañas con SUBRAYADO, como el kit de referencia y la web, en vez de
 * píldoras. Cada una mide 44 pt de alto: el área táctil que piden las reglas
 * de diseño, sin necesidad de hitSlop — la píldora anterior medía 28 y lo
 * necesitaba.
 *
 * La activa se marca con la raya navy Y con el texto en tinta y más peso: la
 * raya sola, de 2 pt, es poca señal para un ojo cansado.
 */
const styles = StyleSheet.create({
  scroll: {
    backgroundColor: COLORS.bgCard,
    maxHeight: 44,
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  content: { paddingHorizontal: 8, flexDirection: 'row' },
  tab: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabOn: { borderBottomColor: COLORS.accent },
  tabPressed: { backgroundColor: COLORS.bgRaised },
  label: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  labelOn: { color: COLORS.textPrimary, fontWeight: '700' },
});
