import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { TEAM_STYLES } from './constants';

/**
 * El equipo favorito: lo marca cada persona con la estrella de la ficha del
 * equipo (TeamScreen) y se recuerda en el teléfono. Uno solo: marcar otro lo
 * reemplaza. Con favorito, Hoy pide su juego como destacado y lo pone
 * primero, y Posiciones marca su fila. Misma idea que la web
 * (frontend/lib/favorito.ts), que lo guarda en una cookie.
 *
 * A diferencia del modo (src/tema.ts), cambiarlo no vuelve a montar nada: las
 * pantallas que lo usan se suscriben con `useFavorito()`.
 */

const CLAVE = 'deportiv-favorito';

let actual: string | null = null;
const avisos = new Set<() => void>();

/** Un código que no es de la liga no cuenta (un valor viejo, uno a mano). */
function valido(code: string | null): string | null {
  return code && Object.prototype.hasOwnProperty.call(TEAM_STYLES, code) ? code : null;
}

export function favoritoActual(): string | null {
  return actual;
}

export function fijarFavorito(code: string | null): void {
  const nuevo = valido(code);
  if (nuevo === actual) return;
  actual = nuevo;
  (nuevo ? AsyncStorage.setItem(CLAVE, nuevo) : AsyncStorage.removeItem(CLAVE)).catch(() => {
    // Sin almacenamiento dura lo que dure la app. Basta.
  });
  avisos.forEach((aviso) => aviso());
}

/** Lee el favorito guardado. App.tsx la espera junto con el modo. */
export async function cargarFavorito(): Promise<void> {
  try {
    actual = valido(await AsyncStorage.getItem(CLAVE));
  } catch {
    // Sin almacenamiento, sin favorito.
  }
}

function suscribir(aviso: () => void): () => void {
  avisos.add(aviso);
  return () => avisos.delete(aviso);
}

/** El favorito actual, y un render nuevo cuando cambia. */
export function useFavorito(): string | null {
  return useSyncExternalStore(suscribir, favoritoActual, favoritoActual);
}
