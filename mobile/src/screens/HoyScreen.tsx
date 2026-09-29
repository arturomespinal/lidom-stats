import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import { fetchDay } from '../api';
import { COLORS, FONTS } from '../constants';
import type { LiveStackParamList } from '../navigation';
import type { Jornada, JuegoJornada } from '../types';
import Seccion from '../components/Seccion';
import { Bloque } from '../components/Esqueleto';
import {
  CarruselFiguras,
  FilaProxima,
  FranjaFechas,
  TarjetaDestacado,
  TarjetaJuego,
} from '../components/Jornada';

type Props = NativeStackScreenProps<LiveStackParamList, 'Hoy'>;

/**
 * La portada: lo que pasó (o pasa) hoy en LIDOM.
 *
 * ── El orden ───────────────────────────────────────────────────────────────
 * El juego destacado arriba y grande —el momento héroe de la pantalla—, los
 * demás resultados, las figuras de la jornada y lo que viene. Encima, la
 * franja de fechas, pegada al desplazar.
 *
 * ── Fuera de temporada ─────────────────────────────────────────────────────
 * "Hoy" no tiene juegos nueve meses al año. El servidor devuelve la última
 * jornada con `is_requested: false`, y la pantalla lo dice en vez de llamarla
 * "hoy": una portada vacía no le sirve a nadie, y una que miente, menos.
 *
 * ── En vivo ────────────────────────────────────────────────────────────────
 * Con juegos en curso el servidor manda `poll_seconds` y la pantalla vuelve a
 * pedir la jornada a ese ritmo mientras tiene el foco. Se programa después de
 * cada respuesta, no con setInterval, para que las peticiones no se apilen.
 */
export default function HoyScreen({ navigation }: Props) {
  const [fecha, setFecha] = useState<string | undefined>(undefined);
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [refrescando, setRefrescando] = useState(false);
  // Solo la última petición escribe: tocar tres fechas seguidas dispara tres
  // respuestas que llegan en cualquier orden.
  const pedido = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const hayDato = useRef(false);

  const cargar = useCallback(async (silencioso = false) => {
    const n = ++pedido.current;
    if (!silencioso) setEstado('cargando');
    const j = await fetchDay(fecha);
    if (n !== pedido.current) return;
    if (!j) {
      // Un fallo de red no borra lo que ya se mostraba.
      setEstado(hayDato.current ? 'listo' : 'error');
      return;
    }
    hayDato.current = true;
    setJornada(j);
    setEstado('listo');
  }, [fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Sondeo mientras haya juegos en curso y la pantalla tenga el foco.
  const poll = jornada?.poll_seconds ?? null;
  useFocusEffect(
    useCallback(() => {
      if (!poll) return undefined;
      const t = setTimeout(() => cargar(true), poll * 1000);
      return () => clearTimeout(t);
    }, [poll, cargar, jornada]),
  );

  const refrescar = async () => {
    setRefrescando(true);
    await cargar(true);
    setRefrescando(false);
  };

  const elegirFecha = (d: string) => {
    setFecha(d);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const abrirJuego = (j: JuegoJornada) =>
    j.has_detail && j.game_pk
      ? () => navigation.push('GameDetail', { gamePk: j.game_pk!, awayCode: j.away.code, homeCode: j.home.code })
      : undefined;
  const abrirJugador = (playerId: string, nombre: string) =>
    navigation.push('Jugador', { playerId, nombre });

  if (!jornada) {
    if (estado === 'error') {
      return (
        <View style={styles.vacio}>
          <Text style={styles.vacioTexto}>No se pudo cargar la jornada.</Text>
          <Pressable
            onPress={() => cargar()}
            style={({ pressed }) => [styles.boton, pressed && styles.presionado]}
            accessibilityRole="button"
          >
            <Text style={styles.botonTexto}>Reintentar</Text>
          </Pressable>
        </View>
      );
    }
    return <EsqueletoHoy />;
  }

  const destacado = jornada.featured
    ? jornada.games.find(g => g.game_id === jornada.featured!.game_id)
    : undefined;
  const resto = jornada.games.filter(g => g !== destacado);
  const titulo = jornada.is_today ? 'Hoy' : jornada.label;
  // Sin fecha elegida se pidió "hoy". Si no hubo juegos, el servidor mandó la
  // jornada anterior más cercana; sin jornada siguiente, fue la última.
  const temporada = jornada.season_id ? ` de la temporada ${jornada.season_id}` : '';
  const nota = !jornada.is_requested
    ? `${fecha === undefined ? 'No hay juegos hoy.' : 'No hubo juegos ese día.'} ` +
      (jornada.next ? 'Esta es la jornada anterior.' : `Esta fue la última jornada${temporada}.`)
    : `${jornada.games.length} ${jornada.games.length === 1 ? 'juego' : 'juegos'}${jornada.season_id ? ` · temporada ${jornada.season_id}` : ''}`;
  const prox = jornada.next;
  const tituloProx = prox && prox.days_ahead === 1 && jornada.is_today ? 'Mañana' : prox?.label;
  const recargando = estado === 'cargando';

  return (
    <ScrollView
      ref={scroll}
      style={styles.pagina}
      contentContainerStyle={{ paddingBottom: 32 }}
      stickyHeaderIndices={[0]}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
    >
      {/* 0 ── La franja de fechas, pegada arriba ── */}
      <FranjaFechas dias={jornada.strip} activa={jornada.date} onDia={elegirFecha} />

      <View style={recargando && styles.atenuado}>
        <View style={styles.encabezado}>
          <Text style={styles.titulo} accessibilityRole="header">
            {titulo}
          </Text>
          <Text style={styles.nota}>{nota}</Text>
        </View>

        {/* Con juegos en curso, la puerta a los marcadores completos: cuenta,
            outs, corredores. La portada da el resumen; aquello, el detalle. */}
        {jornada.any_live && (
          <Pressable
            onPress={() => navigation.push('LiveList')}
            style={({ pressed }) => [styles.enVivo, pressed && styles.presionado]}
            accessibilityRole="button"
          >
            <View style={styles.punto} />
            <Text style={styles.enVivoTexto}>Marcadores en vivo</Text>
            <Text style={styles.enVivoFlecha}>›</Text>
          </Pressable>
        )}

        {destacado && jornada.featured && (
          <TarjetaDestacado
            juego={destacado}
            destacado={jornada.featured}
            onAbrir={abrirJuego(destacado)}
            onJugador={p => abrirJugador(p.player_id, p.full_name)}
          />
        )}

        {resto.length > 0 && (
          <>
            <Seccion
              titulo={jornada.games.every(g => g.status === 'final') ? 'Resultados' : 'Juegos'}
              nota={`${resto.length} más`}
            />
            <View style={styles.lista}>
              {resto.map(g => (
                <TarjetaJuego key={g.game_id} juego={g} onAbrir={abrirJuego(g)} />
              ))}
            </View>
          </>
        )}

        {jornada.figures.length > 0 && (
          <>
            <Seccion
              titulo="Figuras de la jornada"
              sub="Bateo: bases totales, impulsadas, anotadas, boletos y robos. Pitcheo: Game Score, con 3 entradas o más."
            />
            <CarruselFiguras figuras={jornada.figures} onJugador={f => abrirJugador(f.player_id, f.full_name)} />
          </>
        )}

        {prox && (
          <>
            <Seccion titulo={tituloProx ?? prox.label} nota={tituloProx === 'Mañana' ? prox.label : undefined} />
            <View style={styles.proximas}>
              {prox.games.map(g => (
                <FilaProxima key={g.game_id} juego={g} />
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

/** La forma de la portada mientras llega el dato: no salta al llegar. */
function EsqueletoHoy() {
  return (
    <View style={[styles.pagina, { gap: 12 }]} accessibilityLabel="Cargando la jornada">
      <View style={{ flexDirection: 'row', gap: 4, padding: 12 }}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={{ flex: 1 }}>
            <Bloque w="100%" h={60} r={8} />
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <Bloque w="40%" h={28} />
        <Bloque w="100%" h={260} r={12} />
        <Bloque w="100%" h={110} r={10} />
        <Bloque w="100%" h={110} r={10} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },
  atenuado: { opacity: 0.5 },
  encabezado: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 2 },
  // Bebas sin fontWeight (ver FONTS).
  titulo: { fontFamily: FONTS.display, fontSize: 34, lineHeight: 36, color: COLORS.textPrimary },
  nota: { fontSize: 12, lineHeight: 17, color: COLORS.textSecondary },
  lista: { paddingHorizontal: 16, gap: 8 },
  enVivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.live },
  enVivoTexto: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  enVivoFlecha: { fontSize: 18, color: COLORS.textSecondary },
  proximas: {
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
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
