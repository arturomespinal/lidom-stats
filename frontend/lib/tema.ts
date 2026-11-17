/**
 * El modo de color de la web: oscuro (Pizarra, el de arranque) o claro
 * (Pizarra clara). Lo elige cada persona con el botón de la barra
 * (components/BotonTema.tsx) y se recuerda en su navegador.
 *
 * El modo vive en `data-tema` de <html>; los colores, en las variables de
 * globals.css. Ningún componente pregunta por el modo: pinta con tokens.
 */

export type Tema = "oscuro" | "claro";

export const CLAVE_TEMA = "deportiv-tema";
const EVENTO = "deportiv:tema";

/**
 * Corre en el <head>, antes de que el navegador pinte nada (app/layout.tsx).
 * Sin esto la página llegaría oscura y saltaría a clara al hidratar. Es una
 * constante nuestra, sin nada que venga de fuera; el try es porque
 * localStorage falla en algunos modos privados.
 */
export const SCRIPT_TEMA =
  `try{if(localStorage.getItem("${CLAVE_TEMA}")==="claro")` +
  `document.documentElement.dataset.tema="claro"}catch(e){}`;

export function temaActual(): Tema {
  return document.documentElement.dataset.tema === "claro" ? "claro" : "oscuro";
}

export function fijarTema(tema: Tema): void {
  const raiz = document.documentElement;
  if (tema === "claro") raiz.dataset.tema = "claro";
  else delete raiz.dataset.tema;
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin almacenamiento el modo dura lo que dure la página. Basta.
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** Para useSyncExternalStore: avisa cuando cambia el modo. */
export function escucharTema(aviso: () => void): () => void {
  window.addEventListener(EVENTO, aviso);
  return () => window.removeEventListener(EVENTO, aviso);
}
