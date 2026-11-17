import { TEAM_STYLES } from "@/lib/constants";

/**
 * El equipo favorito: lo elige cada persona con la estrella de la ficha del
 * equipo (components/BotonFavorito.tsx) y se guarda en su navegador.
 *
 * Va en una COOKIE y no en localStorage (como el modo claro): así lo lee el
 * servidor al armar la página, y la portada sale ya con el juego del
 * favorito como destacado y la tabla con su fila marcada, sin un salto
 * después de cargar. Es solo un código de tres letras; no identifica a nadie.
 * Un valor que no es de la liga se ignora (`favoritoValido`).
 */

export const COOKIE_FAVORITO = "deportiv-favorito";

export function favoritoValido(valor: string | null | undefined): string | null {
  return valor && Object.hasOwn(TEAM_STYLES, valor) ? valor : null;
}

/** Guarda (o borra, con null) el favorito. Solo en el navegador. */
export function fijarFavorito(code: string | null): void {
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = code
    ? `${COOKIE_FAVORITO}=${code}; Path=/; Max-Age=31536000; SameSite=Lax${seguro}`
    : `${COOKIE_FAVORITO}=; Path=/; Max-Age=0; SameSite=Lax${seguro}`;
}
