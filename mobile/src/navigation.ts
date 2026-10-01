/**
 * Tipos de navegación.
 *
 * Viven aparte de App.tsx para que las pantallas puedan importarlos sin
 * arrastrar el árbol de navegadores entero — importar App.tsx desde una
 * pantalla crearía un ciclo.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { GrupoHistorico } from './types';

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
  /**
   * Un juego terminado armado desde la base (GET /games/{id}/detail): para
   * los que el motor en vivo no siguió, que son casi todos los de la
   * historia. Está en todas las pilas porque se abre desde las fichas (los
   * últimos diez de un equipo, el juego a juego de un jugador), no solo
   * desde Hoy.
   */
  Juego: { gameId: string; awayCode: string; homeCode: string };
  /**
   * Un jugador que solo existe en DIGIMETRICS (antes de 2012-13, sin enlace a
   * la MLB API). Los enlazados abren `Jugador`, que ya trae esos años.
   */
  Historico: { idMiembro: number; nombre?: string };
  /** Récords de todos los tiempos de una categoría. Se abre desde Buscar. */
  Records: { grupo: GrupoHistorico; stat: string };
};

export type LiveStackParamList = FichasParamList & {
  /** La portada: la jornada del día (GET /day). Raíz de la primera pestaña. */
  Portada: { fecha?: string } | undefined;
  /**
   * Las jornadas de una temporada, para saltar a una fecha. `activa` es la
   * fecha que muestra la portada: va marcada en el calendario.
   */
  Calendario: { season?: string; activa?: string };
  /** Los marcadores en vivo, con diamante y cuenta. Se abre desde Hoy. */
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
