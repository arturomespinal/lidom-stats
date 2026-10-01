import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, TEAM_SHORT_NAMES } from '../constants';
import type {
  DiaFranja,
  EstadoJornada,
  FiguraJornada,
  Jornada,
  JuegoJornada,
  LiveStatus,
  PitcherDecision,
} from '../types';
import StatusBadge from './StatusBadge';
import TeamBadge from './TeamBadge';
import WinProbBand from './WinProbBand';
import { Tocable } from './Movimiento';
import { useFichas } from '../navigation';

/*
 * Las piezas de la portada "Hoy". Todo lo que dice algo —qué juego se
 * destaca, su titular, quiénes son las figuras— lo decide el servidor
 * (src/jornada.py); aquí solo se dibuja.
 */

/** El estado de la jornada, en los cuatro que conoce StatusBadge. */
function estadoBadge(st: EstadoJornada): LiveStatus {
  if (st === 'live') return 'live';
  if (st === 'final') return 'final';
  if (st === 'scheduled') return 'preview';
  return 'other';
}

// ── La franja de fechas ─────────────────────────────────────────────────────

/**
 * Siete días con la jornada en el centro. Un día sin juegos va atenuado y no
 * se puede tocar: el servidor lo resolvería a otra fecha y el toque parecería
 * no hacer caso. Tocar un extremo recentra la franja, así que se puede
 * caminar la temporada día a día.
 */
export function FranjaFechas({
  dias,
  activa,
  onDia,
}: {
  dias: DiaFranja[];
  activa: string;
  onDia: (fecha: string) => void;
}) {
  return (
    <View style={styles.franja}>
      {dias.map(d => {
        const es = d.date === activa;
        const vacio = d.games === 0;
        const [dia, num] = d.label.split(' ');
        return (
          <Tocable
            key={d.date}
            contenedor={styles.diaCaja}
            disabled={vacio || es}
            onPress={() => onDia(d.date)}
            style={({ pressed }) => [styles.dia, es && styles.diaActivo, pressed && styles.presionado]}
            accessibilityRole="button"
            accessibilityState={{ selected: es, disabled: vacio }}
            accessibilityLabel={`${d.label}, ${vacio ? 'sin juegos' : `${d.games} ${d.games === 1 ? 'juego' : 'juegos'}`}`}
          >
            <Text style={[styles.diaNombre, es && styles.diaTextoActivo, vacio && styles.diaVacio]}>{dia}</Text>
            <Text style={[styles.diaNumero, es && styles.diaTextoActivo, vacio && styles.diaVacio]}>{num}</Text>
            <Text style={[styles.diaJuegos, es && styles.diaSubActivo, vacio && styles.diaVacio]}>
              {vacio ? '—' : d.games}
            </Text>
          </Tocable>
        );
      })}
    </View>
  );
}

// ── Las filas de equipo ────────────────────────────────────────────────────

/**
 * Teja y nombre abren la ficha del equipo en la temporada del juego. Es un
 * Pressable dentro de la tarjeta (que abre el juego): el toque lo toma el más
 * interno, así que el equipo abre el equipo y el resto de la tarjeta, el
 * juego. El marcador queda fuera a propósito: tocar el 6 es tocar el juego.
 */
function FilaEquipo({
  lado,
  gano,
  perdio,
  grande = false,
  temporada,
}: {
  lado: JuegoJornada['home'];
  gano: boolean;
  perdio: boolean;
  grande?: boolean;
  temporada?: string;
}) {
  const nav = useFichas();
  return (
    <View style={[styles.filaEquipo, grande && styles.filaEquipoGrande]}>
      <Pressable
        onPress={() => nav.push('Equipo', { code: lado.code, season: temporada })}
        hitSlop={{ top: 4, bottom: 4 }}
        style={({ pressed }) => [styles.equipoTocable, pressed && styles.equipoPresionado]}
        accessibilityRole="link"
        accessibilityLabel={`Abrir ${lado.name}`}
      >
        <TeamBadge code={lado.code} size={grande ? 36 : 28} variant={grande ? 'solid' : 'outline'} />
        <Text style={[styles.equipo, grande && styles.equipoGrande, perdio && styles.apagado]} numberOfLines={1}>
          {grande ? lado.name : lado.short_name}
        </Text>
      </Pressable>
      {lado.runs != null && (
        <Text style={[styles.carreras, grande && styles.carrerasGrande, perdio && styles.apagado]}>
          {lado.runs}
        </Text>
      )}
      {/* El ganador lleva la marca escrita, no solo el tono: el gris del
          perdedor solo no basta para quien no distingue el contraste. */}
      <Text style={styles.marcaGanador} accessibilityElementsHidden>
        {gano ? '◂' : ''}
      </Text>
    </View>
  );
}

function Decisiones({
  d,
  onJugador,
}: {
  d: NonNullable<JuegoJornada['decisions']>;
  onJugador: (p: PitcherDecision) => void;
}) {
  const partes: [string, PitcherDecision | undefined][] = [
    ['G', d.win],
    ['P', d.loss],
    ['SV', d.save],
  ];
  return (
    <View style={styles.decisiones}>
      {partes
        .filter(([, p]) => p)
        .map(([sigla, p]) => (
          <Pressable
            key={sigla}
            onPress={() => onJugador(p!)}
            hitSlop={{ top: 12, bottom: 12 }}
            accessibilityRole="link"
            accessibilityLabel={`${sigla === 'G' ? 'Ganador' : sigla === 'P' ? 'Perdedor' : 'Salvado'}: ${p!.full_name}`}
          >
            <Text style={styles.decision}>
              <Text style={styles.decisionSigla}>{sigla} </Text>
              {p!.full_name}
            </Text>
          </Pressable>
        ))}
    </View>
  );
}

// ── El destacado ───────────────────────────────────────────────────────────

/**
 * El juego de la portada. El que se juega ahora si hay alguno, y si no el de
 * entradas extra o el más apretado. Con la franja de probabilidad cuando la
 * caché en vivo lo siguió, y el titular que escribe el servidor.
 */
export function TarjetaDestacado({
  juego,
  destacado,
  onAbrir,
  onJugador,
  etiqueta = 'Juego destacado',
  accion = 'Ver el juego ›',
  temporada,
}: {
  juego: JuegoJornada;
  /** La temporada del juego: los equipos abren su ficha en ella. */
  temporada?: string;
  destacado: Pick<NonNullable<Jornada['featured']>, 'headline' | 'win_prob'>;
  onAbrir?: () => void;
  onJugador: (p: PitcherDecision) => void;
  /** Lo que dice arriba a la izquierda. En la página del juego, la fecha. */
  etiqueta?: string;
  /** El texto de la franja navy: "Ver el juego ›" o "Relato y línea ›". */
  accion?: string;
}) {
  const wp = destacado.win_prob;
  return (
    <View style={styles.tarjeta}>
      <View style={styles.cabeza}>
        <Text style={styles.micro}>{etiqueta}</Text>
        <StatusBadge status={estadoBadge(juego.status)} label={juego.status_label} />
      </View>
      <View style={styles.cuerpo}>
        <FilaEquipo lado={juego.away} gano={juego.winner === juego.away.code} perdio={!!juego.winner && juego.winner !== juego.away.code} grande temporada={temporada} />
        <FilaEquipo lado={juego.home} gano={juego.winner === juego.home.code} perdio={!!juego.winner && juego.winner !== juego.home.code} grande temporada={temporada} />
        {juego.status === 'scheduled' && !!juego.time_local && (
          <Text style={styles.hora}>{juego.time_local}</Text>
        )}
      </View>
      {wp && (
        <View style={styles.franjaWp}>
          {/* El titular va una sola vez: abajo, en negrita. La franja no lo repite. */}
          <WinProbBand
            points={wp.points}
            current={wp.current}
            homeCode={wp.home_team}
            awayCode={wp.away_team}
            headline={null}
          />
        </View>
      )}
      {!!destacado.headline && <Text style={styles.titular}>{destacado.headline}</Text>}
      {!!juego.decisions && <Decisiones d={juego.decisions} onJugador={onJugador} />}
      <Banda venue={juego.venue} onAbrir={onAbrir} accion={accion} />
    </View>
  );
}

/** La franja navy de contexto, el pie de tarjeta del kit. */
function Banda({
  venue,
  onAbrir,
  accion = 'Ver el juego ›',
}: {
  venue: string | null;
  onAbrir?: () => void;
  accion?: string;
}) {
  const contenido = (
    <>
      <Text style={styles.bandaEstadio} numberOfLines={1}>
        {(venue ?? 'Estadio por confirmar').toUpperCase()}
      </Text>
      {!!onAbrir && <Text style={styles.bandaAccion}>{accion}</Text>}
    </>
  );
  if (!onAbrir) return <View style={styles.banda}>{contenido}</View>;
  return (
    <Pressable
      onPress={onAbrir}
      style={({ pressed }) => [styles.banda, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={accion.replace(' ›', '')}
    >
      {contenido}
    </Pressable>
  );
}

// ── Un resultado ───────────────────────────────────────────────────────────

/**
 * Una tarjeta chica por juego. Se abre si hay algo que abrir: el detalle en
 * vivo, o el boxscore de la base si ya terminó. Un juego que no ha empezado
 * no parece tocable, porque no lo es.
 */
export function TarjetaJuego({
  juego,
  onAbrir,
  temporada,
}: {
  juego: JuegoJornada;
  onAbrir?: () => void;
  temporada?: string;
}) {
  const nav = useFichas();
  const perdio = (code: string) => !!juego.winner && juego.winner !== code;
  const cuerpo = (
    <>
      <View style={styles.cabeza}>
        <Text style={styles.micro} numberOfLines={1}>
          {juego.venue ?? 'Estadio por confirmar'}
        </Text>
        <StatusBadge status={estadoBadge(juego.status)} label={juego.status_label} />
      </View>
      <View style={styles.cuerpoChico}>
        <FilaEquipo lado={juego.away} gano={juego.winner === juego.away.code} perdio={perdio(juego.away.code)} temporada={temporada} />
        <FilaEquipo lado={juego.home} gano={juego.winner === juego.home.code} perdio={perdio(juego.home.code)} temporada={temporada} />
      </View>
      {!!onAbrir && <Text style={styles.abrir}>Ver el juego ›</Text>}
    </>
  );
  const etiqueta =
    `${juego.away.short_name} ${juego.away.runs ?? ''}, ${juego.home.short_name} ${juego.home.runs ?? ''}. ` +
    `${juego.status_label}.`;
  // Con el lector de pantalla la tarjeta es UN elemento y sus filas no se
  // alcanzan por separado: los dos equipos van como acciones de la tarjeta.
  const acciones = [
    { name: 'visitante', label: `Abrir ${juego.away.name}` },
    { name: 'local', label: `Abrir ${juego.home.name}` },
  ];
  const alAccionar = (e: { nativeEvent: { actionName: string } }) => {
    const lado = e.nativeEvent.actionName === 'visitante' ? juego.away : juego.home;
    nav.push('Equipo', { code: lado.code, season: temporada });
  };
  if (!onAbrir) {
    return (
      <View
        style={styles.tarjetaChica}
        accessible
        accessibilityLabel={etiqueta}
        accessibilityActions={acciones}
        onAccessibilityAction={alAccionar}
      >
        {cuerpo}
      </View>
    );
  }
  return (
    <Tocable
      onPress={onAbrir}
      style={({ pressed }) => [styles.tarjetaChica, pressed && styles.presionado]}
      accessibilityRole="button"
      accessibilityLabel={`${etiqueta} Ver el juego`}
      accessibilityActions={[{ name: 'activate' }, ...acciones]}
      onAccessibilityAction={e => (e.nativeEvent.actionName === 'activate' ? onAbrir() : alAccionar(e))}
    >
      {cuerpo}
    </Tocable>
  );
}

// ── Las figuras ────────────────────────────────────────────────────────────

export function CarruselFiguras({
  figuras,
  onJugador,
}: {
  figuras: FiguraJornada[];
  onJugador: (f: FiguraJornada) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carrusel}>
      {figuras.map(f => (
        <Tocable
          key={`${f.kind}-${f.player_id}`}
          onPress={() => onJugador(f)}
          style={({ pressed }) => [styles.figura, pressed && styles.presionado]}
          accessibilityRole="button"
          accessibilityLabel={`${f.kind === 'batting' ? 'Bateo' : 'Pitcheo'}: ${f.full_name}, ${f.line}, contra ${TEAM_SHORT_NAMES[f.opponent] ?? f.opponent}`}
        >
          <View style={styles.figuraCabeza}>
            <TeamBadge code={f.team_code} size={24} variant="outline" />
            <Text style={styles.micro}>{f.kind === 'batting' ? 'Bateo' : 'Pitcheo'}</Text>
          </View>
          <Text style={styles.figuraNombre} numberOfLines={2}>
            {f.full_name}
          </Text>
          <Text style={styles.figuraLinea}>{f.line}</Text>
          <Text style={styles.figuraRival}>vs {TEAM_SHORT_NAMES[f.opponent] ?? f.opponent}</Text>
        </Tocable>
      ))}
    </ScrollView>
  );
}

// ── Lo que viene ───────────────────────────────────────────────────────────

/**
 * Un juego de la próxima jornada en una fila: "AGU en TOR", la hora y el
 * estadio. Si la próxima jornada ya se jugó —mirando una fecha vieja— lleva
 * el marcador en vez de la hora.
 */
export function FilaProxima({ juego }: { juego: JuegoJornada }) {
  const jugado = juego.status === 'final';
  return (
    <View
      style={styles.proxima}
      accessible
      accessibilityLabel={
        `${juego.away.short_name} en ${juego.home.short_name}, ` +
        (jugado ? `${juego.away.runs}-${juego.home.runs}` : juego.status_label) +
        (juego.venue ? `, ${juego.venue}` : '')
      }
    >
      <View style={styles.proximaEquipos}>
        <TeamBadge code={juego.away.code} size={28} variant="outline" />
        <Text style={styles.proximaEn}>en</Text>
        <TeamBadge code={juego.home.code} size={28} variant="outline" />
      </View>
      <View style={styles.proximaDatos}>
        <Text style={styles.proximaHora}>
          {jugado ? `${juego.away.runs}-${juego.home.runs} · ${juego.status_label}` : juego.status_label}
        </Text>
        {!!juego.venue && (
          <Text style={styles.proximaEstadio} numberOfLines={1}>
            {juego.venue}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  presionado: { backgroundColor: COLORS.bgRaised },

  franja: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.bgPage,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  // La caja de Tocable es la que se reparte el ancho; el día la llena.
  diaCaja: { flex: 1 },
  dia: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    gap: 1,
  },
  diaActivo: { backgroundColor: COLORS.ink },
  diaNombre: { fontSize: 11, color: COLORS.textSecondary },
  // Bebas sin fontWeight (ver FONTS).
  diaNumero: { fontFamily: FONTS.display, fontSize: 22, lineHeight: 24, color: COLORS.textPrimary },
  diaJuegos: { fontSize: 10, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  diaTextoActivo: { color: COLORS.inkFg },
  diaSubActivo: { color: COLORS.inkDim },
  diaVacio: { opacity: 0.45 },

  tarjeta: {
    marginHorizontal: 16,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tarjetaChica: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  cabeza: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  micro: {
    flexShrink: 1,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  cuerpo: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  cuerpoChico: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },

  filaEquipo: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  // Teja + nombre: lo tocable de la fila. Ocupa lo que deja el marcador.
  equipoTocable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  equipoPresionado: { opacity: 0.6 },
  filaEquipoGrande: { minHeight: 52 },
  equipo: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  equipoGrande: { fontSize: 17 },
  carreras: {
    fontFamily: FONTS.display,
    fontSize: 30,
    lineHeight: 32,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  carrerasGrande: { fontSize: 48, lineHeight: 50 },
  apagado: { color: COLORS.textSecondary },
  marcaGanador: { width: 10, fontSize: 12, color: COLORS.textPrimary },
  hora: { fontFamily: FONTS.display, fontSize: 28, color: COLORS.textPrimary, marginTop: 4 },

  franjaWp: { paddingHorizontal: 12, paddingTop: 8 },
  titular: {
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    color: COLORS.textPrimary,
  },
  decisiones: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, paddingHorizontal: 12, paddingVertical: 10 },
  decision: { fontSize: 13, color: COLORS.textSupport },
  decisionSigla: { fontWeight: '700', color: COLORS.textPrimary },

  banda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    backgroundColor: COLORS.ink,
  },
  bandaEstadio: { flex: 1, color: COLORS.inkDim, fontSize: 10, letterSpacing: 0.8 },
  bandaAccion: { color: COLORS.inkFg, fontFamily: FONTS.display, fontSize: 16, letterSpacing: 0.6 },
  abrir: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    fontFamily: FONTS.display,
    fontSize: 15,
    letterSpacing: 0.5,
    color: COLORS.textPrimary,
  },

  carrusel: { paddingHorizontal: 16, gap: 8 },
  figura: {
    width: 180,
    padding: 12,
    gap: 4,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
  },
  figuraCabeza: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  figuraNombre: { fontSize: 15, fontWeight: '700', lineHeight: 19, color: COLORS.textPrimary },
  figuraLinea: { fontSize: 13, color: COLORS.textPrimary, fontVariant: ['tabular-nums'] },
  figuraRival: { fontSize: 11, color: COLORS.textSecondary },

  proxima: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  proximaEquipos: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  proximaEn: { fontSize: 12, color: COLORS.textSecondary },
  proximaDatos: { flex: 1, alignItems: 'flex-end' },
  proximaHora: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, fontVariant: ['tabular-nums'] },
  proximaEstadio: { fontSize: 11, color: COLORS.textSecondary },
});
