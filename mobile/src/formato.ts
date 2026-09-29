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

/** Un valor de "contra la liga" según el formato que manda el servidor. */
export function valorPuesto(v: number, formato: string): string {
  switch (formato) {
    case 'rate3':
      return pct3(v);
    case 'pct1':
      return `${(v * 100).toFixed(1)}%`;
    case 'dec2':
      return v.toFixed(2);
    case 'ip':
      return entradas(v);
    default:
      return String(Math.round(v));
  }
}

const SUFIJOS = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);

/**
 * "Yamaico Navarro" → "YN"; "Mel Rojas Jr." → "MR". El monograma que ocupa el
 * lugar de la foto: primera letra del nombre y del último apellido.
 */
export function iniciales(nombre: string): string {
  const partes = nombre.split(/\s+/).filter(p => p && !SUFIJOS.has(p.toLowerCase()));
  if (partes.length === 0) return '?';
  const a = partes[0][0];
  const b = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (a + b).toUpperCase();
}

/**
 * Marcas de eje en números redondos: .600 / .800 / 1.000, no .571 / .762.
 * El paso sale de 1, 2, 2.5 y 5 por potencias de 10; se toma el más chico que
 * deja como mucho `max` marcas dentro del rango.
 */
export function marcasRedondas(lo: number, hi: number, max = 4): number[] {
  const rango = hi - lo;
  if (!(rango > 0)) return [lo];
  const base = Math.pow(10, Math.floor(Math.log10(rango)) - 1);
  for (const k of [1, 2, 2.5, 5, 10, 20, 25, 50, 100]) {
    const paso = k * base;
    const marcas: number[] = [];
    for (let v = Math.ceil(lo / paso) * paso; v <= hi + 1e-9; v += paso) {
      // toFixed(10) limpia el ruido del punto flotante: 0.6000000000000001.
      marcas.push(Number((Math.round(v / paso) * paso).toFixed(10)));
    }
    if (marcas.length <= max) return marcas;
  }
  return [lo, hi];
}
