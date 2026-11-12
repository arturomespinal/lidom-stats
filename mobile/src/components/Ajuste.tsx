import React, { useState } from 'react';
import { LayoutChangeEvent, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { FONTS } from '../constants';

/**
 * Cifras y nombres en la letra de títulos que caben en su caja, calculados,
 * no adivinados por el sistema.
 *
 * ── Por qué no `adjustsFontSizeToFit` ──────────────────────────────────────
 * En iOS encogía las cifras de la cabecera del jugador hasta volverlas
 * ilegibles (".903" a 6 pt, 30-sep, iPhone de Arturo): el ajuste del sistema
 * se calcula con el ancho de la primera pasada de layout —que en una fila con
 * `flex: 1` puede ser casi cero— y no vuelve a crecer. Además en la web no
 * existe, así que las dos plataformas se veían distinto.
 *
 * ── Cómo se calcula ────────────────────────────────────────────────────────
 * Los anchos de una fuente son fijos: la tabla de abajo sale del propio
 * archivo de la fuente (avance de cada glifo en em). El ancho de un texto a
 * tamaño `t` es `t × Σ anchos`; el tamaño que cabe en `w` puntos es
 * `w / Σ anchos`, con tope en el tamaño de diseño. Es exacto y no depende del
 * sistema.
 *
 * ── Look "Pizarra" (rama nuevo-look, 12-nov-2026) ─────────────────────────
 * La letra es ahora Barlow Condensed y la tabla es la suya, en peso 700 (el
 * más ancho de los dos que se cargan: lo que cabe en 700 cabe en 600). Las
 * cifras cuentan 0.5, su ancho tabular. Lo que no está en la tabla cuenta
 * como una mayúscula ancha (0.5), que es el lado seguro. La función conserva
 * el nombre de la letra anterior (Bebas Neue, que sigue en `main`) para que
 * la rama no renombre nada; la web tiene la misma tabla en
 * `frontend/lib/bebas.ts`.
 */
const ANCHO_EM: Record<string, number> = {
  A: 0.482, B: 0.47, C: 0.464, D: 0.476, E: 0.438, F: 0.421, G: 0.467, H: 0.48,
  I: 0.23, J: 0.452, K: 0.491, L: 0.426, M: 0.548, N: 0.514, O: 0.473, P: 0.465,
  Q: 0.461, R: 0.471, S: 0.444, T: 0.468, U: 0.479, V: 0.488, W: 0.689, X: 0.475,
  Y: 0.474, Z: 0.412, Á: 0.482, É: 0.438, Í: 0.23, Ó: 0.473, Ú: 0.479, Ñ: 0.514,
  Ü: 0.479, '.': 0.223, '-': 0.331, '–': 0.38, '−': 0.438, '·': 0.225, ',': 0.211,
  '/': 0.415, ':': 0.275, '+': 0.438, '%': 0.766, "'": 0.17, '(': 0.311, ')': 0.311,
  ' ': 0.2,
};

/** Ancho de un texto en la letra de títulos, en em (multiplicar por el tamaño). */
export function anchoBebas(texto: string, espaciado = 0): number {
  let em = 0;
  for (const c of texto.toUpperCase()) {
    em += /[0-9]/.test(c) ? 0.5 : ANCHO_EM[c] ?? 0.5;
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
 * Una cifra en la letra de títulos que ocupa el ancho que le da su fila (`flex: 1`) y se
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
        style={[style, { fontFamily: FONTS.display, textTransform: 'uppercase', fontSize: t, lineHeight: Math.round(t * interlineado) }]}
      >
        {valor}
      </Text>
    </View>
  );
}
