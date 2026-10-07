import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../constants';
import { AtBat, PitchLine } from '../types';

/**
 * La zona de strike con los lanzamientos del turno, vista del receptor (como
 * la transmisión): pX positivo es a la derecha del receptor. La misma que la
 * web (`frontend/components/game/ZonaStrike.tsx`), con las mismas cuentas.
 *
 * Unidades en pies, como las manda la MLB: el plato mide 17 pulgadas y una
 * bola que roza el borde ya es strike, así que la zona va de −0.83 a 0.83
 * (medio plato más el radio de la bola). Arriba y abajo, la del bateador
 * (`zone_top`/`zone_bottom`), que cambia con su estatura.
 *
 * El tipo de cada lanzamiento no va solo en el color: strike relleno de
 * navy, bola hueca, en juego en ocre (el mismo de las bases ocupadas). Cada
 * uno lleva su número, y la lista de abajo lo dice en texto.
 */

const ANCHO = 168;
const ALTO = 200;
// La ventana que se dibuja, en pies.
const X_MIN = -1.9;
const X_MAX = 1.9;
const Z_MIN = 0.4;
const Z_MAX = 4.6;
const MEDIO_PLATO = 0.83;

const x = (px: number) => ((px - X_MIN) / (X_MAX - X_MIN)) * ANCHO;
const y = (pz: number) => ALTO - ((pz - Z_MIN) / (Z_MAX - Z_MIN)) * ALTO;
const recorta = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const ESTILO: Record<PitchLine['kind'], { fill: string; stroke: string; texto: string; nombre: string }> = {
  strike: { fill: COLORS.ink, stroke: COLORS.ink, texto: COLORS.inkFg, nombre: 'Strike' },
  bola: { fill: COLORS.bgCard, stroke: COLORS.ink, texto: COLORS.ink, nombre: 'Bola' },
  en_juego: { fill: COLORS.warning, stroke: COLORS.warning, texto: COLORS.inkFg, nombre: 'En juego' },
};

export default function ZonaStrike({ turno }: { turno: AtBat }) {
  const zx0 = x(-MEDIO_PLATO);
  const zx1 = x(MEDIO_PLATO);
  const zy0 = y(turno.zone_top);
  const zy1 = y(turno.zone_bottom);
  const ultimo = turno.pitches[turno.pitches.length - 1];
  const conPosicion = turno.pitches.filter(p => p.px != null && p.pz != null);

  const resumen = turno.pitches
    .map(
      p =>
        `${p.number}: ${p.type_es ?? 'lanzamiento'}${
          p.speed_mph ? ` de ${Math.round(p.speed_mph)} millas` : ''
        }, ${p.call_es ?? ''}`,
    )
    .join('; ');

  return (
    <View style={styles.caja}>
      <View
        style={styles.zona}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Zona de strike, vista del receptor. ${resumen || 'Sin lanzamientos todavía'}.`}
      >
        <Svg width={ANCHO} height={ALTO}>
          <Rect x={0} y={0} width={ANCHO} height={ALTO} rx={8} fill={COLORS.bgSunken} />
          {/* La zona, en tercios: referencia, no dato. */}
          <Rect
            x={zx0}
            y={zy0}
            width={zx1 - zx0}
            height={zy1 - zy0}
            fill={COLORS.bgCard}
            stroke={COLORS.textSupport}
            strokeWidth={1.5}
          />
          {[1, 2].map(i => (
            <G key={i}>
              <Line
                x1={zx0 + ((zx1 - zx0) * i) / 3}
                x2={zx0 + ((zx1 - zx0) * i) / 3}
                y1={zy0}
                y2={zy1}
                stroke={COLORS.border}
                strokeWidth={1}
              />
              <Line
                x1={zx0}
                x2={zx1}
                y1={zy0 + ((zy1 - zy0) * i) / 3}
                y2={zy0 + ((zy1 - zy0) * i) / 3}
                stroke={COLORS.border}
                strokeWidth={1}
              />
            </G>
          ))}
          {/* El plato, abajo, para orientar. */}
          <Polygon
            points={`${zx0},${ALTO - 14} ${zx1},${ALTO - 14} ${zx1},${ALTO - 9} ${(zx0 + zx1) / 2},${ALTO - 3} ${zx0},${ALTO - 9}`}
            fill={COLORS.border}
          />
          {conPosicion.map(p => {
            const e = ESTILO[p.kind];
            const cx = recorta(x(p.px as number), 9, ANCHO - 9);
            const cy = recorta(y(p.pz as number), 9, ALTO - 18);
            return (
              <G key={p.number}>
                {/* El último lleva un anillo: es el que se acaba de ver. */}
                {p === ultimo && (
                  <Circle cx={cx} cy={cy} r={12.5} fill="none" stroke={COLORS.ink} strokeWidth={1.5} />
                )}
                <Circle cx={cx} cy={cy} r={8.5} fill={e.fill} stroke={e.stroke} strokeWidth={1.5} />
                <SvgText x={cx} y={cy + 3.5} textAnchor="middle" fontSize={10} fontWeight="700" fill={e.texto}>
                  {String(p.number)}
                </SvgText>
              </G>
            );
          })}
        </Svg>
        <View style={styles.leyenda}>
          {(['strike', 'bola', 'en_juego'] as const).map(k => (
            <View key={k} style={styles.leyendaItem}>
              <View
                style={[styles.leyendaPunto, { backgroundColor: ESTILO[k].fill, borderColor: ESTILO[k].stroke }]}
              />
              <Text style={styles.leyendaTexto}>{ESTILO[k].nombre}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* La lista va debajo: al lado de la zona, en un teléfono "Curva"
          quedaba en "C…", como en la web. */}
      <View style={styles.lista}>
        <Text style={styles.etiqueta} numberOfLines={1}>
          {turno.is_current ? 'ESTE TURNO' : `TURNO ANTERIOR · ${(turno.batter.name ?? '').toUpperCase()}`}
        </Text>
        {turno.pitches.length === 0 ? (
          <Text style={styles.vacio}>Sin lanzamientos todavía.</Text>
        ) : (
          [...turno.pitches].reverse().map(p => (
            <View key={p.number} style={styles.fila}>
              <Text style={styles.num}>{p.number}</Text>
              <Text style={styles.tipo} numberOfLines={1}>
                {p.type_es ?? '—'}
                {p.speed_mph != null && <Text style={styles.tenue}> · {Math.round(p.speed_mph)} mph</Text>}
              </Text>
              <Text style={styles.canto} numberOfLines={1}>
                {p.call_es}
              </Text>
              <Text style={styles.cuenta}>
                {p.balls}-{p.strikes}
              </Text>
            </View>
          ))
        )}
        {!turno.is_current && !!turno.result_es && <Text style={styles.resultado}>{turno.result_es}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { gap: 12 },
  zona: { alignSelf: 'center', alignItems: 'center' },
  leyenda: { flexDirection: 'row', gap: 12, marginTop: 6 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leyendaPunto: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  leyendaTexto: { color: COLORS.textFaint, fontSize: 10 },

  lista: { gap: 5 },
  etiqueta: { color: COLORS.textFaint, fontSize: 10, letterSpacing: 0.6, marginBottom: 1 },
  vacio: { color: COLORS.textSecondary, fontSize: 12 },
  fila: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  num: {
    width: 18,
    textAlign: 'right',
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tipo: { flex: 1, minWidth: 0, color: COLORS.textSupport, fontSize: 12 },
  tenue: { color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  canto: { color: COLORS.textSecondary, fontSize: 12, maxWidth: 130 },
  cuenta: {
    width: 28,
    textAlign: 'right',
    color: COLORS.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  resultado: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '600', marginTop: 4 },
});
