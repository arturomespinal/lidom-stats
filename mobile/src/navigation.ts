/**
 * Tipos de navegación.
 *
 * Viven aparte de App.tsx para que las pantallas puedan importarlos sin
 * arrastrar el árbol de navegadores entero — importar App.tsx desde una
 * pantalla crearía un ciclo.
 */

export type LiveStackParamList = {
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
