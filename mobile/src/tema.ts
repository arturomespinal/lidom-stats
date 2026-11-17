import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * El modo de color de la app: oscuro (Pizarra, el de arranque) o claro
 * (Pizarra clara, 16-nov-2026). Lo elige cada persona con el botón de la
 * cabecera (components/BotonTema.tsx) y se recuerda en el teléfono.
 *
 * ── Cómo cambia sin tocar los componentes ────────────────────────────────
 * Los estilos de la app se escriben a nivel de archivo,
 * `const styles = StyleSheet.create({ … COLORS.bgCard … })`, y eso se evalúa
 * UNA vez al cargar: con los colores de ese momento. `tematico()` envuelve
 * cada uno en un Proxy que fabrica el objeto la primera vez que se lee en
 * cada modo y lo guarda; `styles.card` devuelve siempre el del modo actual.
 * COLORS, ALPHA y TEAM_STYLES (constants.ts) son lo mismo: un Proxy sobre la
 * paleta del modo.
 *
 * Al cambiar de modo, App.tsx vuelve a montar el árbol (con `key`) y
 * conserva la navegación, así cada pantalla se pinta con los objetos nuevos.
 * No hace falta que cada componente se suscriba.
 *
 * Lo que se evalúa una sola vez queda con el modo viejo: un
 * `const GRIS = COLORS.x` suelto en un archivo. Va dentro de la función que
 * lo usa, o envuelto en `tematico()`.
 */

export type Tema = 'oscuro' | 'claro';

const CLAVE = 'deportiv-tema';

let actual: Tema = 'oscuro';
const avisos = new Set<() => void>();

export function temaActual(): Tema {
  return actual;
}

export function fijarTema(tema: Tema): void {
  if (tema === actual) return;
  actual = tema;
  AsyncStorage.setItem(CLAVE, tema).catch(() => {
    // Sin almacenamiento el modo dura lo que dure la app. Basta.
  });
  avisos.forEach((aviso) => aviso());
}

/** Lee el modo guardado. App.tsx la espera antes de pintar nada. */
export async function cargarTema(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(CLAVE)) === 'claro') actual = 'claro';
  } catch {
    // Sin almacenamiento, el de arranque.
  }
}

function suscribir(aviso: () => void): () => void {
  avisos.add(aviso);
  return () => avisos.delete(aviso);
}

/** El modo actual, y un render nuevo cuando cambia. */
export function useTema(): Tema {
  return useSyncExternalStore(suscribir, temaActual, temaActual);
}

/** La barra de estado: texto claro sobre el grafito, oscuro sobre el claro. */
export function estiloBarra(): 'light' | 'dark' {
  return actual === 'claro' ? 'dark' : 'light';
}

/**
 * Un objeto que se fabrica por modo: `fabrica` corre la primera vez que se lee
 * en cada modo, con COLORS ya apuntando a ese modo, y el resultado se guarda.
 * Las lecturas, los `...spread`, `Object.keys` e `in` van al del modo actual.
 */
export function tematico<T extends object>(fabrica: () => T): T {
  const guardados: Partial<Record<Tema, T>> = {};
  const actualObj = (): T => (guardados[actual] ??= fabrica());
  return new Proxy({} as T, {
    get: (_, prop) => Reflect.get(actualObj(), prop),
    has: (_, prop) => Reflect.has(actualObj(), prop),
    ownKeys: () => Reflect.ownKeys(actualObj()),
    getOwnPropertyDescriptor: (_, prop) => {
      const d = Reflect.getOwnPropertyDescriptor(actualObj(), prop);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}
