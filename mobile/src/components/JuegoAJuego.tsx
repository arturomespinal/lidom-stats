import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants';
import type { FilaJuegoBateo, FilaJuegoPitcheo } from '../types';

type Fila = FilaJuegoBateo | FilaJuegoPitcheo;

/** Cuántas filas se ven antes de "Ver los N": una temporada son ~50. */
const VISIBLES = 10;

/**
 * El juego a juego de un jugador: una fila por juego, del más reciente al
 * más viejo, con la fecha, el rival, cómo le fue al equipo y su línea. Cada
 * fila abre el juego.
 *
 * La línea ("2-3 · HR · 5 CI") la compone el servidor con las mismas
 * funciones de la portada: un jugador se lee igual en su ficha, en Hoy y en
 * el boxscore. El resultado es el del EQUIPO —un relevista que no decidió no
 * tiene "G" propia—, y por eso va en una teja aparte de la línea.
 */
export default function JuegoAJuego({
  filas,
  onJuego,
}: {
  filas: Fila[];
  onJuego: (f: Fila) => void;
}) {
  const [todas, setTodas] = useState(false);
  const vistas = todas ? filas : filas.slice(0, VISIBLES);
  return (
    <View style={styles.lista}>
      {vistas.map(f => {
        const g = f.result === 'G';
        const donde = f.side === 'home' ? 'vs' : 'en';
        return (
          <Pressable
            key={f.game_id}
            onPress={() => onJuego(f)}
            style={({ pressed }) => [styles.fila, pressed && styles.presionado]}
            accessibilityRole="button"
            accessibilityLabel={
              `${f.date_label}, ${donde} ${f.opponent}. ` +
              `${g ? 'Ganó' : f.result === 'P' ? 'Perdió' : 'Empate'} ${f.runs_for}-${f.runs_against}. ${f.line}. Abrir el juego`
            }
          >
            <View style={styles.fecha}>
              <Text style={styles.fechaTexto}>{f.date_label}</Text>
              <Text style={styles.rival}>
                {donde} {f.opponent}
              </Text>
            </View>
            <View style={[styles.resultado, g ? styles.ganado : styles.perdido]}>
              <Text style={[styles.resultadoTexto, { color: g ? COLORS.inkFg : COLORS.textSecondary }]}>
                {f.result ?? '—'} {f.runs_for}-{f.runs_against}
              </Text>
            </View>
            <Text style={styles.linea} numberOfLines={2}>
              {f.line}
            </Text>
            <Text style={styles.flecha}>›</Text>
          </Pressable>
        );
      })}
      {!todas && filas.length > VISIBLES && (
        <Pressable
          onPress={() => setTodas(true)}
          style={({ pressed }) => [styles.verTodos, pressed && styles.presionado]}
          accessibilityRole="button"
        >
          <Text style={styles.verTodosTexto}>Ver los {filas.length} juegos</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lista: {
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  presionado: { backgroundColor: COLORS.bgRaised },
  fecha: { width: 78 },
  fechaTexto: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  rival: { fontSize: 11, color: COLORS.textSecondary },
  resultado: { minWidth: 58, height: 28, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  ganado: { backgroundColor: COLORS.ink },
  perdido: { borderWidth: 1, borderColor: COLORS.border },
  // Bebas sin fontWeight (ver FONTS).
  resultadoTexto: { fontFamily: FONTS.display, fontSize: 17, letterSpacing: 0.3 },
  linea: { flex: 1, fontSize: 13, color: COLORS.textPrimary, fontVariant: ['tabular-nums'] },
  flecha: { fontSize: 18, color: COLORS.textSecondary },
  verTodos: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  verTodosTexto: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
});
