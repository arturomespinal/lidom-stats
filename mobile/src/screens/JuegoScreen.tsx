import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchGame } from '../api';
import { COLORS } from '../constants';
import type { FichasParamList, LiveStackParamList } from '../navigation';
import type { JuegoHistorico } from '../types';
import Seccion from '../components/Seccion';
import BoxScore from '../components/BoxScore';
import { Bloque } from '../components/Esqueleto';
import { CarruselFiguras, TarjetaDestacado } from '../components/Jornada';

// La pantalla vive en todas las pilas (FichasParamList). El detalle en vivo,
// solo en la de Hoy: por eso se pregunta si la ruta existe antes de ofrecerlo.
type Props = NativeStackScreenProps<FichasParamList & Partial<LiveStackParamList>, 'Juego'>;

/**
 * Un juego terminado, armado desde la base (GET /games/{id}/detail).
 *
 * Es la puerta a los ~2.000 juegos de la historia que el motor en vivo no
 * siguió. Trae lo que la base tiene —marcador, decisiones, titular, figuras y
 * el boxscore completo— y dice lo que no tiene: sin línea por entradas ni
 * relato, que solo existen para los juegos seguidos en vivo. Si la caché sí
 * lo tiene, la franja navy lleva al detalle completo.
 *
 * El boxscore es el mismo componente del detalle en vivo: la API lo manda
 * con la misma forma, y cada fila abre la ficha del jugador.
 */
export default function JuegoScreen({ route, navigation }: Props) {
  const { gameId, awayCode, homeCode } = route.params;
  const [juego, setJuego] = useState<JuegoHistorico | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');

  const cargar = useCallback(async () => {
    setEstado('cargando');
    const j = await fetchGame(gameId);
    if (!j) {
      setEstado('error');
      return;
    }
    setJuego(j);
    setEstado('listo');
  }, [gameId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!juego) {
    if (estado === 'error') {
      return (
        <View style={styles.vacio}>
          <Text style={styles.vacioTexto}>No se pudo cargar el juego.</Text>
          <Pressable
            onPress={cargar}
            style={({ pressed }) => [styles.boton, pressed && styles.presionado]}
            accessibilityRole="button"
          >
            <Text style={styles.botonTexto}>Reintentar</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={[styles.pagina, { padding: 16, gap: 12 }]} accessibilityLabel="Cargando el juego">
        <Bloque w="100%" h={240} r={12} />
        <Bloque w="50%" h={24} />
        <Bloque w="100%" h={320} r={10} />
      </View>
    );
  }

  const g = juego.game;
  const hayDetalle = navigation.getState().routeNames.includes('GameDetail');
  const enVivo =
    hayDetalle && g.has_detail && g.game_pk
      ? () => navigation.push('GameDetail', { gamePk: g.game_pk!, awayCode, homeCode })
      : undefined;

  return (
    <ScrollView style={styles.pagina} contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}>
      <TarjetaDestacado
        juego={g}
        destacado={{ headline: juego.headline, win_prob: juego.win_prob }}
        etiqueta={`${juego.label}${g.season_id ? ` · ${g.season_id}` : ''}`}
        onAbrir={enVivo}
        accion="Relato y línea ›"
        onJugador={p => navigation.push('Jugador', { playerId: p.player_id, nombre: p.full_name })}
      />

      {juego.figures.length > 0 && (
        <>
          <Seccion titulo="Figuras del juego" />
          <CarruselFiguras
            figuras={juego.figures}
            onJugador={f => navigation.push('Jugador', { playerId: f.player_id, nombre: f.full_name })}
          />
        </>
      )}

      <Seccion
        titulo="Boxscore"
        sub={
          juego.boxscore_available
            ? 'Sin errores ni línea por entradas: la base guarda lo que hizo cada jugador, y eso solo existe para los juegos seguidos en vivo.'
            : undefined
        }
      />
      {juego.boxscore_available ? (
        <View style={styles.box}>
          <BoxScore home={juego.home} away={juego.away} />
        </View>
      ) : (
        <Text style={styles.sinBox}>
          Este juego está en el calendario pero no tiene boxscore: se perdió por forfeit, se
          pospuso o todavía no se ha procesado.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },
  box: { marginHorizontal: 16 },
  sinBox: {
    marginHorizontal: 16,
    padding: 16,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.bgCard,
    borderRadius: 10,
  },
  vacio: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
    backgroundColor: COLORS.bgPage,
  },
  vacioTexto: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  boton: {
    minHeight: 44,
    paddingHorizontal: 24,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  botonTexto: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  presionado: { backgroundColor: COLORS.bgRaised },
});
