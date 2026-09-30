import React from 'react';
import Pestanas from './Pestanas';
import { etiquetaTemporada } from '../temporada';

/**
 * Las temporadas en pestañas de subrayado, la más reciente primero: el mismo
 * selector que la ficha de equipo. Hasta que llega la lista de /seasons no se
 * pinta nada —mejor que una barra vacía que salta al llenarse—, y con una
 * sola temporada tampoco: no hay nada que elegir.
 */
export default function SelectorTemporada({
  temporadas,
  activa,
  onChange,
}: {
  temporadas: string[];
  activa: string;
  onChange: (s: string) => void;
}) {
  if (temporadas.length < 2) return null;
  return (
    <Pestanas
      tabs={temporadas.map(s => ({ key: s, label: etiquetaTemporada(s) }))}
      active={activa}
      onChange={onChange}
    />
  );
}
