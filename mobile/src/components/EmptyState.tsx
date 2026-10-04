import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { API_BASE } from '../config';
import { COLORS } from '../constants';

/**
 * Pantalla vacía. Dos casos que NO son el mismo:
 *
 * - `sinConexion`: la API no respondió. Se dice a qué dirección se intentó,
 *   porque en el teléfono es lo primero que hay que revisar (la IP de la PC
 *   cambia, el firewall, la API apagada), y hay botón de reintentar.
 * - Sin eso: la API respondió pero no hay filas. Ahí sí toca correr la
 *   ingesta.
 */
export default function EmptyState({
  message,
  sinConexion = false,
  onReintentar,
}: {
  message?: string;
  sinConexion?: boolean;
  onReintentar?: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚾</Text>
      <Text style={styles.msg}>
        {sinConexion ? (__DEV__ ? 'No se pudo conectar con la API.' : 'No se pudo conectar.') : message ?? 'No hay datos disponibles.'}
      </Text>
      {/* Lo técnico (la dirección, el comando) solo en desarrollo: en un
          build de verdad __DEV__ es false y la persona ve un mensaje normal. */}
      {sinConexion ? (
        <Text style={__DEV__ ? styles.hint : styles.ayuda}>
          {__DEV__ ? `Se intentó en ${API_BASE}` : 'Revisa tu conexión e intenta de nuevo.'}
        </Text>
      ) : (
        __DEV__ && <Text style={styles.hint}>Corre: python main.py ingest 2025</Text>
      )}
      {!!onReintentar && (
        <Pressable
          onPress={onReintentar}
          style={({ pressed }) => [styles.boton, pressed && { backgroundColor: COLORS.bgRaised }]}
          accessibilityRole="button"
        >
          <Text style={styles.botonTexto}>Reintentar</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgPage,
    padding: 32,
  },
  icon: { fontSize: 48, marginBottom: 16 },
  msg: { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center', marginBottom: 8 },
  hint: { color: COLORS.textSecondary, fontSize: 12, textAlign: 'center', fontFamily: 'monospace' },
  ayuda: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center' },
  boton: {
    marginTop: 20,
    minHeight: 44,
    paddingHorizontal: 24,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  botonTexto: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
});
