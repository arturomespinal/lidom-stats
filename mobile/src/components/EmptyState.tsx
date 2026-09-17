import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function EmptyState({ message }: { message?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚾</Text>
      <Text style={styles.msg}>{message ?? 'No hay datos disponibles.'}</Text>
      <Text style={styles.hint}>
        Corre: python main.py ingest 2025
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d1117',
    padding: 32,
  },
  icon: { fontSize: 48, marginBottom: 16 },
  msg: { color: '#8b949e', fontSize: 15, textAlign: 'center', marginBottom: 8 },
  hint: { color: '#30363d', fontSize: 12, textAlign: 'center', fontFamily: 'monospace' },
});
