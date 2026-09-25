import React, { useMemo, useState } from 'react';
import {
  AccessibilityActionEvent,
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { ClipPath, Circle, Defs, G, Line, Path, Rect } from 'react-native-svg';
import { COLORS, FONTS, TEAM_STYLES } from '../constants';
import { WinProbPoint } from '../types';

interface Props {
  points: WinProbPoint[];
  /** La de ahora mismo. `null` cuando el juego terminó. */
  current: number | null;
  homeCode: string;
  awayCode: string;
  /** El titular del juego terminado, compuesto por el backend. */
  headline: string | null;
}

/**
 * La franja de probabilidad de ganar, versión teléfono.
 *
 * La forma es la MISMA que en la web (frontend/components/game/WinProbBand.tsx)
 * y por las mismas razones —una serie en tinta contra el 50%, el área teñida
 * al 16% del lado del favorito, el local siempre arriba, el eje en medias
 * entradas—. Lo que cambia es cómo se toca.
 *
 * ── El dedo tapa la gráfica ───────────────────────────────────────────────
 * En la web el tooltip flota junto al cursor. Aquí el dedo está ENCIMA de la
 * curva, así que un tooltip flotante quedaría debajo de la yema. La lectura
 * va arriba, en la fila de la leyenda, que el pulgar no tapa: al barrer, los
 * dos porcentajes de la leyenda pasan a ser los del momento tocado, y la
 * etiqueta "Prob. de ganar" pasa a decir "Baja del 3ro · 0–4".
 *
 * Al soltar vuelve al valor de ahora. Es el gesto de las gráficas de bolsa del
 * teléfono: se barre para mirar el pasado y se suelta para volver al presente.
 *
 * ── Dentro de un ScrollView ───────────────────────────────────────────────
 * La franja toma el toque al empezar, pero cede si el ScrollView lo pide
 * (`onResponderTerminationRequest` → true). Un dedo que baja en vertical
 * sobre la gráfica termina desplazando la pantalla, que es lo que se espera;
 * uno que barre en horizontal se queda en la curva.
 *
 * ── Sin estirar el SVG ────────────────────────────────────────────────────
 * La web estira un viewBox y dibuja los puntos en HTML para que no salgan
 * ovalados. Aquí se mide el ancho real con onLayout y se dibuja en píxeles,
 * así que el punto puede ser un <Circle> dentro del mismo SVG.
 */

const ALTO = 112;
const LAVADO = 0.16;
// Margen interno arriba y abajo. Un juego terminado acaba en 100% o 0%, justo
// en el borde, y la gráfica recorta lo que sale (overflow hidden por las
// esquinas redondeadas): el punto final quedaba cortado a la mitad. 7 = radio
// del punto (5) + su anillo (2).
const MARGEN = 7;

/** Posición de cada punto en medias entradas: 0 = alta del 1ro. */
function posicionesX(points: WinProbPoint[]): number[] {
  const porMitad = new Map<number, number[]>();
  points.forEach((p, i) => {
    const mitad = (p.inning - 1) * 2 + (p.is_top ? 0 : 1);
    porMitad.set(mitad, [...(porMitad.get(mitad) ?? []), i]);
  });
  const xs = new Array<number>(points.length);
  porMitad.forEach((indices, mitad) => {
    indices.forEach((i, j) => {
      xs[i] = mitad + j / indices.length;
    });
  });
  return xs;
}

/**
 * Los dos porcentajes del par, que SIEMPRE suman 100.
 *
 * Redondear cada uno por su lado da 89% + 12% = 101% cuando la probabilidad
 * es 0.885 (88.5 → 89 y 11.5 → 12). En un resultado con dos salidas eso se
 * lee como un error, así que el visitante es el complemento del local, no un
 * segundo redondeo. Mismo cálculo que en la web.
 */
function par(wp: number): { local: string; visita: string } {
  const n = Math.round(wp * 100);
  return { local: `${n}%`, visita: `${100 - n}%` };
}

export default function WinProbBand({ points, current, homeCode, awayCode, headline }: Props) {
  const [ancho, setAncho] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [verDatos, setVerDatos] = useState(false);

  const xs = useMemo(() => posicionesX(points), [points]);
  const dominio = Math.max(18, Math.max(...xs.map(Math.floor)) + 1);

  const geo = useMemo(() => {
    if (!ancho) return null;
    const X = (x: number) => (x / dominio) * ancho;
    const Y = (wp: number) => MARGEN + (1 - wp) * (ALTO - 2 * MARGEN);
    const coords = points.map((p, i) => [X(xs[i]), Y(p.wp)] as const);
    const linea = 'M' + coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
    const mitad = ALTO / 2;
    const area = `${linea} L${coords[coords.length - 1][0].toFixed(1)},${mitad} L${coords[0][0].toFixed(1)},${mitad} Z`;
    return { coords, linea, area, mitad };
  }, [ancho, dominio, points, xs]);

  const home = TEAM_STYLES[homeCode]?.primary ?? COLORS.textSecondary;
  const away = TEAM_STYLES[awayCode]?.primary ?? COLORS.textSecondary;

  const ultimo = points[points.length - 1];
  const ahora = current ?? ultimo.wp;
  const marcado = sel ?? points.length - 1;
  const p = points[marcado];
  const wpMostrado = sel === null ? ahora : p.wp;

  function elegir(e: GestureResponderEvent) {
    if (!ancho) return;
    const x = (e.nativeEvent.locationX / ancho) * dominio;
    let mejor = 0;
    xs.forEach((xi, i) => {
      if (Math.abs(xi - x) < Math.abs(xs[mejor] - x)) mejor = i;
    });
    setSel(mejor);
  }

  // Lector de pantalla: la franja es "ajustable". Deslizar arriba o abajo con
  // un dedo recorre los momentos, igual que las flechas en la web.
  function accion(e: AccessibilityActionEvent) {
    const n = points.length;
    const actual = sel ?? n - 1;
    if (e.nativeEvent.actionName === 'increment') setSel(Math.min(n - 1, actual + 1));
    if (e.nativeEvent.actionName === 'decrement') setSel(Math.max(0, actual - 1));
  }

  const lectura = `${p.label}: ${awayCode} ${p.away}, ${homeCode} ${p.home}. ${homeCode} ${par(p.wp).local}, ${awayCode} ${par(p.wp).visita}.`;

  return (
    <View style={styles.wrap}>
      {/* La lectura va ARRIBA: es lo único que el pulgar no tapa. */}
      <View style={styles.leyenda}>
        <Text style={styles.titulo} numberOfLines={1}>
          {sel === null ? 'PROB. DE GANAR' : `${p.label.toUpperCase()} · ${p.away}–${p.home}`}
        </Text>
        <View style={styles.valor}>
          <View style={[styles.cuadro, { backgroundColor: away }]} />
          <Text style={styles.codigo}>{awayCode}</Text>
          <Text style={styles.pct}>{par(wpMostrado).visita}</Text>
        </View>
        <View style={styles.valor}>
          <View style={[styles.cuadro, { backgroundColor: home }]} />
          <Text style={styles.codigo}>{homeCode}</Text>
          <Text style={styles.pct}>{par(wpMostrado).local}</Text>
        </View>
      </View>

      <View
        style={styles.grafica}
        onLayout={(e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={elegir}
        onResponderMove={elegir}
        onResponderRelease={() => setSel(null)}
        onResponderTerminationRequest={() => true}
        onResponderTerminate={() => setSel(null)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Probabilidad de ganar. ${homeCode} arriba, ${awayCode} abajo.`}
        accessibilityValue={{ text: sel === null ? `${homeCode} ${par(ahora).local}` : lectura }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={accion}
      >
        {/* Todo lo dibujado va en una capa que no recibe toques. Sin esto,
            un dedo que cae sobre la etiqueta "EST" o sobre el SVG hace que
            locationX se mida respecto a ESE hijo y no a la gráfica, y el
            momento elegido se corre. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {geo && (
          <Svg width={ancho} height={ALTO}>
            <Defs>
              <ClipPath id="arriba">
                <Rect x={0} y={0} width={ancho} height={geo.mitad} />
              </ClipPath>
              <ClipPath id="abajo">
                <Rect x={0} y={geo.mitad} width={ancho} height={geo.mitad} />
              </ClipPath>
            </Defs>

            <G clipPath="url(#arriba)">
              <Path d={geo.area} fill={home} fillOpacity={LAVADO} />
            </G>
            <G clipPath="url(#abajo)">
              <Path d={geo.area} fill={away} fillOpacity={LAVADO} />
            </G>

            {/* El 50%: sólido y recesivo. Punteado es ruido. */}
            <Line x1={0} y1={geo.mitad} x2={ancho} y2={geo.mitad} stroke={COLORS.border} strokeWidth={1} />

            {sel !== null && (
              <Line
                x1={geo.coords[marcado][0]}
                y1={0}
                x2={geo.coords[marcado][0]}
                y2={ALTO}
                stroke={COLORS.textSecondary}
                strokeOpacity={0.5}
                strokeWidth={1}
              />
            )}

            <Path
              d={geo.linea}
              fill="none"
              stroke={COLORS.textPrimary}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Anillo del color de la superficie, para que el punto se lea
                encima de la curva. */}
            <Circle
              cx={geo.coords[marcado][0]}
              cy={geo.coords[marcado][1]}
              r={5}
              fill={COLORS.textPrimary}
              stroke={COLORS.bgSunken}
              strokeWidth={2}
            />
          </Svg>
        )}

        <Text style={[styles.lado, styles.ladoArriba]}>{homeCode}</Text>
        <Text style={[styles.lado, styles.ladoAbajo]}>{awayCode}</Text>
        </View>
      </View>

      {/* Eje: números de entrada, no ordinales — un número no hay que
          traducirlo. */}
      <View style={styles.eje}>
        {Array.from({ length: Math.ceil(dominio / 2) }, (_, k) => k + 1)
          .filter((n) => n % 2 === 1 || n > 9)
          .map((n) => (
            <Text
              key={n}
              style={[styles.tick, { left: `${(((n - 1) * 2) / dominio) * 100}%` }]}
            >
              {n}
            </Text>
          ))}
      </View>

      {headline && <Text style={styles.headline}>{headline}</Text>}

      {/* La tabla: el barrido mejora, nunca es la única puerta al dato. El
          botón mide 44 px de alto aunque el texto sea de 12: es el área que
          el pulgar necesita. */}
      <Pressable
        onPress={() => setVerDatos((v) => !v)}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: verDatos }}
      >
        <Text style={styles.toggleText}>
          {verDatos ? 'Ocultar datos' : `Ver datos (${points.length} momentos)`}
        </Text>
      </Pressable>

      {verDatos && (
        <View>
          <View style={styles.filaCabecera}>
            <Text style={[styles.celdaMomento, styles.cabecera]}>MOMENTO</Text>
            <Text style={[styles.celda, styles.cabecera]}>MARC.</Text>
            <Text style={[styles.celda, styles.cabecera]}>{homeCode}</Text>
            <Text style={[styles.celda, styles.cabecera]}>{awayCode}</Text>
          </View>
          {points.map((q, i) => (
            <View key={i} style={styles.fila}>
              <Text style={styles.celdaMomento}>{q.label}</Text>
              <Text style={styles.celda}>
                {q.away}–{q.home}
              </Text>
              <Text style={[styles.celda, styles.celdaFuerte]}>{par(q.wp).local}</Text>
              <Text style={[styles.celda, styles.celdaFuerte]}>{par(q.wp).visita}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },

  leyenda: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  titulo: {
    flex: 1,
    color: COLORS.textFaint,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '600',
  },
  valor: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cuadro: { width: 10, height: 10, borderRadius: 2 },
  codigo: { color: COLORS.textSupport, fontSize: 15, fontFamily: FONTS.display, letterSpacing: 0.5 },
  pct: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'right',
  },

  grafica: {
    height: ALTO,
    borderRadius: 6,
    backgroundColor: COLORS.bgSunken,
    overflow: 'hidden',
  },
  lado: {
    position: 'absolute',
    left: 8,
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: FONTS.display,
    letterSpacing: 0.6,
  },
  ladoArriba: { top: 6 },
  ladoAbajo: { bottom: 6 },

  eje: { height: 16, marginTop: 4 },
  tick: {
    position: 'absolute',
    color: COLORS.textFaint,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },

  headline: { color: COLORS.textSupport, fontSize: 14, lineHeight: 20, marginTop: 8 },

  toggle: { minHeight: 44, justifyContent: 'center' },
  toggleText: { color: COLORS.textSecondary, fontSize: 12 },

  filaCabecera: { flexDirection: 'row', paddingBottom: 6 },
  cabecera: { color: COLORS.textFaint, fontSize: 10, letterSpacing: 0.8 },
  fila: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  celdaMomento: { flex: 2, color: COLORS.textSupport, fontSize: 12 },
  celda: {
    flex: 1,
    color: COLORS.textSupport,
    fontSize: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  celdaFuerte: { color: COLORS.textPrimary, fontWeight: '600' },
});
