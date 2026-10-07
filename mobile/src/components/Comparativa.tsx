import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants';
import { TeamDetail, TeamTotals } from '../types';
import TeamBadge from './TeamBadge';

/**
 * Equipo contra equipo: barras enfrentadas, el visitante a la izquierda y el
 * local a la derecha, como en el marcador. Igual que en la web.
 *
 * El color no dice de qué equipo es cada barra —eso lo dice el lado, con su
 * código arriba— sino quién va adelante en esa fila: la barra mayor en tinta,
 * la otra en gris. Seis colores de club serían tres rojos indistinguibles.
 */

const FILAS: { clave: keyof TeamTotals; etiqueta: string }[] = [
  { clave: 'hits', etiqueta: 'Hits' },
  { clave: 'home_runs', etiqueta: 'Jonrones' },
  { clave: 'walks', etiqueta: 'Boletos' },
  { clave: 'strikeouts', etiqueta: 'Ponches' },
  { clave: 'left_on_base', etiqueta: 'Dejados en base' },
  { clave: 'pitches', etiqueta: 'Lanzamientos' },
];

function Barra({ valor, maximo, gana, lado }: { valor: number; maximo: number; gana: boolean; lado: 'izq' | 'der' }) {
  // Un cero no lleva barra; cualquier otro valor, al menos un trazo visible.
  const ancho = valor > 0 && maximo > 0 ? Math.max(4, (valor / maximo) * 100) : 0;
  return (
    <View style={[styles.carril, lado === 'izq' ? styles.carrilIzq : styles.carrilDer]}>
      {ancho > 0 && (
        <View
          style={[
            styles.barra,
            lado === 'izq' ? styles.barraIzq : styles.barraDer,
            { width: `${ancho}%`, backgroundColor: gana ? COLORS.ink : COLORS.border },
          ]}
        />
      )}
    </View>
  );
}

export default function Comparativa({ away, home }: { away: TeamDetail; home: TeamDetail }) {
  if (!away.totals || !home.totals) return null;
  const a = away.totals;
  const h = home.totals;
  const awayCode = away.team_code ?? '—';
  const homeCode = home.team_code ?? '—';
  return (
    <View style={styles.tarjeta}>
      <View style={styles.cabecera}>
        <TeamBadge code={awayCode} size={26} />
        <Text style={styles.titulo}>EQUIPO CONTRA EQUIPO</Text>
        <TeamBadge code={homeCode} size={26} />
      </View>
      {FILAS.map(({ clave, etiqueta }) => {
        const va = a[clave];
        const vh = h[clave];
        const max = Math.max(va, vh);
        return (
          <View
            key={clave}
            style={styles.fila}
            accessible
            accessibilityLabel={`${etiqueta}: ${awayCode} ${va}, ${homeCode} ${vh}`}
          >
            <Text style={[styles.valor, styles.valorIzq]}>{va}</Text>
            <View style={styles.centro}>
              <Text style={styles.etiqueta}>{etiqueta}</Text>
              <View style={styles.barras}>
                <Barra valor={va} maximo={max} gana={va >= vh && va > 0} lado="izq" />
                <Barra valor={vh} maximo={max} gana={vh >= va && vh > 0} lado="der" />
              </View>
            </View>
            <Text style={[styles.valor, styles.valorDer]}>{vh}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  titulo: { color: COLORS.textFaint, fontSize: 10, letterSpacing: 0.6 },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  valor: {
    width: 40,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  valorIzq: { textAlign: 'left' },
  valorDer: { textAlign: 'right' },
  centro: { flex: 1 },
  etiqueta: { color: COLORS.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 4 },
  barras: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  carril: { flex: 1, height: 8, flexDirection: 'row' },
  carrilIzq: { justifyContent: 'flex-end' },
  carrilDer: { justifyContent: 'flex-start' },
  barra: { height: 8 },
  barraIzq: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  barraDer: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
});
