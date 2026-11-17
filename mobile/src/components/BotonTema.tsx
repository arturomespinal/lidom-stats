import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { fijarTema, useTema } from '../tema';

/**
 * El botón de modo claro u oscuro, a la derecha del logotipo en la raíz de
 * cada pestaña (App.tsx): el mismo sitio que en la barra de la web.
 *
 * Muestra el modo AL QUE se pasa, como la web: una luna en el claro, un sol
 * en el oscuro. 44 pt de lado, el mínimo táctil de las reglas.
 */
export default function BotonTema() {
  const tema = useTema();
  const aClaro = tema === 'oscuro';
  return (
    <Pressable
      onPress={() => fijarTema(aClaro ? 'claro' : 'oscuro')}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel={aClaro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      <Ionicons name={aClaro ? 'sunny-outline' : 'moon-outline'} size={22} color={COLORS.textPrimary} />
    </Pressable>
  );
}
