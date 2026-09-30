/**
 * Ancho de un texto en Bebas Neue, en em. Misma tabla que
 * `mobile/src/components/Ajuste.tsx`, sacada del archivo de la fuente (avance
 * de cada glifo): las cifras miden 0.4, la "I" 0.192, la "W" 0.557. Lo que no
 * está en la tabla cuenta como una mayúscula ancha (0.42), el lado seguro.
 */
const ANCHO_EM: Record<string, number> = {
  A: 0.401, B: 0.404, C: 0.383, D: 0.406, E: 0.363, F: 0.344, G: 0.391, H: 0.42,
  I: 0.192, J: 0.265, K: 0.414, L: 0.344, M: 0.538, N: 0.427, O: 0.4, P: 0.386,
  Q: 0.4, R: 0.403, S: 0.372, T: 0.364, U: 0.402, V: 0.382, W: 0.557, X: 0.406,
  Y: 0.394, Z: 0.362, Á: 0.401, É: 0.363, Í: 0.192, Ó: 0.4, Ú: 0.402, Ñ: 0.427,
  Ü: 0.402, ".": 0.188, "-": 0.27, "–": 0.3, "−": 0.4, "·": 0.188, ",": 0.188,
  "/": 0.389, ":": 0.188, "+": 0.4, "%": 0.589, "'": 0.188, "(": 0.276, ")": 0.276,
  " ": 0.16,
};

export function anchoBebas(texto: string): number {
  let em = 0;
  for (const c of texto.toUpperCase()) em += /[0-9]/.test(c) ? 0.4 : ANCHO_EM[c] ?? 0.42;
  return em;
}
