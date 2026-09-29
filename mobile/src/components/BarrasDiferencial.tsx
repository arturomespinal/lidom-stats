import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../constants';
import { conSigno } from '../formato';
import type { TeamSeasonRow } from '../types';

const ALTO = 168;
const M = { arriba: 20, abajo: 22 };

/**
 * El diferencial de carreras de cada temporada, de la más vieja a la más
 * nueva, en barras que suben o bajan desde el cero.
 *
 * La dirección ya dice el signo; el tono lo refuerza (navy arriba, gris
 * abajo) sin cargar juicio de verde y rojo. Etiquetas solo donde importan: la
 * mejor, la peor y la temporada elegida — un número en cada barra sería
 * ruido. La temporada elegida va con la barra más ancha.
 */
export default function BarrasDiferencial({
  historial,
  elegida,
}: {
  historial: TeamSeasonRow[];
  elegida: string;
}) {
  const [ancho, setAncho] = useState(0);
  if (historial.length < 2) return null;
  const filas = [...historial].sort((a, b) => a.season_id.localeCompare(b.season_id));
  const difs = filas.map(f => f.run_diff);
  const hi = Math.max(...difs, 5);
  const lo = Math.min(...difs, -5);
  const ph = ALTO - M.arriba - M.abajo;
  const Y = (v: number) => M.arriba + ((hi - v) / (hi - lo)) * ph;
  const paso = ancho / filas.length;
  const mejor = filas.reduce((a, b) => (b.run_diff > a.run_diff ? b : a));
  const peor = filas.reduce((a, b) => (b.run_diff < a.run_diff ? b : a));
  const marcadas = new Set([mejor.season_id, peor.season_id, elegida]);

  return (
    <View
      style={styles.tarjeta}
      accessible
      accessibilityLabel={
        `Diferencial de carreras por temporada. La mejor, ${conSigno(mejor.run_diff)} en ${mejor.season_id}; ` +
        `la peor, ${conSigno(peor.run_diff)} en ${peor.season_id}.`
      }
    >
      <View onLayout={e => setAncho(e.nativeEvent.layout.width)}>
        {ancho > 0 && (
          <Svg width={ancho} height={ALTO}>
            {filas.map((f, i) => {
              const sel = f.season_id === elegida;
              const bw = paso * (sel ? 0.78 : 0.56);
              const x = i * paso + (paso - bw) / 2;
              const y0 = Math.min(Y(0), Y(f.run_diff));
              const h = Math.max(Math.abs(Y(f.run_diff) - Y(0)), 1);
              return (
                <React.Fragment key={f.season_id}>
                  <Rect x={x} y={y0} width={bw} height={h} rx={2} fill={f.run_diff > 0 ? COLORS.ink : '#9AA6B8'} />
                  {marcadas.has(f.season_id) && (
                    <SvgText
                      x={x + bw / 2}
                      y={f.run_diff >= 0 ? Y(f.run_diff) - 5 : Y(f.run_diff) + 13}
                      fontSize={11}
                      fontWeight="700"
                      fill={COLORS.textPrimary}
                      textAnchor="middle"
                    >
                      {conSigno(f.run_diff)}
                    </SvgText>
                  )}
                </React.Fragment>
              );
            })}
            <Line x1={0} x2={ancho} y1={Y(0)} y2={Y(0)} stroke="#9AA6B8" strokeWidth={1} />
            <SvgText x={0} y={ALTO - 4} fontSize={10} fill={COLORS.textSecondary}>
              {filas[0].season_id}
            </SvgText>
            <SvgText x={ancho} y={ALTO - 4} fontSize={10} fill={COLORS.textSecondary} textAnchor="end">
              {filas[filas.length - 1].season_id}
            </SvgText>
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
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
});
