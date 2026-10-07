import React, { useCallback, useRef, useState } from 'react';
import { setStatusBarStyle } from 'expo-status-bar';
import {
  AppState,
  AppStateStatus,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchGameDetail, fetchWinProb } from '../api';
import { COLORS, FONTS, TEAM_SHORT_NAMES } from '../constants';
import { LiveGameDetail, LiveSituation, WinProbResponse } from '../types';
import { useFichas, type LiveStackParamList } from '../navigation';
import GameTabs, { GameTab } from '../components/GameTabs';
import PlayByPlay from '../components/PlayByPlay';
import InningGrid from '../components/InningGrid';
import BoxScore from '../components/BoxScore';
import Lineups from '../components/Lineups';
import StatusBadge from '../components/StatusBadge';
import TeamBadge from '../components/TeamBadge';
import WinProbBand from '../components/WinProbBand';
import Situacion, { jugadaDestacada } from '../components/Situacion';
import JugadasClave from '../components/JugadasClave';
import Comparativa from '../components/Comparativa';
import Heroe from '../components/Heroe';
import { Aparecer } from '../components/Movimiento';
import { Bloque } from '../components/Esqueleto';

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
  const [situacion, setSituacion] = useState<LiveSituation | null>(null);
  const [updating, setUpdating] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<GameTab>('relato');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const inicioContenido = useRef(0);

  // La cabecera es navy: la barra de estado va en claro mientras esta
  // pantalla tiene el foco, igual que en las fichas.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

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
        setSituacion(res.situation ?? null);
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
      // Esqueleto con la forma de la pantalla, no un spinner (reglas de
      // diseño móvil, punto 3): la franja navy ya está donde va a estar.
      <View style={styles.page} accessibilityLabel="Cargando el juego">
        <View style={styles.esqueletoHeroe} />
        <View style={{ padding: 16, gap: 12 }}>
          <Bloque w="100%" h={150} r={12} />
          <Bloque w="100%" h={260} r={10} />
        </View>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>No se pudo cargar el juego</Text>
        <Text style={styles.errorHint}>
          {__DEV__
            ? `${awayCode} vs ${homeCode} · #${gamePk}. Revisa que el backend esté corriendo y accesible desde el celular.`
            : 'Revisa tu conexión e intenta de nuevo.'}
        </Text>
      </View>
    );
  }

  const cambiarTab = (t: GameTab) => {
    setTab(t);
    // Si se había bajado por el relato, la pestaña nueva empieza por arriba
    // y no a media página: a la altura del contenido, con el marcador ya
    // fuera de la vista. Si no se había bajado tanto, no se mueve nada.
    if (scrollY.current > inicioContenido.current) {
      scrollRef.current?.scrollTo({ y: inicioContenido.current, animated: false });
    }
  };

  // ── La disposición ────────────────────────────────────────────────────
  // Cabecera navy y franja se desplazan con el contenido (el patrón de
  // SofaScore: la cabecera se va). Las pestañas ya no se quedan pegadas
  // ARRIBA: van fijas al pie, sobre la barra de la app, en la zona del
  // pulgar. Es lo que más se toca en esta pantalla.
  return (
    <View style={styles.page}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScroll={e => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={64}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={COLORS.accent}
          />
        }
      >
        <HeroeJuego detail={detail} updating={updating} failed={failed} wp={wp} situacion={situacion} />

        {/* Lo que está pasando: solo con el juego en curso (el backend manda
            `situation` en null en la previa y al final). */}
        {situacion && detail.status === 'live' && (
          <Situacion
            situacion={situacion}
            jugada={jugadaDestacada(detail.plays)}
            turno={detail.at_bat}
            duelo={detail.matchup}
          />
        )}

        {/* La línea por entradas, a la vista: antes era una pestaña. En la
            previa no hay entradas y no se pinta. */}
        {detail.innings.length > 0 && (
          <View style={[styles.tarjetaLinea, !(situacion && detail.status === 'live') && { marginTop: 16 }]}>
            <InningGrid detail={detail} />
          </View>
        )}

        {/* Dos puntos como mínimo para que sea una curva. En la previa no hay
            estado que simular y no se pinta nada. */}
        {wp && wp.points.length >= 2 && detail.home.team_code && detail.away.team_code && (
          <View style={styles.tarjetaWp}>
            <WinProbBand
              points={wp.points}
              current={wp.current}
              homeCode={detail.home.team_code}
              awayCode={detail.away.team_code}
              headline={wp.headline}
              entradaActual={situacion?.inning ?? null}
            />
            {!!wp.key_plays?.length && (
              <JugadasClave
                jugadas={wp.key_plays}
                awayCode={detail.away.team_code}
                homeCode={detail.home.team_code}
              />
            )}
          </View>
        )}

        <Comparativa away={detail.away} home={detail.home} />

        <View
          onLayout={e => {
            inicioContenido.current = e.nativeEvent.layout.y;
          }}
        >
          {/* key={tab}: cada pestaña monta un Aparecer nuevo y entra con su
              fundido. */}
          <Aparecer key={tab}>
            {tab === 'relato' && <PlayByPlay detail={detail} />}
            {tab === 'boxscore' && <BoxScore home={detail.home} away={detail.away} />}
            {tab === 'alineaciones' && <Lineups home={detail.home} away={detail.away} />}
          </Aparecer>
        </View>
      </ScrollView>
      <GameTabs active={tab} onChange={cambiarTab} />
    </View>
  );
}

/**
 * La cabecera del juego: la misma franja navy de las fichas, con su corte en
 * diagonal, pero SIN el plano de color. Un juego es de dos clubes, y pintar
 * el color de uno solo diría que el juego es suyo. Cada club se identifica
 * con su teja y su código, como en todas partes.
 *
 * Compacta (6-oct, captura de SofaScore): los dos equipos a los lados y el
 * marcador al centro, con el estado y la media entrada arriba. Mide unos 60
 * pt menos que las dos filas de antes, y eso es pantalla para la situación.
 */
function HeroeJuego({
  detail,
  updating,
  failed,
  wp,
  situacion,
}: {
  detail: LiveGameDetail;
  updating: boolean;
  failed: boolean;
  wp: WinProbResponse | null;
  situacion: LiveSituation | null;
}) {
  const { away, home } = detail;
  const terminado = detail.status === 'final';

  // La línea de contexto junto al estado. En vivo, la media entrada del
  // estado vivo ("Alta del 8vo", o "Fin de la alta del 7mo" entre medias).
  // La del último punto de la curva queda de respaldo: no se mueve si la
  // probabilidad no cambia, y decía "Baja del 7mo" con Ohtani bateando en
  // la alta del 8vo.
  const ultimo = wp?.points[wp.points.length - 1];
  const contexto = failed
    ? 'Sin señal · último dato recibido'
    : terminado && !updating
      ? 'Resultado definitivo'
      : detail.status === 'live'
        ? (situacion?.half_over_label ?? situacion?.half_label ?? ultimo?.label ?? null)
        : null;

  const ganaVisita = terminado && away.runs > home.runs;
  const ganaLocal = terminado && home.runs > away.runs;

  return (
    <Heroe>
      <View style={styles.heroeArriba}>
        <StatusBadge status={detail.status} />
        {!!contexto && (
          <Text style={[styles.contexto, failed && styles.contextoAviso]} numberOfLines={1}>
            {contexto}
          </Text>
        )}
      </View>
      <View style={styles.marcador}>
        <LadoHeroe lado={away} />
        <View
          style={styles.centro}
          accessible
          accessibilityLabel={`${away.team_code ?? 'Visitante'} ${away.runs}, ${home.team_code ?? 'Local'} ${home.runs}${
            ganaVisita ? `. Ganó ${away.team_code}` : ganaLocal ? `. Ganó ${home.team_code}` : ''
          }`}
        >
          {/* El ganador lleva la marca escrita, apuntando a su lado: el
              tono solo no basta para quien no distingue contraste. */}
          <Text style={styles.marca}>{ganaVisita ? '◂' : ''}</Text>
          <Text style={[styles.carreras, away.runs < home.runs && styles.apagado]}>{away.runs}</Text>
          <Text style={styles.guion}>–</Text>
          <Text style={[styles.carreras, home.runs < away.runs && styles.apagado]}>{home.runs}</Text>
          <Text style={styles.marca}>{ganaLocal ? '▸' : ''}</Text>
        </View>
        <LadoHeroe lado={home} />
      </View>
    </Heroe>
  );
}

/** El nombre corto: el de LIDOM, o la última palabra ("Dodgers"). */
function nombreCorto(lado: LiveGameDetail['home']): string {
  const code = lado.team_code;
  if (code && TEAM_SHORT_NAMES[code]) return TEAM_SHORT_NAMES[code];
  return lado.team_name?.trim().split(/\s+/).slice(-1)[0] ?? code ?? '—';
}

/**
 * Un lado del marcador: teja, nombre corto y H · E, en columna. Teja y nombre
 * abren el equipo (un juego en vivo es de la temporada actual: la ficha abre
 * en ella sin pasarle `season`).
 */
function LadoHeroe({ lado }: { lado: LiveGameDetail['home'] }) {
  const nav = useFichas();
  const code = lado.team_code;
  const extra = [`H ${lado.hits}`, lado.errors != null ? `E ${lado.errors}` : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      disabled={!code}
      onPress={() => code && nav.push('Equipo', { code })}
      style={({ pressed }) => [styles.lado, pressed && { opacity: 0.7 }]}
      accessibilityRole={code ? 'link' : undefined}
      accessibilityLabel={`${lado.team_name ?? code ?? 'Equipo'}: ${lado.runs} ${
        lado.runs === 1 ? 'carrera' : 'carreras'
      }, ${lado.hits} hits`}
      accessibilityHint={code ? 'Abre el equipo' : undefined}
    >
      <TeamBadge code={code ?? '—'} size={44} variant="solid" />
      <Text style={styles.nombre} numberOfLines={1}>
        {nombreCorto(lado)}
      </Text>
      <Text style={styles.extra}>{extra}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.bgPage },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
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

  esqueletoHeroe: { height: 208, backgroundColor: COLORS.ink },
  heroeArriba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  contexto: { flexShrink: 1, color: COLORS.inkDim, fontSize: 12 },
  contextoAviso: { color: COLORS.inkFg },
  marcador: { flexDirection: 'row', alignItems: 'center' },
  lado: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4, paddingVertical: 2 },
  nombre: { color: COLORS.inkFg, fontSize: 14, fontWeight: '700', marginTop: 2 },
  extra: { color: COLORS.inkDim, fontSize: 11, fontVariant: ['tabular-nums'] },
  centro: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // El marcador en Bebas Neue, sin fontWeight (ver FONTS).
  carreras: {
    color: COLORS.inkFg,
    fontFamily: FONTS.display,
    fontSize: 56,
    lineHeight: 56,
    // Espacio para dibujar el remate de las cifras redondas en iOS sin mover
    // la cifra (ver recordValor en TeamScreen).
    paddingTop: 8,
    marginTop: -8,
    fontVariant: ['tabular-nums'],
    minWidth: 28,
    textAlign: 'center',
  },
  guion: { color: COLORS.inkDim, fontFamily: FONTS.display, fontSize: 36, lineHeight: 40 },
  apagado: { color: COLORS.inkDim },
  marca: { width: 10, color: COLORS.inkFg, fontSize: 14 },

  // La línea por entradas, en la pantalla principal.
  tarjetaLinea: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
  },

  tarjetaWp: {
    marginHorizontal: 16,
    marginBottom: 16,
    // Arriba sin relleno: la franja ya trae su margen de 16.
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
});
