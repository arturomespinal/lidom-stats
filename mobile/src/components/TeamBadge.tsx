import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TEAM_STYLES } from '../constants';

export default function TeamBadge({ code, size = 32 }: { code: string; size?: number }) {
  const style = TEAM_STYLES[code] ?? { primary: '#6b7280', bg: '#6b728025', text: '#9ca3af' };

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
