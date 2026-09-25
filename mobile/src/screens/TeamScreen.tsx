import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchTeamProfile } from '../api';
import { DEFAULT_SEASON } from '../config';
import { COLORS, FONTS, TEAM_SHORT_NAMES, TEAM_STYLES } from '../constants';
import { conSigno, entradas, num, pct3, valorDestacado } from '../formato';
import type { FichasParamList } from '../navigation';
import type { TeamLeader, TeamProfile, TeamRosterBatter, TeamRosterPitcher } from '../types';
import { EsqueletoFicha } from '../components/Esqueleto';
import Pestanas from '../components/Pestanas';
import Seccion from '../components/Seccion';
import TeamBadge from '../components/TeamBadge';

type Props = NativeStackScreenProps<FichasParamList, 'Equipo'>;
type Plantilla = 'bateadores' | 'lanzadores';

/** Filas de plantilla antes de "Ver los 30". */
const VISIBLES = 12;

/** Un número grande con su etiqueta, para la cabecera. */
function Cifra({ valor, etiqueta, color }: { valor: string; etiqueta: string; color?: string }) {
  return (
    <View style={styles.cifra} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text
        style={[styles.cifraValor, color ? { color } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {valor}
      </Text>
      <Text style={styles.etiqueta} numberOfLines={1}>
        {etiqueta}
      </Text>
    </View>
  );
}

/**
 * Tarjeta de un destacado. La tarjeta ENTERA es el área táctil (96 pt de
 * alto): en un carrusel el dedo cae donde cae, no sobre el nombre.
 */
function Destacado({ l, onPress }: { l: TeamLeader; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.destacado, pressed && styles.presionado]}
      accessibilityRole="button"
      accessibilityLabel={`${l.label}: ${l.full_name}, ${valorDestacado(l.stat, l.value)}`}
    >
      <Text style={styles.etiqueta} numberOfLines={1}>
        {l.label}
        {/* El asterisco marca lo que lleva mínimo; la nota al pie lo explica. */}
        {l.qualified ? ' *' : ''}
      </Text>
      <Text style={styles.destacadoValor}>{valorDestacado(l.stat, l.value)}</Text>
      {/* Dos renglones: en una tarjeta de 136 pt, "Aderlin Rodríguez" en uno
          solo salía cortado, y el nombre es justo lo que se vino a leer. */}
      <Text style={styles.destacadoNombre} numberOfLines={2}>
        {l.full_name}
      </Text>
    </Pressable>
  );
}

/**
 * Una fila de la plantilla: nombre y la línea de conteo a la izquierda, la
 * tasa que decide (OPS o EFE) grande a la derecha, y el chevron que dice que
 * se puede entrar. 56 pt de alto: dos renglones y aire para el pulgar.
 */
function FilaJugador({
  nombre,
  linea,
  valor,
  clave,
  onPress,
}: {
  nombre: string;
  linea: string;
  valor: string;
  clave: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.filaJugador, pressed && styles.presionado]}
      accessibilityRole="button"
      accessibilityLabel={`${nombre}. ${linea}. ${clave} ${valor}`}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.jugador} numberOfLines={1}>
          {nombre}
        </Text>
        <Text style={styles.linea} numberOfLines={1}>
          {linea}
        </Text>
      </View>
      <View style={styles.clave}>
        <Text style={styles.claveValor}>{valor}</Text>
        <Text style={styles.claveEtiqueta}>{clave}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const lineaBateador = (j: TeamRosterBatter) =>
  `${j.games} J · ${j.pa} AP · ${pct3(j.avg)} · ${j.hr} HR · ${j.rbi} CI`;

const lineaLanzador = (j: TeamRosterPitcher) =>
  `${j.games} J · ${j.wins}-${j.losses} · ${entradas(j.innings_pitched)} IP · ${j.so} K` +
  (j.saves > 0 ? ` · ${j.saves} SV` : '');

/**
 * Ficha de un equipo.
 *
 * ── La temporada se elige con pestañas, arriba y pegadas ─────────────────
 * La web recibe la temporada por la URL y no tiene cómo cambiarla desde la
 * ficha. Aquí es un carrusel de pestañas —el patrón que piden las reglas
 * para navegación categórica densa, catorce temporadas— que se queda pegado
 * arriba al desplazar. Cambiarla recarga destacados y plantilla; la cabecera
 * y el año a año son los mismos para cualquier temporada.
 *
 * ── Al cambiar de temporada no se vacía la pantalla ─────────────────────
 * Lo anterior se queda, atenuado, hasta que llega lo nuevo. Un esqueleto a
 * cada toque haría saltar la página entera por un cambio que solo toca la
 * mitad de abajo.
 */
export default function TeamScreen({ route, navigation }: Props) {
  const code = route.params.code.toUpperCase();
  const [season, setSeason] = useState(route.params.season ?? DEFAULT_SEASON);
  const [equipo, setEquipo] = useState<TeamProfile | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [plantilla, setPlantilla] = useState<Plantilla>('bateadores');
  // La plantilla completa son 30 filas de 56 pt: 1.700 pt de lista que
  // empujan el año a año fuera de alcance. Se muestran las primeras —ya van
  // ordenadas por uso, así que son los regulares— y el resto a un toque.
  const [completa, setCompleta] = useState(false);
  const scroll = useRef<ScrollView>(null);
  // Cada petición lleva su número; solo la última puede escribir el estado.
  // Tocar tres temporadas seguidas dispara tres respuestas que llegan en
  // cualquier orden, y sin esto la pantalla podría quedarse con la segunda.
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setEstado('cargando');
    const e = await fetchTeamProfile(code, season);
    if (n !== pedido.current) return;
    if (!e) {
      setEstado('error');
      return;
    }
    setEquipo(e);
    setEstado('listo');
  }, [code, season]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: equipo?.short_name ?? TEAM_SHORT_NAMES[code] ?? code });
  }, [navigation, equipo, code]);

  if (!equipo && estado === 'cargando') return <EsqueletoFicha />;

  if (!equipo) {
    return (
      <View style={styles.vacio}>
        <Text style={styles.vacioTexto}>No se pudo cargar el equipo.</Text>
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

  const color = TEAM_STYLES[code]?.primary;
  const recargando = estado === 'cargando';

  // G y P son conteos: sumarlos en el cliente es seguro. Las TASAS nunca se
  // promedian aquí —el PCT histórico sale de los totales, no de la media de
  // catorce PCT—.
  const totalG = equipo.history.reduce((a, f) => a + f.wins, 0);
  const totalP = equipo.history.reduce((a, f) => a + f.losses, 0);
  const pctHistorico = totalG + totalP > 0 ? totalG / (totalG + totalP) : null;
  // La temporada ELEGIDA, no la más reciente: la cabecera tiene que hablar
  // del mismo año que los destacados y la plantilla que hay debajo.
  const actual = equipo.history.find(f => f.season_id === equipo.season_id);
  // La barra se escala contra la mejor campaña del propio equipo: de 0 a
  // 1.000, catorce temporadas entre .400 y .650 quedan en un tercio del ancho.
  const maxPct = Math.max(...equipo.history.map(f => f.win_pct ?? 0), 0.001);

  const destacados = [...equipo.leaders.batting, ...equipo.leaders.pitching];
  const lista = plantilla === 'bateadores' ? equipo.batters : equipo.pitchers;
  const hayTasa = destacados.some(l => l.qualified);

  const abrirJugador = (playerId: string, nombre: string) =>
    navigation.push('Jugador', { playerId, nombre });

  const elegirTemporada = (s: string) => {
    setSeason(s);
    setCompleta(false);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <ScrollView
      ref={scroll}
      style={styles.pagina}
      contentContainerStyle={{ paddingBottom: 32 }}
      stickyHeaderIndices={[1]}
    >
      {/* 0 ── Cabecera ── */}
      <View style={styles.cabecera}>
        {color && <View style={[styles.franjaClub, { backgroundColor: color }]} />}
        <View style={styles.identidad}>
          <TeamBadge code={code} size={48} variant="solid" />
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre} accessibilityRole="header" numberOfLines={2}>
              {equipo.team_name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {[equipo.city, equipo.founded_year && `fundado en ${equipo.founded_year}`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.cifras}>
          <Cifra valor={`${totalG}-${totalP}`} etiqueta={`${equipo.seasons_count} temp.`} />
          {pctHistorico != null && (
            <Cifra valor={pct3(pctHistorico)} etiqueta="PCT hist." />
          )}
          {actual && (
            <>
              <Cifra valor={`${actual.wins}-${actual.losses}`} etiqueta={actual.season_id} />
              {/* El signo va escrito: el color solo no se lee en deuteranopia. */}
              <Cifra
                valor={conSigno(actual.run_diff)}
                etiqueta="Diferencial"
                color={
                  actual.run_diff > 0
                    ? COLORS.positive
                    : actual.run_diff < 0
                      ? COLORS.negative
                      : undefined
                }
              />
            </>
          )}
        </View>
      </View>

      {/* 1 ── Selector de temporada, pegado arriba ── */}
      <Pestanas
        tabs={equipo.history.map(f => ({ key: f.season_id, label: f.season_id }))}
        active={equipo.season_id}
        onChange={elegirTemporada}
      />

      {/* 2 ── Lo que depende de la temporada ── */}
      <View style={recargando && styles.atenuado}>
        {destacados.length > 0 && (
          <>
            <Seccion titulo="Destacados" nota={equipo.season_id} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carrusel}
            >
              {destacados.map(l => (
                <Destacado
                  key={`${l.stat}-${l.player_id}`}
                  l={l}
                  onPress={() => abrirJugador(l.player_id, l.full_name)}
                />
              ))}
            </ScrollView>
            {hayTasa && (
              <Text style={styles.nota}>
                * Con mínimo: {equipo.min_pa} AP para el bateo, {entradas(equipo.min_ip)} IP
                para el pitcheo. Las acumuladas no llevan mínimo.
              </Text>
            )}
          </>
        )}

        <Seccion titulo="Plantilla" nota="Ordenada por uso" />
        <Pestanas
          llenar
          tabs={[
            { key: 'bateadores', label: `Bateadores (${equipo.batters.length})` },
            { key: 'lanzadores', label: `Lanzadores (${equipo.pitchers.length})` },
          ]}
          active={plantilla}
          onChange={k => {
            setPlantilla(k);
            setCompleta(false);
          }}
        />
        <View style={styles.lista}>
          {plantilla === 'bateadores' &&
            equipo.batters.slice(0, completa ? undefined : VISIBLES).map(j => (
              <FilaJugador
                key={j.player_id}
                nombre={j.full_name}
                linea={lineaBateador(j)}
                valor={pct3(j.ops)}
                clave="OPS"
                onPress={() => abrirJugador(j.player_id, j.full_name)}
              />
            ))}
          {plantilla === 'lanzadores' &&
            equipo.pitchers.slice(0, completa ? undefined : VISIBLES).map(j => (
              <FilaJugador
                key={j.player_id}
                nombre={j.full_name}
                linea={lineaLanzador(j)}
                valor={num(j.era, 2)}
                clave="EFE"
                onPress={() => abrirJugador(j.player_id, j.full_name)}
              />
            ))}
          {lista.length === 0 && (
            <Text style={styles.sinDatos}>No hay plantilla registrada para {equipo.season_id}.</Text>
          )}
          {!completa && lista.length > VISIBLES && (
            <Pressable
              onPress={() => setCompleta(true)}
              style={({ pressed }) => [styles.verTodos, pressed && styles.presionado]}
              accessibilityRole="button"
            >
              <Text style={styles.verTodosTexto}>
                Ver los {lista.length} {plantilla === 'bateadores' ? 'bateadores' : 'lanzadores'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* 3 ── Temporada a temporada ── */}
      <Seccion titulo="Temporada a temporada" nota="Solo temporada regular" />
      <View style={styles.lista}>
        <View style={[styles.filaHist, styles.cabHist]}>
          <Text style={[styles.cab, styles.colTemp]}>Temp.</Text>
          <Text style={[styles.cab, styles.colGP]}>G-P</Text>
          <Text style={[styles.cab, styles.colPct]}>PCT</Text>
          <View style={styles.colBarra} />
          <Text style={[styles.cab, styles.colDif]}>DIF</Text>
        </View>
        {equipo.history.map(f => {
          const elegida = f.season_id === equipo.season_id;
          const pct = f.win_pct ?? 0;
          return (
            <Pressable
              key={f.season_id}
              onPress={() => elegirTemporada(f.season_id)}
              style={({ pressed }) => [
                styles.filaHist,
                elegida && styles.filaElegida,
                pressed && styles.presionado,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: elegida }}
              accessibilityLabel={`${f.season_id}: ${f.wins} ganados, ${f.losses} perdidos, diferencial ${conSigno(f.run_diff)}`}
            >
              {elegida && <View style={styles.marcaElegida} />}
              <Text style={[styles.celda, styles.colTemp, elegida && styles.fuerte]}>
                {f.season_id}
              </Text>
              <Text style={[styles.celda, styles.colGP]}>
                {f.wins}-{f.losses}
              </Text>
              <Text style={[styles.celda, styles.fuerte, styles.colPct]}>{pct3(f.win_pct)}</Text>
              <View style={styles.colBarra}>
                <View style={styles.pista}>
                  <View
                    style={[
                      styles.relleno,
                      { width: `${(pct / maxPct) * 100}%`, backgroundColor: color ?? COLORS.textSecondary },
                    ]}
                  />
                </View>
              </View>
              <Text
                style={[
                  styles.celda,
                  styles.fuerte,
                  styles.colDif,
                  {
                    color:
                      f.run_diff > 0
                        ? COLORS.positive
                        : f.run_diff < 0
                          ? COLORS.negative
                          : COLORS.textSupport,
                  },
                ]}
              >
                {conSigno(f.run_diff)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.nota}>
        Toca una temporada para ver sus destacados y su plantilla. Las barras se
        escalan contra la mejor campaña del propio equipo.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },

  cabecera: {
    backgroundColor: COLORS.bgCard,
    padding: 16,
    paddingLeft: 20,
  },
  franjaClub: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  identidad: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  nombre: {
    fontFamily: FONTS.display,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: 0.3,
    color: COLORS.textPrimary,
  },
  sub: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  cifras: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  cifra: { flex: 1, paddingRight: 8 },
  cifraValor: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  etiqueta: {
    fontSize: 11,
    color: COLORS.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  atenuado: { opacity: 0.45 },

  carrusel: { paddingHorizontal: 16, gap: 8 },
  destacado: {
    width: 136,
    minHeight: 96,
    // Arriba y con separación fija, no `space-between`: con un nombre de dos
    // renglones y otro de uno, el número quedaba a distinta altura en cada
    // tarjeta y la fila de cifras se leía torcida.
    gap: 4,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  destacadoValor: {
    fontFamily: FONTS.display,
    fontSize: 28,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  destacadoNombre: { fontSize: 14, color: COLORS.textSupport },

  nota: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  lista: {
    backgroundColor: COLORS.bgCard,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  filaJugador: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  jugador: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  linea: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  clave: { alignItems: 'flex-end', minWidth: 48 },
  claveValor: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  claveEtiqueta: { fontSize: 11, color: COLORS.textSecondary },
  chevron: { fontSize: 22, color: COLORS.textFaint, width: 16, textAlign: 'center' },
  presionado: { backgroundColor: COLORS.bgRaised },
  verTodos: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  verTodosTexto: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  sinDatos: { padding: 16, fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },

  filaHist: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  cabHist: { height: 32, backgroundColor: COLORS.bgHeader },
  cab: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // La temporada elegida: raya navy a la izquierda y el año en negrita. La
  // raya es la misma señal que la pestaña activa, girada.
  filaElegida: { backgroundColor: COLORS.bgPage },
  marcaElegida: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: COLORS.accent,
  },
  celda: { fontSize: 14, color: COLORS.textSupport, fontVariant: ['tabular-nums'] },
  fuerte: { color: COLORS.textPrimary, fontWeight: '700' },
  colTemp: { width: 64 },
  colGP: { width: 48, textAlign: 'right' },
  colPct: { width: 40, textAlign: 'right' },
  colBarra: { flex: 1, justifyContent: 'center' },
  colDif: { width: 40, textAlign: 'right' },
  pista: { height: 6, borderRadius: 3, backgroundColor: COLORS.bgSunken, overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: 3 },

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
});
