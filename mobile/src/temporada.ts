import { useEffect, useState, useSyncExternalStore } from 'react';
import { fetchSeasons } from './api';
import { DEFAULT_SEASON } from './config';

/**
 * La temporada de Posiciones, Bateo y Pitcheo: UNA para las tres pestañas.
 *
 * Quien mira las posiciones de 2015 y pasa a Bateo espera los bateadores de
 * 2015, no los de este año. La web hace lo mismo llevando `?season=` de una
 * página a otra en la barra de navegación; aquí es un valor de módulo con
 * `useSyncExternalStore`, sin contexto ni librería: tres pantallas lo leen y
 * cualquiera lo cambia.
 *
 * `null` = nadie eligió todavía, y entonces manda la más reciente que tenga la
 * API. Así, cuando se cargue la 2026-27, la app la muestra sin tocar
 * `DEFAULT_SEASON`, que queda solo de respaldo por si /seasons no responde.
 *
 * Las fichas de equipo y de jugador tienen su propia temporada y no la leen:
 * abrir un equipo desde las posiciones de 2015 ya pasa la temporada por la
 * ruta.
 */
let elegida: string | null = null;
const oyentes = new Set<() => void>();

function suscribir(fn: () => void) {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

export function elegirTemporada(s: string) {
  elegida = s;
  oyentes.forEach(fn => fn());
}

/* La lista de /seasons se pide una sola vez por sesión: cambia una vez al año. */
let lista: string[] | null = null;
let pendiente: Promise<string[] | null> | null = null;

function cargarLista(): Promise<string[] | null> {
  if (lista) return Promise.resolve(lista);
  if (!pendiente) {
    pendiente = fetchSeasons().then(l => {
      // Un fallo no se guarda: la próxima pantalla lo vuelve a intentar.
      if (l && l.length) lista = l;
      pendiente = null;
      return l;
    });
  }
  return pendiente;
}

/**
 * `temporada`: la que se muestra, en el formato crudo de la API ("2015").
 * `temporadas`: todas las que hay, de la más reciente a la más vieja; vacía
 * mientras no llega la lista (el selector no se pinta).
 */
export function useTemporada(): {
  temporada: string;
  temporadas: string[];
  elegir: (s: string) => void;
} {
  const actual = useSyncExternalStore(suscribir, () => elegida);
  const [temporadas, setTemporadas] = useState<string[]>(lista ?? []);

  useEffect(() => {
    let vivo = true;
    cargarLista().then(l => {
      if (vivo && l) setTemporadas(l);
    });
    return () => {
      vivo = false;
    };
  }, []);

  return {
    temporada: actual ?? temporadas[0] ?? DEFAULT_SEASON,
    temporadas,
    elegir: elegirTemporada,
  };
}

/** "2015" → "2015-16": la MLB nombra la campaña por el año en que empieza. */
export function etiquetaTemporada(s: string): string {
  const y = Number(s);
  return Number.isInteger(y) ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : s;
}
