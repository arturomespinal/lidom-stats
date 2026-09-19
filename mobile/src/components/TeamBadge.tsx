import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ALPHA, COLORS, TEAM_STYLES } from '../constants';

export default function TeamBadge({ code, size = 32 }: { code: string; size?: number }) {
  // Respaldo para un código fuera del catálogo: gris de la paleta, nunca un
  // color inventado que parezca de equipo.
  const style = TEAM_STYLES[code] ?? {
    primary: COLORS.textSecondary,
    bg: ALPHA.neutral15,
    text: COLORS.textSecondary,
  };

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: 6,
          backgroundColor: style.bg,
          borderColor: `${style.primary}60`,
        },
      ]}
    >
      <Text style={[styles.text, { color: style.text, fontSize: size * 0.34 }]}>
        {code}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
