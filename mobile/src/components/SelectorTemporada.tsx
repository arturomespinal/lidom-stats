import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants';
import HojaInferior from './HojaInferior';
import { Tocable } from './Movimiento';

export interface OpcionTemporada {
  /** Lo que se devuelve al elegir ("2015" o "2015-16", según la pantalla). */
  key: string;
  /** Lo que se lee: "2015-16". */
  label: string;
  /** Una línea debajo, opcional: "32-17 · .653". */
  nota?: string;
}

const FILA = 60;

/**
 * El selector de temporada: un botón que dice cuál se está viendo y abre una
 * hoja desde abajo con todas.
 *
 * Reemplazó a las pestañas de temporada (30-sep-2026): catorce pestañas no
 * caben en un teléfono, la elegida quedaba cortada por el borde y había que
 * deslizar para descubrir las demás. El botón siempre dice lo que está
 * elegido, y la lista entera cabe en la hoja con filas de 60 pt.
 *
 * La barra que lo lleva mide 56 pt; en Posiciones, Bateo y Pitcheo va fija
 * arriba, y en la ficha de equipo, pegada al desplazar.
 */
export default function SelectorTemporada({
  opciones,
  activa,
  onChange,
  titulo = 'Temporada',
}: {
  opciones: OpcionTemporada[];
  activa: string;
  onChange: (key: string) => void;
  titulo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const lista = useRef<ScrollView>(null);
  const actual = opciones.find(o => o.key === activa);

  // Al abrir, la elegida queda a la vista aunque sea la 2012-13, la última.
  useEffect(() => {
    if (!abierto) return;
    const i = opciones.findIndex(o => o.key === activa);
    if (i > 3) {
      const id = setTimeout(() => lista.current?.scrollTo({ y: (i - 2) * FILA, animated: false }), 0);
      return () => clearTimeout(id);
    }
  }, [abierto, activa, opciones]);

  if (opciones.length < 2) return null;

  return (
    <View style={styles.barra}>
      <Tocable
        onPress={() => setAbierto(true)}
        style={({ pressed }) => [styles.boton, pressed && styles.presionado]}
        accessibilityRole="button"
        accessibilityLabel={`${titulo}: ${actual?.label ?? activa}. Cambiar`}
      >
        <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
        <Text style={styles.botonEtiqueta}>{titulo.toUpperCase()}</Text>
        <Text style={styles.botonValor}>{actual?.label ?? activa}</Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.textPrimary} />
      </Tocable>

      <HojaInferior
        visible={abierto}
        onClose={() => setAbierto(false)}
        titulo={titulo}
        subtitulo={`${opciones.length} temporadas en la base`}
      >
        <ScrollView ref={lista} contentContainerStyle={styles.lista}>
          {opciones.map((o, i) => {
            const es = o.key === activa;
            return (
              <Pressable
                key={o.key}
                onPress={() => {
                  setAbierto(false);
                  if (!es) onChange(o.key);
                }}
                style={({ pressed }) => [styles.fila, es && styles.filaActiva, pressed && !es && styles.presionado]}
                accessibilityRole="button"
                accessibilityState={{ selected: es }}
                accessibilityLabel={`${o.label}${o.nota ? `, ${o.nota}` : ''}${i === 0 ? ', la más reciente' : ''}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.filaValor, es && styles.textoActivo]}>{o.label}</Text>
                  {!!o.nota && <Text style={[styles.filaNota, es && styles.notaActiva]}>{o.nota}</Text>}
                </View>
                {i === 0 && !es && <Text style={styles.reciente}>ACTUAL</Text>}
                {es && <Ionicons name="checkmark-circle" size={22} color={COLORS.inkFg} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </HojaInferior>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: COLORS.bgPage,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  boton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  presionado: { backgroundColor: COLORS.bgRaised },
  botonEtiqueta: { fontSize: 11, letterSpacing: 0.8, color: COLORS.textSecondary, fontWeight: '600' },
  // Bebas sin fontWeight (ver FONTS).
  botonValor: { fontFamily: FONTS.display, fontSize: 22, lineHeight: 24, color: COLORS.textPrimary, paddingTop: 2 },
  lista: { paddingHorizontal: 16, paddingBottom: 8, gap: 4 },
  fila: {
    height: FILA - 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  filaActiva: { backgroundColor: COLORS.ink },
  filaValor: { fontFamily: FONTS.display, fontSize: 26, lineHeight: 28, color: COLORS.textPrimary, paddingTop: 2 },
  filaNota: { fontSize: 12, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  textoActivo: { color: COLORS.inkFg },
  notaActiva: { color: COLORS.inkDim },
  reciente: { fontSize: 10, letterSpacing: 0.8, fontWeight: '700', color: COLORS.textSecondary },
});
