import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS, TEAM_STYLES } from '../constants';
import { marcasRedondas, pct3 } from '../formato';
import type { PlayerCurve } from '../types';

const ALTO = 200;
const M = { izq: 34, der: 44, arriba: 12, abajo: 38 };
const LIGA = '#7A879B'; // 3.6:1 sobre blanco: se distingue sin competir

/**
 * La carrera en una curva: su OPS (o su efectividad) temporada a temporada
 * contra el promedio de la liga.
 *
 * - **El eje X son SUS temporadas**, de la primera a la última, no las 14 de
 *   la base: un novato con dos años no debería ser una curva comprimida en
 *   una esquina.
 * - **La línea se corta donde no jugó.** Unir 2013-14 con 2016-17 inventaría
 *   dos temporadas que no existen.
 * - **Punto hueco = muestra chica** (menos de 50 AP o 10 entradas). Dibujado
 *   lleno, un 1.019 en 27 turnos pesaría lo mismo que una temporada entera.
 * - **Las épocas por equipo van de fondo**, con el código escrito debajo: el
 *   color del club nunca identifica solo.
 * - **En efectividad el eje va al revés**: más arriba es mejor, igual que en
 *   OPS, para que "subir" signifique lo mismo en las dos fichas.
 */
export default function CurvaCarrera({
  curva,
  equipoPorTemporada,
}: {
  curva: PlayerCurve;
  /** El equipo de más volumen en cada temporada: pinta las épocas. */
  equipoPorTemporada: Record<string, string>;
}) {
  const [ancho, setAncho] = useState(0);
  const esEra = curva.stat === 'era';
  const puntos = curva.points;
  if (puntos.length < 2) return null;

  // Temporadas del jugador, sin huecos, de la primera a la última.
  const primera = Number(puntos[0].season_id.slice(0, 4));
  const ultima = Number(puntos[puntos.length - 1].season_id.slice(0, 4));
  const temporadas: string[] = [];
  for (let a = primera; a <= ultima; a++) temporadas.push(`${a}-${String(a + 1).slice(2)}`);
  const idx = (s: string) => temporadas.indexOf(s);

  const liga = curva.league.filter(l => idx(l.season_id) >= 0);
  const valores = [...puntos.map(p => p.value), ...liga.map(l => l.value)];
  let lo = Math.min(...valores);
  let hi = Math.max(...valores);
  const pad = (hi - lo) * 0.12 || 0.05;
  lo -= pad;
  hi += pad;

  const pw = Math.max(ancho - M.izq - M.der, 1);
  const ph = ALTO - M.arriba - M.abajo;
  const X = (i: number) => M.izq + (temporadas.length === 1 ? pw / 2 : (i * pw) / (temporadas.length - 1));
  // OPS: alto arriba. EFE: bajo arriba.
  const Y = (v: number) => M.arriba + (esEra ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)) * ph;

  // Tramos continuos: se corta donde falta una temporada.
  const tramos: { i: number; v: number }[][] = [];
  let actual: { i: number; v: number }[] = [];
  let anterior = -2;
  for (const p of puntos) {
    const i = idx(p.season_id);
    if (i !== anterior + 1 && actual.length) {
      tramos.push(actual);
      actual = [];
    }
    actual.push({ i, v: p.value });
    anterior = i;
  }
  if (actual.length) tramos.push(actual);

  // Épocas: temporadas seguidas con el mismo equipo.
  const epocas: { code: string; a: number; b: number }[] = [];
  temporadas.forEach((s, i) => {
    const code = equipoPorTemporada[s];
    if (!code) return;
    const u = epocas[epocas.length - 1];
    if (u && u.code === code && u.b === i - 1) u.b = i;
    else epocas.push({ code, a: i, b: i });
  });
  const medio = temporadas.length > 1 ? pw / (temporadas.length - 1) / 2 : pw / 2;

  const fmt = (v: number) => (esEra ? v.toFixed(2) : pct3(v));
  const ticks = marcasRedondas(lo, hi, 4);
  const ultimo = puntos[puntos.length - 1];
  const ligaUltima = liga[liga.length - 1];
  // Primera, del medio y última, sin repetir: con dos temporadas "la del
  // medio" es la primera, y dos etiquetas con la misma llave hacían que React
  // avisara ("two children with the same key") en cada render.
  const etiquetasX = Array.from(
    new Set([0, Math.floor((temporadas.length - 1) / 2), temporadas.length - 1]),
  );

  return (
    <View style={styles.tarjeta}>
      <View style={styles.leyenda}>
        <View style={styles.leyendaItem}>
          <View style={[styles.muestra, { height: 3, backgroundColor: COLORS.ink }]} />
          <Text style={styles.leyendaTexto}>El jugador</Text>
        </View>
        <View style={styles.leyendaItem}>
          <View style={[styles.muestra, { height: 2, backgroundColor: LIGA }]} />
          <Text style={styles.leyendaTexto}>Promedio de la liga</Text>
        </View>
      </View>
      <View
        onLayout={e => setAncho(e.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={
          `${esEra ? 'Efectividad' : 'OPS'} por temporada contra la liga. ` +
          `Última: ${fmt(ultimo.value)} en ${ultimo.season_id}.` +
          (curva.headline ? ` ${curva.headline}` : '')
        }
      >
        {ancho > 0 && (
          <Svg width={ancho} height={ALTO}>
            {epocas.map((e, k) => {
              const x0 = X(e.a) - medio + 1;
              const x1 = X(e.b) + medio - 1;
              const st = TEAM_STYLES[e.code];
              return (
                <React.Fragment key={k}>
                  <Rect x={x0} y={M.arriba} width={x1 - x0} height={ph} fill={st?.primary ?? COLORS.border} opacity={0.1} />
                  {x1 - x0 >= 26 && (
                    <SvgText
                      x={(x0 + x1) / 2}
                      y={ALTO - 4}
                      fontSize={13}
                      fontFamily="BebasNeue_400Regular"
                      fill={st?.text ?? COLORS.textSecondary}
                      textAnchor="middle"
                    >
                      {e.code}
                    </SvgText>
                  )}
                </React.Fragment>
              );
            })}
            {ticks.map((t, k) => (
              <React.Fragment key={k}>
                <Line x1={M.izq} x2={M.izq + pw} y1={Y(t)} y2={Y(t)} stroke={COLORS.borderSoft} strokeWidth={1} />
                <SvgText x={M.izq - 6} y={Y(t) + 3.5} fontSize={10} fill={COLORS.textSecondary} textAnchor="end">
                  {fmt(t)}
                </SvgText>
              </React.Fragment>
            ))}
            {etiquetasX.map(i => (
              <SvgText key={i} x={X(i)} y={M.arriba + ph + 14} fontSize={10} fill={COLORS.textSecondary} textAnchor="middle">
                {temporadas[i]}
              </SvgText>
            ))}
            {liga.length > 1 && (
              <Polyline
                points={liga.map(l => `${X(idx(l.season_id))},${Y(l.value)}`).join(' ')}
                fill="none"
                stroke={LIGA}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            )}
            {tramos
              .filter(t => t.length > 1)
              .map((t, k) => (
                <Polyline
                  key={k}
                  points={t.map(p => `${X(p.i)},${Y(p.v)}`).join(' ')}
                  fill="none"
                  stroke={COLORS.ink}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              ))}
            {puntos.map(p => {
              const es = p === ultimo;
              return p.small_sample ? (
                <Circle key={p.season_id} cx={X(idx(p.season_id))} cy={Y(p.value)} r={3.5} fill="#FFFFFF" stroke={COLORS.ink} strokeWidth={1.8} />
              ) : (
                <Circle
                  key={p.season_id}
                  cx={X(idx(p.season_id))}
                  cy={Y(p.value)}
                  r={es ? 5 : 3.5}
                  fill={COLORS.ink}
                  stroke="#FFFFFF"
                  strokeWidth={es ? 2 : 1.2}
                />
              );
            })}
            <SvgText x={X(idx(ultimo.season_id)) + 8} y={Y(ultimo.value) + 4} fontSize={12} fontWeight="700" fill={COLORS.textPrimary}>
              {fmt(ultimo.value)}
            </SvgText>
            {ligaUltima && Math.abs(Y(ligaUltima.value) - Y(ultimo.value)) > 14 && (
              <SvgText x={X(idx(ligaUltima.season_id)) + 8} y={Y(ligaUltima.value) + 4} fontSize={11} fill={COLORS.textSecondary}>
                Liga
              </SvgText>
            )}
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
