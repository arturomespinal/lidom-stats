import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';

import { fetchGamelog, fetchPlayerProfile } from '../api';
import { COLORS, FONTS, TEAM_SHORT_NAMES, TEAM_STYLES } from '../constants';
import { entradas, fechaEs, num, pct3, rangoTemporadas } from '../formato';
import type { FichasParamList } from '../navigation';
import type {
  CareerBatting,
  CareerPitching,
  PlayerBattingSeason,
  PlayerPitchingSeason,
  Gamelog,
  PlayerProfile,
} from '../types';
import { EsqueletoFicha } from '../components/Esqueleto';
import Pestanas from '../components/Pestanas';
import { Aparecer } from '../components/Movimiento';
import Seccion from '../components/Seccion';
import TablaTemporadas, { Col } from '../components/TablaTemporadas';
import Heroe, { CifraHeroe, FilaCifras } from '../components/Heroe';
import { CifraAjustada, tamanoNombre } from '../components/Ajuste';
import Monograma from '../components/Monograma';
import PuestoLiga from '../components/PuestoLiga';
import CurvaCarrera from '../components/CurvaCarrera';
import Trayectoria from '../components/Trayectoria';
import JuegoAJuego from '../components/JuegoAJuego';

type Props = NativeStackScreenProps<FichasParamList, 'Jugador'>;
type Rol = 'bateo' | 'pitcheo';

/* Las columnas son las de la web (SeasonTable.tsx), en el mismo orden: quien
   usa las dos plataformas encuentra cada número donde lo dejó. */
export type FilaBateo = PlayerBattingSeason | CareerBatting;
export type FilaPitcheo = PlayerPitchingSeason | CareerPitching;

// Exportadas: la ficha de un histórico (HistoricoScreen) usa las mismas.
export const COLS_BATEO: Col<FilaBateo>[] = [
  { k: 'J', t: 'Juegos', val: f => String(f.games) },
  { k: 'AP', t: 'Apariciones al plato', val: f => String(f.pa), ancho: 48 },
  { k: 'VB', t: 'Veces al bate', val: f => String(f.ab), ancho: 48 },
  { k: 'H', t: 'Hits', val: f => String(f.h) },
  { k: '2B', t: 'Dobles', val: f => String(f.doubles) },
  { k: '3B', t: 'Triples', val: f => String(f.triples) },
  { k: 'HR', t: 'Jonrones', val: f => String(f.hr) },
  { k: 'CA', t: 'Carreras anotadas', val: f => String(f.r) },
  { k: 'CI', t: 'Carreras impulsadas', val: f => String(f.rbi) },
  { k: 'BR', t: 'Bases robadas', val: f => String(f.sb) },
  { k: 'BB', t: 'Bases por bolas', val: f => String(f.bb) },
  { k: 'K', t: 'Ponches', val: f => String(f.so) },
  { k: 'AVG', t: 'Promedio de bateo', val: f => pct3(f.avg), fuerte: true },
  { k: 'OBP', t: 'Porcentaje de embasado', val: f => pct3(f.obp), fuerte: true },
  { k: 'SLG', t: 'Slugging', val: f => pct3(f.slg), fuerte: true },
  { k: 'OPS', t: 'OBP más slugging', val: f => pct3(f.ops), fuerte: true },
];

export const COLS_PITCHEO: Col<FilaPitcheo>[] = [
  { k: 'J', t: 'Juegos', val: f => String(f.games) },
  { k: 'JI', t: 'Juegos iniciados', val: f => String(f.games_started) },
  { k: 'G', t: 'Ganados', val: f => String(f.wins) },
  { k: 'P', t: 'Perdidos', val: f => String(f.losses) },
  { k: 'SV', t: 'Salvados', val: f => String(f.saves) },
  { k: 'IP', t: 'Entradas lanzadas', val: f => entradas(f.innings_pitched), ancho: 56 },
  { k: 'H', t: 'Hits permitidos', val: f => String(f.h) },
  { k: 'CL', t: 'Carreras limpias', val: f => String(f.er) },
  { k: 'BB', t: 'Bases por bolas', val: f => String(f.bb) },
  { k: 'K', t: 'Ponches', val: f => String(f.so) },
  { k: 'EFE', t: 'Efectividad', val: f => num(f.era, 2), fuerte: true },
  { k: 'WHIP', t: 'Embasados por entrada', val: f => num(f.whip, 2), fuerte: true },
];

/** Una cifra de la franja navy de carrera. */
function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <View style={styles.cifra} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <CifraAjustada valor={valor} tamano={28} style={styles.cifraValor} />
      <Text style={styles.cifraEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

/**
 * La franja navy de la carrera: la firma del kit, puesta donde más pesa.
 *
 * Es lo primero que uno busca en una ficha —"¿cuánto batea de por vida?"— y
 * en la web está al pie de una tabla de dieciséis columnas que en un teléfono
 * obliga a desplazarse. Aquí va arriba, grande, y la tabla queda para quien
 * quiera el año a año. Las tasas las recompone el servidor (src/carrera.py):
 * este componente no calcula nada.
 */
export function FranjaCarrera({
  rol,
  bateo,
  pitcheo,
  titulo = 'Carrera en LIDOM',
}: {
  rol: Rol;
  bateo: CareerBatting | null;
  pitcheo: CareerPitching | null;
  titulo?: string;
}) {
  if (rol === 'bateo' && bateo) {
    const c = bateo;
    return (
      <View style={styles.franja}>
        <Text style={styles.franjaTitulo}>{titulo} · bateo</Text>
        <View style={styles.cifras}>
          <Cifra valor={pct3(c.avg)} etiqueta="AVG" />
          <Cifra valor={pct3(c.obp)} etiqueta="OBP" />
          <Cifra valor={pct3(c.slg)} etiqueta="SLG" />
          <Cifra valor={pct3(c.ops)} etiqueta="OPS" />
        </View>
        <Text style={styles.franjaPie}>
          {c.h} H · {c.hr} HR · {c.rbi} CI · {c.sb} BR · {c.seasons}{' '}
          {c.seasons === 1 ? 'temporada' : 'temporadas'}
        </Text>
      </View>
    );
  }
  if (rol === 'pitcheo' && pitcheo) {
    const c = pitcheo;
    return (
      <View style={styles.franja}>
        <Text style={styles.franjaTitulo}>{titulo} · pitcheo</Text>
        <View style={styles.cifras}>
          <Cifra valor={num(c.era, 2)} etiqueta="EFE" />
          <Cifra valor={num(c.whip, 2)} etiqueta="WHIP" />
          <Cifra valor={`${c.wins}-${c.losses}`} etiqueta="G-P" />
          <Cifra valor={String(c.so)} etiqueta="K" />
        </View>
        <Text style={styles.franjaPie}>
          {entradas(c.innings_pitched)} IP · {c.games} J · {c.games_started} JI · {c.saves} SV ·{' '}
          {c.seasons} {c.seasons === 1 ? 'temporada' : 'temporadas'}
        </Text>
      </View>
    );
  }
  return null;
}

/**
 * Ficha de un jugador: la misma información que la web, ordenada para el
 * pulgar.
 *
 * ── El orden ───────────────────────────────────────────────────────────────
 * Quién es (cabecera) → qué tan bueno es (franja de carrera) → dónde jugó
 * (trayectoria) → el año a año (tabla). En la web la carrera va al pie de la
 * tabla; en un teléfono eso la deja a dos pantallas de distancia.
 */
export default function PlayerScreen({ route, navigation }: Props) {
  const { playerId, nombre } = route.params;
  const [perfil, setPerfil] = useState<PlayerProfile | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [rol, setRol] = useState<Rol | null>(null);
  const [juegos, setJuegos] = useState<Gamelog | null>(null);
  // El ancho de la pantalla decide el tamaño del nombre de la cabecera.
  const { width: anchoPantalla } = useWindowDimensions();

  const cargar = useCallback(async () => {
    setEstado('cargando');
    const p = await fetchPlayerProfile(playerId);
    if (!p) {
      setEstado('error');
      return;
    }
    setPerfil(p);
    setEstado('listo');
    // El juego a juego de su última temporada, después de la ficha: la
    // cabecera no espera por él.
    if (p.context) setJuegos(await fetchGamelog(playerId, p.context.latest.season_id));
  }, [playerId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // La cabecera es navy: la barra de estado va en claro mientras esta
  // pantalla tiene el foco, y vuelve a oscura al salir.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  // El título pasa del nombre que traía el enlace al oficial de la ficha. Es
  // útil cuando la cabecera de la tarjeta ya se fue por arriba al desplazar.
  useLayoutEffect(() => {
    navigation.setOptions({ title: perfil?.player.full_name ?? nombre ?? 'Jugador' });
  }, [navigation, perfil, nombre]);

  if (estado === 'cargando' && !perfil) return <EsqueletoFicha />;

  if (estado === 'error' || !perfil) {
    return (
      <View style={styles.vacio}>
        <Text style={styles.vacioTexto}>No se pudo cargar la ficha.</Text>
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

  const bio = perfil.player;
  // El equipo de la temporada de la cabecera da el color y el nombre: si la
  // cabecera salta a una temporada con volumen (context.latest), el equipo
  // es el de ESA temporada. Sin contexto, el de la más reciente (las listas
  // llegan de la más nueva a la más vieja).
  const equipo =
    perfil.context?.latest.team_code ?? perfil.batting[0]?.team_code ?? perfil.pitching[0]?.team_code ?? null;
  const color = equipo ? TEAM_STYLES[equipo]?.primary : undefined;
  // Columna del 52 % dentro de los 16 pt de margen de la cabecera.
  const tamNombre = tamanoNombre(bio.full_name, (anchoPantalla - 32) * 0.52, 52);

  // Mismos umbrales que la web: un lanzador con tres turnos al bate no
  // necesita una tabla de bateo llena de ceros.
  // Sus años anteriores a 2012-13 (DIGIMETRICS), si jugó entonces. Con ellos
  // la franja y el pie de la tabla son la carrera COMPLETA, que el servidor
  // ya compuso con las dos fuentes.
  const historia = perfil.history;
  const carreraBateo = historia?.career_batting ?? perfil.career_batting;
  const carreraPitcheo = historia?.career_pitching ?? perfil.career_pitching;
  const equipos = historia?.teams ?? perfil.teams;

  const bateo =
    perfil.batting.length + (historia?.batting.length ?? 0) > 0 && (carreraBateo?.pa ?? 0) >= 10;
  const pitcheo =
    perfil.pitching.length + (historia?.pitching.length ?? 0) > 0 && (carreraPitcheo?.outs ?? 0) >= 9;
  const principal: Rol | null = perfil.is_pitcher
    ? pitcheo ? 'pitcheo' : bateo ? 'bateo' : null
    : bateo ? 'bateo' : pitcheo ? 'pitcheo' : null;
  const activo = rol ?? principal;

  const fisico = [
    bio.height_cm ? `${bio.height_cm} cm` : null,
    bio.weight_kg ? `${bio.weight_kg} kg` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const abrirEquipo = (code: string, season?: string) =>
    navigation.push('Equipo', { code, season });

  const ctx = perfil.context;
  /** Un número de la última temporada, o null si no viene. */
  const n = (k: string): number | null => {
    const v = ctx?.latest[k];
    return typeof v === 'number' ? v : null;
  };
  // El equipo de más volumen en cada temporada: pinta las épocas de la curva.
  const equipoPorTemporada: Record<string, string> = {};
  if (ctx) {
    const filas =
      ctx.role === 'batting'
        ? perfil.batting.map(f => ({ s: f.season_id, t: f.team_code, v: f.pa }))
        : perfil.pitching.map(f => ({ s: f.season_id, t: f.team_code, v: f.outs }));
    const mejor: Record<string, number> = {};
    for (const { s: temporada, t: code, v } of filas) {
      if (!(temporada in mejor) || v > mejor[temporada]) {
        mejor[temporada] = v;
        equipoPorTemporada[temporada] = code;
      }
    }
  }

  return (
    <ScrollView style={styles.pagina} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* ── Quién es ── La cabecera navy con el plano del club: ocupa el
          lugar de la foto. El monograma va sobre el plano; el texto, sobre
          el navy, siempre (ver Heroe.tsx). */}
      <Heroe color={color ?? COLORS.textSecondary}>
        <View style={styles.identidad}>
          <View style={styles.nombreCaja}>
            <Text style={styles.micro} numberOfLines={1}>
              {[equipo ? TEAM_SHORT_NAMES[equipo] ?? equipo : 'Sin equipo registrado', ctx?.latest.season_id]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {/* El tamaño lo decide la palabra más larga contra la columna del
                52 %; adjustsFontSizeToFit no es fiable en iOS (Ajuste.tsx). */}
            <Text
              style={[styles.nombre, { fontSize: tamNombre, lineHeight: Math.round(tamNombre * 0.92) }]}
              accessibilityRole="header"
              numberOfLines={3}
            >
              {bio.full_name}
            </Text>
            {/* La lateralidad llega traducida (bats_label): el cliente nunca
                traduce 'S', ver src/lateralidad.py. */}
            <Text style={styles.meta}>
              {[
                bio.age != null ? `${bio.age} años` : null,
                bio.bats_label ? `batea ${bio.bats_label.toLowerCase()}` : null,
                bio.throws_label ? `lanza ${bio.throws_label.toLowerCase()}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {(!!fisico || !!bio.birth_date || !!bio.nationality) && (
              <Text style={styles.meta}>
                {[bio.birth_date ? fechaEs(bio.birth_date) : null, bio.nationality, fisico || null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
          </View>
          <Monograma nombre={bio.full_name} />
        </View>
        {ctx && (
          <FilaCifras titulo={`Temporada ${ctx.latest.season_id}`}>
            {ctx.role === 'batting' ? (
              <>
                <CifraHeroe valor={pct3(n('ops'))} etiqueta="OPS" />
                <CifraHeroe valor={num(n('hr'))} etiqueta="HR" />
                <CifraHeroe valor={num(n('rbi'))} etiqueta="CI" />
                <CifraHeroe valor={pct3(n('avg'))} etiqueta="AVG" />
              </>
            ) : (
              <>
                <CifraHeroe valor={num(n('era'), 2)} etiqueta="EFE" />
                <CifraHeroe valor={`${num(n('wins'))}-${num(n('losses'))}`} etiqueta="G-P" />
                <CifraHeroe valor={num(n('so'))} etiqueta="K" />
                <CifraHeroe valor={entradas(n('innings_pitched'))} etiqueta="IP" />
              </>
            )}
          </FilaCifras>
        )}
      </Heroe>

      {/* ── Contra la liga ── El puesto entre los calificados de su última
          temporada calificada. Los puestos y la frase los pone el servidor. */}
      {ctx?.ranking && (
        <>
          <Seccion
            titulo="Contra la liga"
            nota={ctx.ranking.season_id}
            titular={ctx.ranking.headline}
            sub={
              `Entre ${ctx.ranking.pool} calificados ` +
              (ctx.role === 'batting' ? `(${ctx.ranking.minimum}+ AP).` : `(${entradas(ctx.ranking.minimum)}+ IP).`)
            }
          />
          <PuestoLiga ranking={ctx.ranking} />
        </>
      )}

      {/* ── La carrera en una curva ── */}
      {ctx && ctx.curve.points.length > 1 && (
        <>
          <Seccion
            titulo={`${ctx.curve.points.length} temporadas`}
            nota={ctx.curve.stat === 'era' ? 'EFE' : 'OPS'}
            titular={ctx.curve.headline}
            sub={
              ctx.role === 'batting'
                ? 'Punto hueco: menos de 50 AP.'
                : 'Más arriba, mejor. Punto hueco: menos de 10 entradas.'
            }
          />
          <CurvaCarrera curva={ctx.curve} equipoPorTemporada={equipoPorTemporada} />
        </>
      )}

      {/* ── Juego a juego ── Su última temporada, del más reciente al más
          viejo. Cada fila abre el juego. */}
      {ctx && juegos && (ctx.role === 'batting' ? juegos.batting : juegos.pitching).length > 0 && (
        <>
          <Seccion titulo="Juego a juego" nota={juegos.season_id} />
          <JuegoAJuego
            filas={ctx.role === 'batting' ? juegos.batting : juegos.pitching}
            onJuego={f =>
              navigation.push('Juego', {
                gameId: f.game_id,
                awayCode: f.side === 'home' ? f.opponent : f.team_code,
                homeCode: f.side === 'home' ? f.team_code : f.opponent,
              })
            }
          />
        </>
      )}

      {/* ── Dónde jugó ── Una barra partida por equipo, del largo de sus
          temporadas en cada uno. */}
      {equipos.length > 0 && (
        <>
          <Seccion
            titulo="Trayectoria"
            nota={`${equipos.length} ${equipos.length === 1 ? 'equipo' : 'equipos'}`}
          />
          <Trayectoria equipos={equipos} onEquipo={code => abrirEquipo(code)} />
        </>
      )}

      {/* ── Qué tan bueno ha sido ── La carrera entera, en la franja navy. */}
      {activo && <FranjaCarrera rol={activo} bateo={carreraBateo} pitcheo={carreraPitcheo} />}

      {/* ── El año a año ── Pestañas solo si hay dos roles que mostrar. */}
      {bateo && pitcheo ? (
        <View style={{ marginTop: 24 }}>
          <Pestanas
            llenar
            tabs={
              principal === 'pitcheo'
                ? [{ key: 'pitcheo', label: 'Pitcheo' }, { key: 'bateo', label: 'Bateo' }]
                : [{ key: 'bateo', label: 'Bateo' }, { key: 'pitcheo', label: 'Pitcheo' }]
            }
            active={activo ?? 'bateo'}
            onChange={setRol}
          />
        </View>
      ) : activo ? (
        <Seccion
          titulo={activo === 'bateo' ? 'Bateo' : 'Pitcheo'}
          nota="Temporada por temporada"
        />
      ) : null}

      {/* key: la tabla del otro rol entra con su fundido. */}
      <Aparecer key={activo ?? 'ninguno'}>
        {activo === 'bateo' && (
          <TablaTemporadas<FilaBateo>
            temporadas={perfil.batting}
            carrera={carreraBateo}
            cols={COLS_BATEO}
            onEquipo={abrirEquipo}
            historicas={historia?.batting}
          />
        )}
        {activo === 'pitcheo' && (
          <TablaTemporadas<FilaPitcheo>
            temporadas={perfil.pitching}
            carrera={carreraPitcheo}
            cols={COLS_PITCHEO}
            onEquipo={abrirEquipo}
            historicas={historia?.pitching}
          />
        )}
      </Aparecer>

      {!activo && (
        <Text style={styles.sinTabla}>
          Sin turnos ni entradas suficientes para mostrar.
        </Text>
      )}

      <Text style={styles.fuente}>
        {historia ? 'Fuentes: MLB Stats API y, antes de 2012-13, LIDOM.' : 'Fuente: MLB Stats API.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },

  identidad: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  // La columna de texto no pasa del 52% del ancho: el resto es del plano del
  // club, y letra blanca sobre el amarillo de Águilas no se lee (Heroe.tsx).
  nombreCaja: { width: '52%', gap: 6 },
  micro: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.inkDim,
  },
  nombre: {
    fontFamily: FONTS.display,
    paddingTop: 4,
    color: COLORS.inkFg,
  },
  meta: { fontSize: 13, lineHeight: 18, color: COLORS.inkDim },

  // La franja navy. Esquinas redondeadas parejas: la esquina cortada está
  // reservada a tejas y estados, y aquí no significaría nada.
  franja: {
    backgroundColor: COLORS.ink,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    padding: 16,
  },
  franjaTitulo: {
    fontSize: 11,
    color: COLORS.inkDim,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cifras: { flexDirection: 'row', marginTop: 8 },
  cifra: { flex: 1 },
  cifraValor: {
    color: COLORS.inkFg,
    fontVariant: ['tabular-nums'],
  },
  cifraEtiqueta: { fontSize: 11, color: COLORS.inkDim, letterSpacing: 0.6 },
  franjaPie: {
    fontSize: 11,
    color: COLORS.inkDim,
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
    fontVariant: ['tabular-nums'],
  },

  carrusel: { paddingHorizontal: 16, gap: 8 },
  chip: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingRight: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  chipTexto: { fontSize: 14, color: COLORS.textSupport, fontVariant: ['tabular-nums'] },
  presionado: { backgroundColor: COLORS.bgRaised },

  sinTabla: {
    margin: 16,
    padding: 16,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: 8,
  },
  fuente: { fontSize: 11, color: COLORS.textFaint, paddingHorizontal: 16, marginTop: 16 },

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
