import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchGameDetail, fetchWinProb } from '../api';
import { COLORS } from '../constants';
import { LiveGameDetail, WinProbResponse } from '../types';
import type { LiveStackParamList } from '../navigation';
import GameTabs, { GameTab } from '../components/GameTabs';
import PlayByPlay from '../components/PlayByPlay';
import InningGrid from '../components/InningGrid';
import BoxScore from '../components/BoxScore';
import Lineups from '../components/Lineups';
import StatusBadge from '../components/StatusBadge';
import TeamBadge from '../components/TeamBadge';
import WinProbBand from '../components/WinProbBand';

/**
 * Detalle de un juego: relato, cuadro por entradas, boxscore y alineaciones.
 *
 * Sondea con la misma disciplina que el marcador —se reprograma DESPUÉS de
 * cada respuesta, no con setInterval, y se detiene al perder el foco o pasar a
 * segundo plano— con una parada más: **cuando el backend dice `is_updating:
 * false` deja de sondear del todo.** El juego terminó y el detalle está
 * congelado; seguir pidiéndolo sería gastar batería por nada.
 */

const POLL_SECONDS = 12;

/* Cuántas jugadas traer. Suficientes para llenar varias pantallas de scroll
   sin arrastrar las 71 de un juego completo en cada sondeo. */
const PLAYS = 40;

type Props = NativeStackScreenProps<LiveStackParamList, 'GameDetail'>;

export default function GameDetailScreen({ route }: Props) {
  const { gamePk, awayCode, homeCode } = route.params;

  const [detail, setDetail] = useState<LiveGameDetail | null>(null);
  const [wp, setWp] = useState<WinProbResponse | null>(null);
  const [updating, setUpdating] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<GameTab>('relato');

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

      // El recorrido va en el MISMO ciclo que el detalle, en paralelo: un solo
      // ritmo de sondeo. Dos bucles se desfasan y la curva podría mostrar una
      // carrera que el marcador todavía no tiene.
      const [res, prob] = await Promise.all([
        fetchGameDetail(gamePk, PLAYS),
        fetchWinProb(gamePk),
      ]);

      if (!active.current) return;

      // Un fallo del recorrido no borra la última curva buena.
      if (prob) setWp(prob);

      if (res) {
        setDetail(res.data);
        setUpdating(res.is_updating);
        setFailed(false);
      } else {
        // Un fallo de red no borra lo que ya se mostraba: es mejor un dato de
        // hace doce segundos que una pantalla en blanco.
        setFailed(true);
      }
      setLoading(false);
      setRefreshing(false);

      stop();
      // Terminado = congelado. No hay nada más que pedir.
      if (res?.is_updating !== false) {
        timer.current = setTimeout(() => load(), POLL_SECONDS * 1000);
      }
    },
    [gamePk, stop],
  );

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      load();

      const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
        if (s === 'active') {
          active.current = true;
          load();
        } else {
          active.current = false;
          stop();
        }
      });

      return () => {
        active.current = false;
        stop();
        sub.remove();
      };
    }, [load, stop]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>No se pudo cargar el juego</Text>
        <Text style={styles.errorHint}>
          {awayCode} vs {homeCode} · #{gamePk}
        </Text>
        <Text style={styles.errorHint}>
          Revisa que el backend esté corriendo y accesible desde el celular.
        </Text>
      </View>
    );
  }

  // Marcador y franja se desplazan con el contenido; las pestañas se quedan
  // pegadas arriba (stickyHeaderIndices). Con el marcador FIJO, como estaba,
  // la franja se comía la pantalla: en un teléfono de 844 px al relato le
  // quedaban unos 300. Es el patrón de SofaScore: la cabecera se va, la
  // navegación se queda.
  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={COLORS.accent}
          />
        }
      >
        <ScoreHeader detail={detail} updating={updating} failed={failed} wp={wp} />
        <GameTabs active={tab} onChange={setTab} />
        <View>
          {tab === 'relato' && <PlayByPlay detail={detail} />}
          {tab === 'linea' && <InningGrid detail={detail} />}
          {tab === 'boxscore' && <BoxScore home={detail.home} away={detail.away} />}
          {tab === 'alineaciones' && <Lineups home={detail.home} away={detail.away} />}
        </View>
      </ScrollView>
    </View>
  );
}

function ScoreHeader({
  detail,
  updating,
  failed,
  wp,
}: {
  detail: LiveGameDetail;
  updating: boolean;
  failed: boolean;
  wp: WinProbResponse | null;
}) {
  const ganaVisitante = detail.away.runs > detail.home.runs;
  const ganaLocal = detail.home.runs > detail.away.runs;

  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <StatusBadge status={detail.status} />
        {failed && <Text style={styles.stale}>sin señal</Text>}
        {!updating && detail.status === 'final' && (
          <Text style={styles.frozen}>resultado definitivo</Text>
        )}
      </View>

      <View style={styles.scoreRow}>
        <TeamSide
          code={detail.away.team_code}
          name={detail.away.team_name}
          runs={detail.away.runs}
          winning={ganaVisitante}
        />
        <Text style={styles.dash}>—</Text>
        <TeamSide
          code={detail.home.team_code}
          name={detail.home.team_name}
          runs={detail.home.runs}
          winning={ganaLocal}
          reverse
        />
      </View>

      {/* Dos puntos como mínimo para que sea una curva. En la previa no hay
          estado que simular y no se pinta nada. */}
      {wp && wp.points.length >= 2 && detail.home.team_code && detail.away.team_code && (
        <WinProbBand
          points={wp.points}
          current={wp.current}
          homeCode={detail.home.team_code}
          awayCode={detail.away.team_code}
          headline={wp.headline}
        />
      )}
    </View>
  );
}

function TeamSide({
  code,
  name,
  runs,
  winning,
  reverse,
}: {
  code: string | null;
  name: string | null;
  runs: number;
  winning: boolean;
  reverse?: boolean;
}) {
  return (
    <View style={[styles.side, reverse && styles.sideReverse]}>
      <TeamBadge code={code ?? '—'} size={34} />
      <View style={[styles.sideText, reverse && styles.sideTextReverse]}>
        <Text style={styles.sideName} numberOfLines={1}>
          {name ?? '—'}
        </Text>
        <Text style={[styles.sideRuns, winning && styles.sideRunsWinning]}>
          {runs}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.bgPage },
  scroll: { flex: 1 },
  // Suficiente para que la última línea no quede pegada a la barra de
  // pestañas: en la pestaña de alineación el bullpen termina justo ahí.
  scrollContent: { paddingBottom: 44 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 28,
    backgroundColor: COLORS.bgPage,
  },
  errorTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  errorHint: { color: COLORS.textSecondary, fontSize: 12, textAlign: 'center' },

  header: {
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  stale: { color: COLORS.warning, fontSize: 10 },
  frozen: { color: COLORS.textSecondary, fontSize: 10 },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  sideReverse: { flexDirection: 'row-reverse' },
  sideText: { flex: 1, minWidth: 0 },
  sideTextReverse: { alignItems: 'flex-end' },
  sideName: { color: COLORS.textSecondary, fontSize: 11 },
  sideRuns: {
    color: COLORS.textSupport,
    fontSize: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 30,
  },
  sideRunsWinning: { color: COLORS.textPrimary },
  dash: { color: COLORS.border, fontSize: 16 },
});
