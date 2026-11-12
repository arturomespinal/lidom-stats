/**
 * Ancho de un texto en la letra de títulos, en em. Misma tabla que
 * `mobile/src/components/Ajuste.tsx`.
 *
 * ── Look "Pizarra" (rama nuevo-look, 12-nov-2026) ─────────────────────────
 * La letra de títulos es ahora Barlow Condensed y la tabla es la suya, en
 * peso 700 (el más ancho de los tres que se cargan: lo que cabe en 700 cabe en
 * 600), sacada del archivo de la fuente: avance de cada glifo. Las cifras
 * cuentan 0.5, que es su ancho tabular. Lo que no está en la tabla cuenta
 * como una mayúscula ancha (0.5), el lado seguro.
 *
 * El archivo y la función conservan el nombre de la letra anterior (Bebas
 * Neue, que sigue en `main`) para que la rama no renombre nada: si el look se
 * queda, se renombran entonces.
 */
const ANCHO_EM: Record<string, number> = {
  A: 0.482, B: 0.47, C: 0.464, D: 0.476, E: 0.438, F: 0.421, G: 0.467, H: 0.48,
  I: 0.23, J: 0.452, K: 0.491, L: 0.426, M: 0.548, N: 0.514, O: 0.473, P: 0.465,
  Q: 0.461, R: 0.471, S: 0.444, T: 0.468, U: 0.479, V: 0.488, W: 0.689, X: 0.475,
  Y: 0.474, Z: 0.412, Á: 0.482, É: 0.438, Í: 0.23, Ó: 0.473, Ú: 0.479, Ñ: 0.514,
  Ü: 0.479, ".": 0.223, "-": 0.331, "–": 0.38, "−": 0.438, "·": 0.225, ",": 0.211,
  "/": 0.415, ":": 0.275, "+": 0.438, "%": 0.766, "'": 0.17, "(": 0.311, ")": 0.311,
  " ": 0.2,
};

export function anchoBebas(texto: string): number {
  let em = 0;
  for (const c of texto.toUpperCase()) em += /[0-9]/.test(c) ? 0.5 : ANCHO_EM[c] ?? 0.5;
  return em;
}
