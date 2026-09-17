import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchLiveGames } from '../api';
import { COLORS } from '../constants';
import { LiveGameState } from '../types';
import LiveScoreboard from '../components/LiveScoreboard';

/**
 * Marcador en vivo.
 *
 * Sondea en vez de escuchar SSE: React Native no trae EventSource, y para un
 * marcador cuyo ritmo ya conocemos —la propia API dice cada cuánto consultar
 * en poll_wait_seconds— un intervalo da lo mismo sin añadir dependencias.
 *
 * El sondeo se detiene cuando la pantalla pierde el foco o la app pasa a
 * segundo plano. En un celular eso no es un detalle: es la batería y los datos
 * del usuario. Un marcador que sigue consultando desde el bolsillo es un bug.
 */

/* Si un juego en curso pasa esto sin actualizarse, se marca "sin señal": son
   varios ciclos perdidos, ya no es una pausa normal entre lanzamientos. */
const STALE_MS = 45_000;

/* Cuando no hay nada en curso (todo final o por comenzar) se espacia mucho:
   no hay nada que refrescar cada diez segundos. */
const IDLE_POLL_SECONDS = 60;

const DEFAULT_POLL_SECONDS = 10;

export default function LiveScreen() {
  const [games, setGames] = useState<LiveGameState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());

  /* En refs y no en estado: cambiarlos no debe redibujar la pantalla. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);

  const stop = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);

      const rows = await fetchLiveGames();

      /* Si la pantalla se fue mientras la petición volaba, se descarta: poner
         estado en un componente que ya no está montado avisa en consola y no
         sirve para nada. */
      if (!active.current) return;

      setGames(rows);
      setLastUpdate(Date.now());
      setLoading(false);
      setRefreshing(false);

      /* El siguiente sondeo se programa DESPUÉS de que este terminó, no con
         setInterval: si el backend tarda, los sondeos no se apilan. */
      const enCurso = rows.filter(g => g.status === 'live');
      const espera = enCurso.length
        ? Math.min(...enCurso.map(g => g.poll_wait_seconds || DEFAULT_POLL_SECONDS))
        : IDLE_POLL_SECONDS;

      stop();
      if (active.current) {
        timer.current = setTimeout(() => load(), espera * 1000);
      }
    },
    [stop],
  );

  /* Solo se sondea con la pantalla enfocada. */
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      load();
      return () => {
        active.current = false;
        stop();
      };
    }, [load, stop]),
  );

  /* Y solo con la app en primer plano. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        if (!active.current) {
          active.current = true;
          load();
        }
      } else {
        active.current = false;
        stop();
      }
    });
    return () => sub.remove();
  }, [load, stop]);

  /* Tic de reloj solo para recalcular la antigüedad del dato. */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  const ordenados = [...games].sort((a, b) => {
    const rank = (s: LiveGameState) =>
      s.status === 'live' ? 0 : s.status === 'preview' ? 1 : 2;
    return rank(a) - rank(b) || a.game_pk - b.game_pk;
  });

  const stale = now - lastUpdate > STALE_MS;

  return (
    <FlatList
      data={ordenados}
      keyExtractor={g => String(g.game_pk)}
      renderItem={({ item }) => (
        <LiveScoreboard state={item} stale={item.status === 'live' && stale} />
      )}
      contentContainerStyle={
        ordenados.length ? styles.list : styles.listEmpty
      }
      style={{ backgroundColor: COLORS.bgPage }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={COLORS.accent}
        />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚾</Text>
          <Text style={styles.emptyTitle}>No hay juegos en seguimiento</Text>
          <Text style={styles.emptyText}>
            La temporada de LIDOM va de octubre a enero. Fuera de temporada se
            puede reproducir un juego terminado: el marcador recibe los mismos
            datos que recibirá en vivo.
          </Text>
          <View style={styles.code}>
            <Text style={styles.codeText}>set LIDOM_LIVE_POLLER=1</Text>
            <Text style={styles.codeText}>set LIDOM_LIVE_REPLAY=826343</Text>
            <Text style={styles.codeText}>python -m uvicorn api.main:app --host 0.0.0.0</Text>
          </View>
          <Text style={styles.emptyHint}>
            El celular necesita que el backend escuche en 0.0.0.0 y que la IP de
            src/config.ts sea la de esta máquina en la red.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgPage,
  },
  list: { padding: 12 },
  listEmpty: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyIcon: { fontSize: 44, marginBottom: 14 },
  emptyTitle: {
    color: '#c9d1d9',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 18,
  },
  code: {
    backgroundColor: COLORS.bgCard,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    marginBottom: 14,
  },
  codeText: { color: COLORS.textSecondary, fontSize: 11, fontFamily: 'monospace' },
  emptyHint: {
    color: '#30363d',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
