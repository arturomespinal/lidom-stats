import React from 'react';
import Pestanas, { Pestana } from './Pestanas';

export type GameTab = 'relato' | 'linea' | 'boxscore' | 'alineaciones';

/* Etiquetas cortas a propósito: con "Por entradas" y "Alineaciones" la cuarta
   pestaña queda cortada por el borde en un iPhone, y una pestaña que hay que
   descubrir deslizando es una pestaña que nadie toca. */
const TABS: Pestana<GameTab>[] = [
  { key: 'relato', label: 'Relato' },
  { key: 'linea', label: 'Entradas' },
  { key: 'boxscore', label: 'Boxscore' },
  { key: 'alineaciones', label: 'Alineación' },
];

/**
 * Selector de pestaña del detalle de juego. El dibujo vive en `Pestanas`,
 * compartido con las fichas de jugador y de equipo: tres copias de las mismas
 * pestañas acabarían con tres alturas distintas.
 */
export default function GameTabs({
  active,
  onChange,
}: {
  active: GameTab;
  onChange: (t: GameTab) => void;
}) {
  return <Pestanas tabs={TABS} active={active} onChange={onChange} />;
}
