/**
 * Entradas lanzadas en notación de béisbol: 36.1 es 36 entradas y UN out.
 *
 * Las dos capas guardan las entradas en DECIMAL (36.33 en la plana, 36.3 en
 * las vistas), que es lo correcto para calcular EFE y WHIP. Pero pintadas tal
 * cual dicen "36.3", que en béisbol no existe: después del punto van los
 * outs, 0, 1 ó 2. La misma cifra salía 36.1 en Pitcheo y 36.3 en la ficha.
 *
 * Se pasa por los outs (`round(ip × 3)`) y no por la parte decimal: funciona
 * igual con 36.33 que con 36.3 redondeado a un decimal, y nunca da ".3". La
 * copia que vivía en PitchingTable redondeaba la parte decimal y con 36.99
 * daba "36.3". Misma función en el móvil: mobile/src/formato.ts.
 */
export function entradas(ip: number | null | undefined): string {
  if (ip == null) return "—";
  const outs = Math.round(ip * 3);
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}
