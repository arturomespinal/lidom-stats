/**
 * La estrella del equipo favorito: rellena donde marca al favorito (la
 * portada, la tabla), hueca en el botón cuando todavía no lo es. Siempre en
 * el color del texto: el favorito no tiene un color propio, para que ningún
 * club se confunda con él.
 */
export default function Estrella({
  rellena = true,
  className = "h-3.5 w-3.5",
  etiqueta,
}: {
  rellena?: boolean;
  className?: string;
  /** Si va sola junto a un nombre, lo que lee el lector de pantalla. */
  etiqueta?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill={rellena ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      role={etiqueta ? "img" : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}
