import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { COLORS, FONTS } from '../constants';
import { anchoBebas, CifraAjustada } from './Ajuste';

const CORTE = 32;

/**
 * La cabecera de las fichas: franja navy a sangre con un plano del color del
 * club en diagonal. Es lo que ocupa el lugar de la foto que no podemos usar
 * (ver la guía legal: ni escudos ni fotos de la MLB).
 *
 * ── Toda letra va sobre el navy, nunca sobre el plano ──────────────────────
 * El plano es solo forma. Blanco sobre el rojo de Escogido da 3.6:1 y sobre el
 * amarillo de Águilas 2:1; sobre el navy, 16.9:1 para los seis. Por eso el
 * plano se queda arriba a la derecha (156 pt de alto) y quien use la cabecera
 * limita su columna de texto al 52% del ancho: medido, es lo que deja libre
 * el borde inclinado del plano en todo su alto.
 *
 * ── La diagonal del borde inferior ─────────────────────────────────────────
 * React Native no tiene `clip-path`. El corte es un triángulo hecho con bordes
 * —el truco clásico: un View de 0×0 con un borde inferior del color de la
 * página y uno izquierdo transparente— pegado abajo. Mide lo que la pantalla,
 * por eso `useWindowDimensions`.
 */
export default function Heroe({
  color,
  marca,
  children,
}: {
  /** El primario del club: pinta el plano. Sin color no hay plano: la
   *  cabecera de un juego es de dos clubes, y pintar uno solo diría que el
   *  juego es suyo. */
  color?: string;
  /** Texto gigante en tono sobre tono sobre el plano (el código del equipo). */
  marca?: string;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.caja}>
      {!!color && (
        <View
          pointerEvents="none"
          style={[styles.plano, { backgroundColor: color }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      )}
      {!!marca && (
        <Text
          style={[styles.marca, medidaMarca(marca)]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {marca}
        </Text>
      )}
      <View style={styles.contenido}>{children}</View>
      <View
        pointerEvents="none"
        style={[styles.corte, { borderLeftWidth: width }]}
      />
    </View>
  );
}

/**
 * El código gigante del plano, entero y dentro del plano.
 *
 * A 150 pt fijos "TOR" medía 175 pt y el plano deja unos 110: la R quedaba
 * cortada por el borde de la pantalla (capturas de Arturo, 30-sep). Ahora el
 * tamaño sale del ancho real del código en Bebas (Ajuste.tsx) contra el ancho
 * que deja el plano, que por la diagonal crece hacia abajo: 80 pt arriba y
 * ~27 pt más por cada 100 de alto. La letra se apoya abajo, donde el plano es
 * más ancho, y su borde superior es el que manda:
 *
 *   ancho(código) + 10 de margen ≤ 80 + 0.267 × (y del borde superior)
 *
 * que despejado da el divisor de abajo. Bebas con lineHeight = tamaño deja la
 * letra entre 0.1 y 0.8 del alto de la línea (mayúsculas de 0.7 em).
 */
function medidaMarca(marca: string) {
  const t = Math.min(150, Math.floor(114 / (anchoBebas(marca) + 0.19)));
  return { fontSize: t, lineHeight: t, top: Math.round(146 - 0.8 * t) };
}

/** Una cifra grande de la cabecera: valor en Bebas, etiqueta chica debajo. */
export function CifraHeroe({
  valor,
  etiqueta,
  grande = false,
}: {
  valor: string;
  etiqueta: string;
  grande?: boolean;
}) {
  return (
    <View style={styles.cifra} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      {/* Sin adjustsFontSizeToFit: en iOS dejaba las cifras a 6 pt. El
          tamaño se calcula con los anchos de Bebas (Ajuste.tsx). */}
      <CifraAjustada
        valor={valor}
        tamano={grande ? 84 : 40}
        interlineado={grande ? 0.95 : 1.05}
        style={styles.cifraValor}
      />
      <Text style={styles.cifraEtiqueta} numberOfLines={1}>
        {etiqueta}
      </Text>
    </View>
  );
}

/** Fila de cifras con la raya fina de arriba. */
export function FilaCifras({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <View style={styles.filaCifras}>
      {!!titulo && <Text style={styles.cifraEtiqueta}>{titulo}</Text>}
      <View style={styles.cifras}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    backgroundColor: COLORS.ink,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16 + CORTE,
  },
  plano: {
    position: 'absolute',
    top: -20,
    right: -90,
    width: 250,
    height: 176,
    transform: [{ skewX: '-16deg' }],
  },
  // Tono sobre tono: el navy al 16% sobre el plano. No es texto que se lea,
  // es textura; por eso queda fuera del lector de pantalla.
  // Tamaño y altura los pone medidaMarca().
  marca: {
    position: 'absolute',
    right: 10,
    fontFamily: FONTS.display,
    color: 'rgba(9, 28, 58, 0.16)',
  },
  contenido: { gap: 16 },
  corte: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 0,
    height: 0,
    borderBottomWidth: CORTE,
    borderBottomColor: COLORS.bgPage,
    borderLeftColor: 'transparent',
  },
  filaCifras: {
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.14)',
  },
  cifras: { flexDirection: 'row', gap: 8 },
  cifra: { flex: 1, gap: 2 },
  // Tamaño y familia los pone CifraAjustada.
  cifraValor: {
    color: COLORS.inkFg,
    fontVariant: ['tabular-nums'],
  },
  cifraEtiqueta: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.inkDim,
  },
});
