/**
 * Tipos de navegación.
 *
 * Viven aparte de App.tsx para que las pantallas puedan importarlos sin
 * arrastrar el árbol de navegadores entero — importar App.tsx desde una
 * pantalla crearía un ciclo.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/**
 * Las fichas existen en TODAS las pilas.
 *
 * Cada pestaña es una pila con su pantalla raíz más estas dos. Así se puede ir
 * de jugador a equipo a jugador sin salir de la pestaña, y el botón de atrás
 * deshace el camino exacto que se recorrió. Con una sola pila de fichas
 * compartida, abrir un jugador desde Bateo saltaría a otra pestaña y el
 * "atrás" dejaría al usuario en un sitio que no eligió.
 */
export type FichasParamList = {
  /**
   * `season` en cualquiera de los dos formatos ("2025" o "2025-26"). Sin él,
   * la temporada por defecto.
   */
  Equipo: { code: string; season?: string };
  /**
   * `nombre` viaja para poner el título ANTES de la primera respuesta, igual
   * que los códigos en GameDetail. Es opcional: el buscador lo tiene, un
   * enlace desde otro sitio puede no tenerlo.
   */
  Jugador: { playerId: string; nombre?: string };
};

export type LiveStackParamList = FichasParamList & {
  /** Listado de juegos del día. */
  LiveList: undefined;
  /**
   * Detalle de un juego.
   *
   * Se pasan los códigos de equipo además del gamePk para poder poner el
   * título de la cabecera ANTES de que llegue la primera respuesta: sin eso la
   * pantalla abre con el encabezado vacío y parpadea.
   */
  GameDetail: { gamePk: number; awayCode: string; homeCode: string };
};

/**
 * Las otras cuatro pestañas (Posiciones, Bateo, Pitcheo, Buscar) tienen la
 * misma forma: una pantalla raíz y las fichas encima. Comparten tipo y
 * navegador; lo único que cambia es qué componente va en `Raiz`.
 */
export type PilaParamList = FichasParamList & { Raiz: undefined };

/**
 * Navegar a una ficha desde cualquier pantalla. Funciona en las cinco pilas
 * porque las cinco declaran `Equipo` y `Jugador`.
 */
export function useFichas() {
  return useNavigation<NativeStackNavigationProp<FichasParamList>>();
}
