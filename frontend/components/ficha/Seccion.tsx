/**
 * Título de sección de las fichas. Misma pieza que la del móvil.
 *
 * `titular` es la frase que escribe el dato ("Tercer mejor OPS de la liga, a
 * los 38."): la compone el servidor, aquí solo se pone donde se lee primero.
 * `sub` explica cómo leer lo que viene debajo.
 */
export default function Seccion({
  titulo,
  nota,
  titular,
  sub,
}: {
  titulo: string;
  /** Texto chico a la derecha: el "cuántos" o el "de cuándo". */
  nota?: string;
  titular?: string | null;
  sub?: string;
}) {
  return (
    <div className="mb-3 space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-cond text-2xl leading-none tracking-[0.02em] text-fg">{titulo}</h2>
        {nota && <span className="num shrink-0 text-xs text-dim">{nota}</span>}
      </div>
      {titular && <p className="text-[15px] font-bold leading-snug text-fg">{titular}</p>}
      {sub && <p className="text-xs leading-relaxed text-dim">{sub}</p>}
    </div>
  );
}
