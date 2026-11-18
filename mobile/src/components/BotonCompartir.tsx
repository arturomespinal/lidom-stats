import React from 'react';
import { Pressable, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WEB_URL } from '../config';
import { COLORS } from '../constants';

/**
 * Compartir la página web de lo que se está mirando (un juego, un jugador,
 * un equipo) con la hoja nativa del teléfono: WhatsApp, Mensajes, copiar.
 * Se comparte el enlace de la WEB, no de la app: quien lo recibe lo abre sin
 * instalar nada, y el chat lo muestra con su tarjeta (marcador o cifras).
 *
 * Va a la derecha de la cabecera (App.tsx), en el color del texto de esa
 * cabecera.
 */
export default function BotonCompartir({
  ruta,
  titulo,
  sobreFranja = true,
}: {
  /** La ruta de la web: "/juegos/2026-11-13-TOR-EST-1". */
  ruta: string;
  titulo: string;
  /** Las fichas y el juego en vivo llevan la cabecera de franja; el juego terminado, la común. */
  sobreFranja?: boolean;
}) {
  const url = `${WEB_URL}${ruta}`;
  return (
    <Pressable
      onPress={() => {
        // iOS usa `url` y pone el texto aparte; Android solo lee `message`.
        Share.share({ message: `${titulo}\n${url}`, url, title: titulo }).catch(() => {
          // Cancelar la hoja no es un error que mostrar.
        });
      }}
      hitSlop={6}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
      accessibilityRole="button"
      accessibilityLabel={`Compartir ${titulo}`}
    >
      <Ionicons name="share-outline" size={22} color={sobreFranja ? COLORS.inkFg : COLORS.textPrimary} />
    </Pressable>
  );
}
