import { cookies } from "next/headers";

import { COOKIE_FAVORITO, favoritoValido } from "@/lib/favorito";

/**
 * El equipo favorito de quien pide la página, leído de su cookie. Solo en el
 * servidor (páginas): `next/headers` no existe en el navegador. Ver
 * lib/favorito.ts.
 */
export async function leerFavorito(): Promise<string | null> {
  return favoritoValido((await cookies()).get(COOKIE_FAVORITO)?.value);
}
