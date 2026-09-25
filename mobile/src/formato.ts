/**
 * Formato de cifras para las fichas. Un solo lugar: si el promedio se escribe
 * ".316" en una pantalla y "0.316" en otra, la app parece de dos equipos.
 * Mismas reglas que la web (frontend/components/player/SeasonTable.tsx).
 */

/** Promedio en convención de béisbol: .316, no 0.316. 1.000 se queda entero. */
export function pct3(v: number | null | undefined): string {
  if (v == null) return '—';
  return v >= 1 ? v.toFixed(3) : v.toFixed(3).slice(1);
}

export function num(v: number | null | undefined, dec = 0): string {
  return v == null ? '—' : v.toFixed(dec);
}

/**
 * Entradas lanzadas en notación de béisbol: 36.1 es 36 entradas y UN out.
 *
 * Las dos capas guardan las entradas en DECIMAL (36.33 en la plana, 36.3 en
 * las vistas), que es lo correcto para calcular EFE y WHIP. Pero pintadas tal
 * cual dicen "36.3", que en béisbol no existe: después del punto van los
 * outs, 0, 1 ó 2. La misma cifra salía 36.1 en Pitcheo y 36.3 en la ficha.
 *
 * Se pasa por los outs (`round(ip × 3)`) y no por la parte decimal: funciona
 * igual con 36.33 que con 36.3 redondeado a un decimal, y nunca da ".3".
 */
export function entradas(ip: number | null | undefined): string {
  if (ip == null) return '—';
  const outs = Math.round(ip * 3);
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

/**
 * ±N con el signo SIEMPRE escrito. El signo es el dato, no el color: verde y
 * rojo quedan a ΔE 6.7 en deuteranopia. El menos es el tipográfico (U+2212),
 * que en una columna alineada a la derecha no se ve como un punto suelto.
 */
export function conSigno(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * "1988-02-08" → "8 feb 1988".
 *
 * Se parte el string a mano en vez de usar `new Date(...)`: una fecha ISO sin
 * hora se interpreta como UTC, y en UTC-4 eso devuelve el día ANTERIOR. Un
 * jugador nacido el 1ro aparecería nacido el 31 del mes pasado.
 */
export function fechaEs(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return iso;
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** "2012-13" y "2025-26" → "2012–26". Una sola temporada se queda como está. */
export function rangoTemporadas(primera: string, ultima: string): string {
  return primera === ultima ? primera : `${primera.slice(0, 4)}–${ultima.slice(5)}`;
}

/** Valor de un destacado de equipo según la estadística que lo decide. */
export function valorDestacado(stat: string, v: number): string {
  if (['avg', 'obp', 'slg', 'ops'].includes(stat)) return pct3(v);
  if (['era', 'whip'].includes(stat)) return v.toFixed(2);
  return String(v);
}
