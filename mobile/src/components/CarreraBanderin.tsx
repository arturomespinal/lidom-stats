import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { COLORS, TEAM_STYLES } from '../constants';
import { marcasRedondas } from '../formato';
import type { RaceSeries } from '../types';

const ALTO = 220;
const M = { izq: 30, der: 60, arriba: 16, abajo: 24 };
// 3.0:1 sobre blanco: el mínimo para una marca gráfica. Contexto, no dato.
const RESTO = '#8A96A9';

function signo(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/**
 * La carrera por el banderín: juegos sobre .500 de los seis, partido a
 * partido, con el equipo de la ficha resaltado y los otros cinco de contexto.
 *
 * - **Un solo color con significado.** Los seis en sus colores serían seis
 *   rojos-magentas-azules imposibles de separar (Toros y Gigantes están a ΔE
 *   7.4). El equipo va en su tinta, 3 px; el resto en gris, 1.5 px.
 * - **Cada línea lleva su código al final.** Así se sabe quién es quién sin
 *   leyenda de colores: el color nunca identifica solo.
 * - **La línea de .500 es la referencia**, sólida y recesiva. Arriba, más
 *   ganados que perdidos.
 * - **El pico del equipo va marcado** con su récord de ese momento: es el
 *   punto del que habla el titular.
 */
export default function CarreraBanderin({ carrera, equipo }: { carrera: RaceSeries[]; equipo: string }) {
  const [ancho, setAncho] = useState(0);
  const propia = carrera.find(c => c.team_code === equipo);
  if (!propia || propia.series.length < 3) return null;

  const tinta = TEAM_STYLES[equipo]?.text ?? COLORS.ink;
  const todos = carrera.flatMap(c => c.series);
  const hi = Math.max(...todos, 1) + 1;
  const lo = Math.min(...todos, -1) - 1;
  const n = Math.max(...carrera.map(c => c.series.length - 1));
  const pw = Math.max(ancho - M.izq - M.der, 1);
  const ph = ALTO - M.arriba - M.abajo;
  const X = (g: number) => M.izq + (g / n) * pw;
  const Y = (v: number) => M.arriba + ((hi - v) / (hi - lo)) * ph;

  const pico = Math.max(...propia.series);
  const ip = propia.series.indexOf(pico);
  const g = (ip + pico) / 2;
  const p = (ip - pico) / 2;

  // Etiquetas al final, separadas al menos 12 px para que no se pisen: se
  // ordenan por altura y se empujan hacia abajo cuando chocan.
  const etiquetas = carrera
    .map(c => ({ code: c.team_code, fin: c.series[c.series.length - 1], x: X(c.series.length - 1), y: Y(c.series[c.series.length - 1]) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < etiquetas.length; k++) {
    if (etiquetas[k].y - etiquetas[k - 1].y < 12) etiquetas[k].y = etiquetas[k - 1].y + 12;
  }

  // Marcas redondas (−5, 0, +5…) y el cero siempre: es la línea de .500.
  const ticks = Array.from(new Set([...marcasRedondas(lo, hi, 5), 0])).sort((a, b) => b - a);
  const orden = [...carrera.filter(c => c.team_code !== equipo), propia];

  return (
    <View style={styles.tarjeta}>
      <View style={styles.leyenda}>
        <View style={styles.leyendaItem}>
          <View style={[styles.muestra, { height: 3, backgroundColor: tinta }]} />
          <Text style={styles.leyendaTexto}>{equipo}</Text>
        </View>
        <View style={styles.leyendaItem}>
          <View style={[styles.muestra, { height: 2, backgroundColor: RESTO }]} />
          <Text style={styles.leyendaTexto}>Resto de la liga</Text>
        </View>
      </View>
      <View
        onLayout={e => setAncho(e.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={
          `Juegos sobre .500 partido a partido. ${equipo} llegó a ${g}-${p} y terminó en ${signo(propia.series[propia.series.length - 1])}. ` +
          etiquetas.map(e => `${e.code} ${signo(e.fin)}`).join(', ')
        }
      >
        {ancho > 0 && (
          <Svg width={ancho} height={ALTO}>
            {ticks.map(t => (
              <React.Fragment key={t}>
                <Line
                  x1={M.izq}
                  x2={M.izq + pw}
                  y1={Y(t)}
                  y2={Y(t)}
                  stroke={t === 0 ? '#9AA6B8' : COLORS.borderSoft}
                  strokeWidth={1}
                />
                <SvgText x={M.izq - 6} y={Y(t) + 3.5} fontSize={10} fill={COLORS.textSecondary} textAnchor="end">
                  {t === 0 ? '.500' : signo(t)}
                </SvgText>
              </React.Fragment>
            ))}
            {[10, 20, 30, 40, 50].filter(x => x <= n).map(x => (
              <SvgText key={x} x={X(x)} y={ALTO - 6} fontSize={10} fill={COLORS.textSecondary} textAnchor="middle">
                {x}
              </SvgText>
            ))}
            {orden.map(c => (
              <Polyline
                key={c.team_code}
                points={c.series.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}
                fill="none"
                stroke={c.team_code === equipo ? tinta : RESTO}
                strokeWidth={c.team_code === equipo ? 3 : 1.5}
                strokeLinejoin="round"
              />
            ))}
            {pico > 0 && (
              <>
                <Circle cx={X(ip)} cy={Y(pico)} r={4.5} fill={tinta} stroke="#FFFFFF" strokeWidth={2} />
                <SvgText x={X(ip)} y={Y(pico) - 9} fontSize={12} fontWeight="700" fill={tinta} textAnchor="middle">
                  {`${g}-${p}`}
                </SvgText>
              </>
            )}
            {etiquetas.map(e => (
              <SvgText
                key={e.code}
                x={e.x + 6}
                y={e.y + 4}
                fontSize={e.code === equipo ? 12 : 11}
                fontWeight={e.code === equipo ? '700' : '400'}
                fill={e.code === equipo ? tinta : COLORS.textSecondary}
              >
                {`${e.code} ${signo(e.fin)}`}
              </SvgText>
            ))}
          </Svg>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    marginHorizontal: 16,
    padding: 12,
    gap: 8,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
  leyenda: { flexDirection: 'row', gap: 16 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muestra: { width: 16 },
  leyendaTexto: { fontSize: 11, color: COLORS.textSupport },
});
