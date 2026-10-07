import React from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Circle, Defs, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../constants';
import { LiveRunners } from '../types';
import { useBasesPintadas } from './BaseDiamond';

/**
 * El terreno visto desde arriba, con los corredores en sus bases y su
 * apellido al lado. Ocupa el lugar del diamante chico en la tarjeta de
 * situación (pedido de Arturo con una captura de SofaScore, 6-oct).
 *
 * Se dibuja en un lienzo fijo de 320×220 y se escala al ancho de la
 * tarjeta; `posicionesCampo()` da las mismas cuentas en puntos para que el
 * corredor de la jugada (Situacion.tsx) corra justo por las bases.
 *
 * Grama, franjas y tierra son fondo, en tonos lavados (`campo*` en
 * constants): encima tienen que leerse las bases y los nombres. Base vacía
 * en blanco; ocupada, en el ocre de siempre.
 */

export const LIENZO_ANCHO = 320;
export const LIENZO_ALTO = 220;

const HOME = { x: 160, y: 206 };
const BASE = 72; // del home a primera, en el lienzo
const D = BASE * Math.SQRT1_2;
const PUNTOS = {
  home: HOME,
  first: { x: HOME.x + D, y: HOME.y - D },
  second: { x: HOME.x, y: HOME.y - 2 * D },
  third: { x: HOME.x - D, y: HOME.y - D },
};
// Las líneas de foul hasta la cerca, y la cerca en arco desde el home.
const CERCA = 196;
const FOUL = CERCA * Math.SQRT1_2;
const ABANICO = `M${HOME.x},${HOME.y} L${HOME.x - FOUL},${HOME.y - FOUL} A${CERCA},${CERCA} 0 0 1 ${HOME.x + FOUL},${HOME.y - FOUL} Z`;
const MONTICULO = { x: HOME.x, y: HOME.y - D };

/** Alto en puntos para un ancho dado. */
export const altoCampo = (ancho: number) => (ancho * LIENZO_ALTO) / LIENZO_ANCHO;

/** El home y las tres bases en puntos, para un ancho dado. */
export function posicionesCampo(ancho: number) {
  const s = ancho / LIENZO_ANCHO;
  const a = (p: { x: number; y: number }) => ({ x: p.x * s, y: p.y * s });
  return { home: a(PUNTOS.home), first: a(PUNTOS.first), second: a(PUNTOS.second), third: a(PUNTOS.third) };
}

/** "Marco Luciano" → "Luciano"; "Ha-Seong Kim" → "Kim". */
const apellido = (nombre: string | null) => (nombre ? nombre.trim().split(/\s+/).slice(-1)[0] : '');

const rombo = (x: number, y: number, r: number) => `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;

export default function Campo({
  runners,
  ancho,
  retrasoLlenado = 0,
}: {
  runners: LiveRunners;
  ancho: number;
  retrasoLlenado?: number;
}) {
  const pintadas = useBasesPintadas(runners, retrasoLlenado);
  const alto = altoCampo(ancho);

  const bases = [
    { clave: 'first' as const, p: PUNTOS.first, nombre: runners.first, dx: 12, dy: 4, ancla: 'start' as const },
    { clave: 'second' as const, p: PUNTOS.second, nombre: runners.second, dx: 0, dy: -12, ancla: 'middle' as const },
    { clave: 'third' as const, p: PUNTOS.third, nombre: runners.third, dx: -12, dy: 4, ancla: 'end' as const },
  ];

  const ocupadas = bases.filter(b => pintadas[b.clave]);
  const lectura =
    ocupadas.length === 0
      ? 'Bases limpias'
      : ocupadas.length === 3
        ? 'Bases llenas'
        : ocupadas
            .map(b => `${b.nombre ?? 'corredor'} en ${b.clave === 'first' ? 'primera' : b.clave === 'second' ? 'segunda' : 'tercera'}`)
            .join(', ');

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={lectura} style={{ width: ancho, height: alto }}>
      <Svg width={ancho} height={alto} viewBox={`0 0 ${LIENZO_ANCHO} ${LIENZO_ALTO}`}>
        <Defs>
          <ClipPath id="abanico">
            <Path d={ABANICO} />
          </ClipPath>
        </Defs>

        <G clipPath="url(#abanico)">
          <Rect x={0} y={0} width={LIENZO_ANCHO} height={LIENZO_ALTO} fill={COLORS.campoPasto} />
          {/* El corte de la grama, en franjas: textura, no dato. */}
          {Array.from({ length: 6 }, (_, i) => (
            <Rect key={i} x={0} y={i * 40} width={LIENZO_ANCHO} height={20} fill={COLORS.campoFranja} />
          ))}
          {/* La tierra del cuadro: hasta un poco detrás de las bases. */}
          <Circle cx={MONTICULO.x} cy={MONTICULO.y} r={BASE + 2} fill={COLORS.campoTierra} />
        </G>

        {/* La grama del cuadro, entre las bases. */}
        <Polygon points={rombo(MONTICULO.x, MONTICULO.y, D - 11)} fill={COLORS.campoPasto} />
        <Circle cx={MONTICULO.x} cy={MONTICULO.y} r={8} fill={COLORS.campoTierra} />
        <Circle cx={HOME.x} cy={HOME.y - 2} r={13} fill={COLORS.campoTierra} />

        {/* Líneas de foul hasta la cerca y el camino de las bases. */}
        <Line x1={HOME.x} y1={HOME.y} x2={HOME.x - FOUL} y2={HOME.y - FOUL} stroke={COLORS.campoLinea} strokeWidth={1.5} />
        <Line x1={HOME.x} y1={HOME.y} x2={HOME.x + FOUL} y2={HOME.y - FOUL} stroke={COLORS.campoLinea} strokeWidth={1.5} />
        <Polygon
          points={`${PUNTOS.home.x},${PUNTOS.home.y} ${PUNTOS.first.x},${PUNTOS.first.y} ${PUNTOS.second.x},${PUNTOS.second.y} ${PUNTOS.third.x},${PUNTOS.third.y}`}
          fill="none"
          stroke={COLORS.campoLinea}
          strokeWidth={1.5}
        />

        {/* El home. */}
        <Polygon
          points={`${HOME.x - 5},${HOME.y - 4} ${HOME.x + 5},${HOME.y - 4} ${HOME.x + 5},${HOME.y} ${HOME.x},${HOME.y + 4} ${HOME.x - 5},${HOME.y}`}
          fill={COLORS.campoLinea}
          stroke={COLORS.textFaint}
          strokeWidth={1}
        />

        {bases.map(b => {
          const on = pintadas[b.clave];
          return (
            <G key={b.clave}>
              <Polygon
                points={rombo(b.p.x, b.p.y, on ? 8 : 6.5)}
                fill={on ? COLORS.warning : COLORS.campoLinea}
                stroke={on ? COLORS.warning : COLORS.textFaint}
                strokeWidth={1}
              />
              {on && !!b.nombre && (
                <SvgText
                  x={b.p.x + b.dx}
                  y={b.p.y + b.dy}
                  textAnchor={b.ancla}
                  fontSize={12}
                  fontWeight="600"
                  fill={COLORS.textPrimary}
                >
                  {apellido(b.nombre)}
                </SvgText>
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
