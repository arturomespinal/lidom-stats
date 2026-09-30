import React, { useState } from 'react';
import { LayoutChangeEvent, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { FONTS } from '../constants';

/**
 * Cifras y nombres en Bebas Neue que caben en su caja, calculados, no
 * adivinados por el sistema.
 *
 * ── Por qué no `adjustsFontSizeToFit` ──────────────────────────────────────
 * En iOS encogía las cifras de la cabecera del jugador hasta volverlas
 * ilegibles (".903" a 6 pt, 30-sep, iPhone de Arturo): el ajuste del sistema
 * se calcula con el ancho de la primera pasada de layout —que en una fila con
 * `flex: 1` puede ser casi cero— y no vuelve a crecer. Además en la web no
 * existe, así que las dos plataformas se veían distinto.
 *
 * ── Cómo se calcula ────────────────────────────────────────────────────────
 * Bebas Neue es una sola fuente y sus anchos son fijos: la tabla de abajo sale
 * del propio archivo de la fuente (avance de cada glifo en em). El ancho de un
 * texto a tamaño `t` es `t × Σ anchos`; el tamaño que cabe en `w` puntos es
 * `w / Σ anchos`, con tope en el tamaño de diseño. Es exacto y no depende del
 * sistema. Lo que no está en la tabla cuenta como una mayúscula ancha (0.42),
 * que es el lado seguro.
 */
const ANCHO_EM: Record<string, number> = {
  A: 0.401, B: 0.404, C: 0.383, D: 0.406, E: 0.363, F: 0.344, G: 0.391, H: 0.42,
  I: 0.192, J: 0.265, K: 0.414, L: 0.344, M: 0.538, N: 0.427, O: 0.4, P: 0.386,
  Q: 0.4, R: 0.403, S: 0.372, T: 0.364, U: 0.402, V: 0.382, W: 0.557, X: 0.406,
  Y: 0.394, Z: 0.362, Á: 0.401, É: 0.363, Í: 0.192, Ó: 0.4, Ú: 0.402, Ñ: 0.427,
  Ü: 0.402, '.': 0.188, '-': 0.27, '–': 0.3, '−': 0.4, '·': 0.188, ',': 0.188,
  '/': 0.389, ':': 0.188, '+': 0.4, '%': 0.589, "'": 0.188, '(': 0.276, ')': 0.276,
  ' ': 0.16,
};

/** Ancho de un texto en Bebas Neue, en em (multiplicar por el tamaño). */
export function anchoBebas(texto: string, espaciado = 0): number {
  let em = 0;
  for (const c of texto.toUpperCase()) {
    em += /[0-9]/.test(c) ? 0.4 : ANCHO_EM[c] ?? 0.42;
  }
  return em + espaciado * texto.length;
}

/** El tamaño al que `texto` cabe en `ancho` puntos, sin pasar de `maximo`. */
export function tamanoQueCabe(texto: string, ancho: number, maximo: number): number {
  const em = anchoBebas(texto);
  if (!em || ancho <= 0) return maximo;
  // 2 % de holgura: el redondeo del sistema no debe partir la última letra.
  return Math.min(maximo, Math.floor((ancho * 0.98) / em));
}

/**
 * Tamaño para un nombre de varias palabras que puede partirse en renglones:
 * manda la palabra más larga, que es la que no se puede partir. Mismo cálculo
 * que `NombreHeroe` en la web.
 */
export function tamanoNombre(nombre: string, ancho: number, maximo: number): number {
  const larga = nombre
    .split(/\s+/)
    .reduce((a, p) => (anchoBebas(p) > anchoBebas(a) ? p : a), '');
  return tamanoQueCabe(larga, ancho, maximo);
}

/**
 * Una cifra en Bebas que ocupa el ancho que le da su fila (`flex: 1`) y se
 * achica solo si no cabe. Mide su caja con onLayout; hasta entonces se pinta
 * al tamaño de diseño en una línea (lo que sobre, se recorta un instante).
 */
export function CifraAjustada({
  valor,
  tamano,
  interlineado = 1.05,
  style,
  caja,
}: {
  valor: string;
  tamano: number;
  /** lineHeight como proporción del tamaño. */
  interlineado?: number;
  style?: StyleProp<TextStyle>;
  caja?: StyleProp<ViewStyle>;
}) {
  const [ancho, setAncho] = useState(0);
  const t = ancho ? tamanoQueCabe(valor, ancho, tamano) : tamano;
  return (
    <View style={caja} onLayout={(e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width)}>
      <Text
        numberOfLines={1}
        style={[style, { fontFamily: FONTS.display, fontSize: t, lineHeight: Math.round(t * interlineado) }]}
      >
        {valor}
      </Text>
    </View>
  );
}
