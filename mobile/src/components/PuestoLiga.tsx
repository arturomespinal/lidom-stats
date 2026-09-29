import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants';
import { valorPuesto } from '../formato';
import type { PlayerRanking } from '../types';

/**
 * El jugador contra la liga: una fila por categoría con su valor, una barra y
 * su puesto entre los calificados.
 *
 * ── Puesto, no percentil ───────────────────────────────────────────────────
 * Con 16 calificados un percentil es una abstracción ("81") que esconde lo
 * que de verdad pasó: fue 3º. El puesto se lee sin explicación y es honesto
 * con lo chica que es la liga. La barra lo traduce a longitud —1º llena, el
 * último vacía— para que la columna se lea de un vistazo.
 *
 * ── Una sola tinta ─────────────────────────────────────────────────────────
 * La barra es navy en el podio (1º a 3º) y gris del 4º en adelante; el puesto
 * va escrito siempre. Nada de verde "bueno" y rojo "malo": el color no carga
 * juicio, y en deuteranopia esos dos son el mismo.
 */
export default function PuestoLiga({ ranking }: { ranking: PlayerRanking }) {
  const n = ranking.pool;
  return (
    <View style={styles.tarjeta}>
      {ranking.items.map((it, i) => {
        const podio = it.rank <= 3;
        const lleno = n > 1 ? ((n - it.rank) / (n - 1)) * 100 : 100;
        return (
          <View
            key={it.stat}
            style={[styles.fila, i < ranking.items.length - 1 && styles.separada]}
            accessible
            accessibilityLabel={`${it.label}: ${valorPuesto(it.value, it.format)}, ${it.rank}º de ${n}`}
          >
            <Text style={styles.etiqueta} numberOfLines={1}>
              {it.label}
            </Text>
            <Text style={styles.valor}>{valorPuesto(it.value, it.format)}</Text>
            <View style={styles.pista}>
              <View
                style={[
                  styles.relleno,
                  { width: `${Math.max(lleno, 3)}%`, backgroundColor: podio ? COLORS.ink : '#7A879B' },
                ]}
              />
            </View>
            {podio ? (
              <View style={styles.chip}>
                <Text style={styles.chipTexto}>{it.rank}º</Text>
              </View>
            ) : (
              <Text style={styles.puesto}>{it.rank}º</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
  fila: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  separada: { borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  etiqueta: { width: 96, fontSize: 14, color: COLORS.textSupport },
  valor: {
    width: 50,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  pista: { flex: 1, height: 8, borderRadius: 4, backgroundColor: COLORS.bgSunken, overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: 4 },
  // El podio en teja navy con la esquina cortada: la firma, reservada a
  // tejas y estados, aquí marca un estado — estar entre los tres primeros.
  chip: {
    minWidth: 34,
    height: 28,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.ink,
    borderRadius: 6,
    borderBottomRightRadius: 12,
  },
  chipTexto: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.inkFg },
  puesto: {
    minWidth: 34,
    textAlign: 'center',
    fontFamily: FONTS.display,
    fontSize: 20,
    color: COLORS.textSupport,
  },
});
