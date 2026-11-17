import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { tematico } from '../tema';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Un botón sobre la franja de una ficha: "Mi equipo" en la del equipo,
 * "Comparar" en la del jugador. Perfilado en el texto de la franja, 44 pt de
 * alto (el mínimo táctil), como los de la web.
 */
export default function BotonFranja({
  icono,
  texto,
  onPress,
  etiqueta,
  activo,
}: {
  icono: IoniconName;
  texto: string;
  onPress: () => void;
  /** Lo que lee el lector de pantalla, si no basta el texto. */
  etiqueta?: string;
  /** Para un interruptor (la estrella): se anuncia como marcado o no. */
  activo?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.boton, pressed && styles.presionado]}
      accessibilityRole="button"
      accessibilityLabel={etiqueta ?? texto}
      accessibilityState={activo === undefined ? undefined : { selected: activo }}
    >
      <Ionicons name={icono} size={17} color={COLORS.inkFg} />
      <Text style={styles.texto}>{texto}</Text>
    </Pressable>
  );
}

const styles = tematico(() => StyleSheet.create({
  boton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${COLORS.inkFg}40`,
  },
  presionado: { backgroundColor: `${COLORS.inkFg}1A` },
  texto: { color: COLORS.inkFg, fontSize: 14, fontWeight: '600' },
}));
