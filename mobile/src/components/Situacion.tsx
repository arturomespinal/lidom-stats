import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS } from '../constants';
import { useFichas } from '../navigation';
import { AtBat, LiveGameDetail, LiveSituation, PlayLine } from '../types';
import BaseDiamond, { posicionesDiamante } from './BaseDiamond';
import { useReducirMovimiento } from './Movimiento';
import ZonaStrike from './ZonaStrike';

/**
 * Lo que está pasando ahora mismo, en la pantalla de un juego: el diamante
 * con los corredores, los outs, la cuenta, quién batea y quién lanza, y la
 * zona de strike del turno. La misma tarjeta que la web
 * (`frontend/components/game/Situacion.tsx`).
 *
 * ── La jugada que se mueve ──────────────────────────────────────────────────
 * Cuando la última jugada completa es sencillo, doble, triple, jonrón o
 * ponche, entra una franja navy con corte en diagonal con la jugada en Bebas,
 * el bateador, las carreras y el batazo, y se va sola a los ~3,6 s. En los
 * batazos un corredor recorre el diamante hasta su base (el jonrón da la
 * vuelta) y la base se enciende cuando llega.
 *
 * La franja lleva `key` = el índice de la jugada: se monta otra vez solo con
 * una jugada nueva y su animación corre al montarse. Todo con
 * `useNativeDriver` (opacidad y desplazamiento), así no compite con el
 * sondeo ni con el scroll. Con "reducir movimiento" el corredor no corre y la
 * franja aparece y se va sin deslizarse.
 */

const DIAMANTE = 92;
const RADIO_CORREDOR = 5;
const DURACION_FRANJA = 3600;

/** Las jugadas que se celebran, y hasta qué base llega el bateador. */
const JUGADAS: Record<string, { titulo: string; bases: number }> = {
  Single: { titulo: 'Sencillo', bases: 1 },
  Double: { titulo: 'Doble', bases: 2 },
  Triple: { titulo: 'Triple', bases: 3 },
  'Home Run': { titulo: 'Jonrón', bases: 4 },
  Strikeout: { titulo: 'Ponche', bases: 0 },
  'Strikeout Double Play': { titulo: 'Ponche', bases: 0 },
};

export function jugadaDestacada(plays: PlayLine[]): PlayLine | null {
  // El relato viene del más reciente al más viejo, y el primero puede ser el
  // turno en curso, todavía sin resultado.
  const ultima = plays.find(p => p.is_complete);
  return ultima && ultima.event && JUGADAS[ultima.event] ? ultima : null;
}

/** Cuánto corre el corredor: 450 ms por base, más la entrada y la salida. */
const duracionCarrera = (bases: number) => (bases > 0 ? 450 * Math.min(bases, 4) + 500 : 0);

export default function Situacion({
  situacion,
  jugada,
  turno,
  duelo,
}: {
  situacion: LiveSituation;
  jugada: PlayLine | null;
  /** El turno que se dibuja en la zona de strike. */
  turno?: AtBat | null;
  /** El duelo de ahora, con sus números. */
  duelo?: LiveGameDetail['matchup'];
}) {
  const reducir = useReducirMovimiento();
  const info = jugada?.event ? JUGADAS[jugada.event] : null;
  const bases = info?.bases ?? 0;
  const duracion = duracionCarrera(bases);
  // La base se enciende cuando llega el corredor, y no antes. Sin corredor
  // (reducir movimiento), en el acto.
  const llegada = reducir ? 0 : Math.round(duracion * 0.9);

  const outs = situacion.outs;
  // Entre medias entradas la cuenta es del turno que ya terminó y el bateador
  // es el que abre la otra mitad: se dice, en vez de mezclarlas.
  const fin = situacion.half_over_label;
  // Los números del duelo, solo si son de quien está en el plato ahora.
  const bateador = duelo && duelo.batter.name === situacion.batter ? duelo.batter : null;
  const lanzador = duelo && duelo.pitcher.name === situacion.pitcher ? duelo.pitcher : null;

  const lineaBateador = bateador
    ? [
        bateador.today ? `Hoy ${bateador.today}` : null,
        bateador.avg ? `${bateador.avg} AVG` : null,
        bateador.ops ? `${bateador.ops} OPS` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const lineaLanzador = lanzador
    ? [
        lanzador.pitches > 0 ? `${lanzador.pitches} lanzamientos` : null,
        lanzador.today,
        lanzador.era ? `EFE ${lanzador.era}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <View style={styles.tarjeta} accessibilityLabel="Situación del juego">
      {/* La franja de la jugada cubre esta parte y no la zona de strike: el
          lanzamiento que acaba de pasar se sigue viendo. */}
      <View style={styles.arriba}>
        <View style={styles.filaDiamante}>
          <View style={{ width: DIAMANTE, height: DIAMANTE }}>
            <BaseDiamond runners={situacion.runners} size={DIAMANTE} retrasoLlenado={llegada} />
            {jugada && bases > 0 && !reducir && (
              <Corredor key={jugada.index} bases={bases} duracion={duracion} />
            )}
          </View>

          <View style={styles.contadores}>
            <View style={styles.contador} accessible accessibilityLabel={`${outs} ${outs === 1 ? 'out' : 'outs'}`}>
              <Text style={styles.etiqueta}>OUTS</Text>
              {[0, 1, 2].map(i => (
                <View key={i} style={[styles.out, i < outs && styles.outOn]} />
              ))}
            </View>
            {fin ? (
              <Text style={styles.fin}>{fin}</Text>
            ) : (
              <View
                style={styles.contador}
                accessible
                accessibilityLabel={`Cuenta: ${situacion.balls} bolas, ${situacion.strikes} strikes`}
              >
                <Text style={styles.etiqueta}>CUENTA</Text>
                <Text style={styles.cuenta}>
                  {situacion.balls}-{situacion.strikes}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Los nombres en su propia fila: al lado del diamante quedaban
            cortados. */}
        <View style={styles.nombres}>
          {!!situacion.batter && (
            <Persona
              rotulo={fin ? 'Abre' : 'Al bate'}
              nombre={situacion.batter}
              profileId={bateador?.profile_id ?? null}
              linea={lineaBateador}
            />
          )}
          {!!situacion.pitcher && (
            <Persona
              rotulo="Lanza"
              nombre={situacion.pitcher}
              profileId={lanzador?.profile_id ?? null}
              linea={lineaLanzador}
            />
          )}
          {!!situacion.on_deck && (
            <Text style={styles.espera} numberOfLines={1}>
              <Text style={styles.rotulo}>En espera </Text>
              {situacion.on_deck}
            </Text>
          )}
        </View>

        {jugada && info && <Franja key={jugada.index} jugada={jugada} titulo={info.titulo} reducir={reducir} />}
      </View>

      {turno && (
        <View style={styles.zona}>
          <ZonaStrike turno={turno} />
        </View>
      )}
    </View>
  );
}

/** Un nombre de la situación; con ficha, se toca y la abre. */
function Persona({
  rotulo,
  nombre,
  profileId,
  linea,
}: {
  rotulo: string;
  nombre: string;
  profileId: string | null;
  linea: string;
}) {
  const nav = useFichas();
  return (
    <Pressable
      disabled={!profileId}
      onPress={() => profileId && nav.push('Jugador', { playerId: profileId, nombre })}
      style={({ pressed }) => [styles.persona, pressed && { opacity: 0.6 }]}
      accessibilityRole={profileId ? 'link' : undefined}
      accessibilityHint={profileId ? 'Abre su ficha' : undefined}
    >
      <Text style={styles.personaNombre} numberOfLines={1}>
        <Text style={styles.rotulo}>{rotulo} </Text>
        {nombre}
      </Text>
      {!!linea && (
        <Text style={styles.personaLinea} numberOfLines={2}>
          {linea}
        </Text>
      )}
    </Pressable>
  );
}

/** El corredor de la jugada: del home a su base, o la vuelta completa. */
function Corredor({ bases, duracion }: { bases: number; duracion: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: duracion,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [t, duracion]);

  const p = posicionesDiamante(DIAMANTE);
  const ruta = [p.home, p.first, p.second, p.third, p.home].slice(0, bases + 1);
  const n = ruta.length - 1;
  // Mismo ritmo que la web: aparece en el home, corre base por base y se
  // desvanece al llegar.
  const pasos = [0, 0.06, ...ruta.slice(1).map((_, i) => 0.06 + (0.84 * (i + 1)) / n), 1];
  const xs = [ruta[0].x, ruta[0].x, ...ruta.slice(1).map(q => q.x), ruta[n].x].map(v => v - RADIO_CORREDOR);
  const ys = [ruta[0].y, ruta[0].y, ...ruta.slice(1).map(q => q.y), ruta[n].y].map(v => v - RADIO_CORREDOR);
  const opacidades = pasos.map((_, i) => (i === 0 || i === pasos.length - 1 ? 0 : 1));

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.corredor,
        {
          opacity: t.interpolate({ inputRange: pasos, outputRange: opacidades }),
          transform: [
            { translateX: t.interpolate({ inputRange: pasos, outputRange: xs }) },
            { translateY: t.interpolate({ inputRange: pasos, outputRange: ys }) },
          ],
        },
      ]}
    />
  );
}

/** La franja navy con la jugada. Entra, se queda y se va sola. */
function Franja({ jugada, titulo, reducir }: { jugada: PlayLine; titulo: string; reducir: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const entra = 260;
    const sale = 300;
    const anim = Animated.sequence([
      Animated.timing(v, {
        toValue: 1,
        duration: entra,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(DURACION_FRANJA - entra - sale),
      Animated.timing(v, { toValue: 2, duration: sale, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [v]);

  const hit = jugada.hit;
  const batazo = hit
    ? [
        hit.speed_mph != null ? `${Math.round(hit.speed_mph)} mph` : null,
        hit.distance_ft ? `${hit.distance_ft} pies` : null,
        hit.angle != null ? `${Math.round(hit.angle)}°` : null,
      ].filter(Boolean)
    : [];
  const carreras = jugada.rbi > 0 ? (jugada.rbi === 1 ? '1 carrera' : `${jugada.rbi} carreras`) : null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={[titulo, jugada.batter, carreras, ...batazo].filter(Boolean).join(', ')}
      style={[
        styles.franja,
        {
          opacity: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
          transform: [
            {
              translateX: reducir
                ? 0
                : v.interpolate({ inputRange: [0, 1, 2], outputRange: [48, 0, 24] }),
            },
          ],
        },
      ]}
    >
      {/* El corte en diagonal: un plano navy inclinado. React Native no
          tiene clip-path; lo que sobra a la derecha lo recorta la tarjeta. */}
      <View style={styles.franjaFondo} />
      <View style={styles.franjaTexto}>
        <Text style={styles.franjaTitulo}>{titulo}</Text>
        {!!jugada.batter && (
          <Text style={styles.franjaBateador} numberOfLines={1}>
            {jugada.batter}
          </Text>
        )}
        {(!!carreras || batazo.length > 0) && (
          // Dos renglones: "2 carreras · 98 mph · 341 pies · 25°" no cabe en
          // uno en un teléfono angosto.
          <Text style={styles.franjaDatos} numberOfLines={2}>
            {!!carreras && (
              <Text style={styles.franjaCarreras}>
                {carreras}
                {batazo.length > 0 ? ' · ' : ''}
              </Text>
            )}
            {batazo.join(' · ')}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    marginHorizontal: 16,
    // La cabecera navy termina a ras: el aire lo pone la tarjeta.
    marginTop: 16,
    marginBottom: 16,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  arriba: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 10 },
  filaDiamante: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  contadores: { gap: 10 },
  contador: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  etiqueta: { width: 54, color: COLORS.textFaint, fontSize: 10, letterSpacing: 0.6 },
  out: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.border },
  outOn: { backgroundColor: COLORS.warning },
  // Bebas, sin fontWeight (ver FONTS).
  cuenta: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.display,
    fontSize: 28,
    lineHeight: 28,
    paddingTop: 4,
    marginTop: -4,
    fontVariant: ['tabular-nums'],
  },
  fin: { color: COLORS.textSupport, fontSize: 12, fontWeight: '600', maxWidth: 150 },

  nombres: { gap: 6 },
  persona: { minHeight: 36, justifyContent: 'center' },
  personaNombre: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  rotulo: { color: COLORS.textSecondary, fontWeight: '400' },
  personaLinea: { color: COLORS.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 1 },
  espera: { color: COLORS.textSupport, fontSize: 12 },

  corredor: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: RADIO_CORREDOR * 2,
    height: RADIO_CORREDOR * 2,
    borderRadius: RADIO_CORREDOR,
    backgroundColor: COLORS.ink,
    borderWidth: 2,
    borderColor: COLORS.bgCard,
  },

  franja: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '64%',
    justifyContent: 'center',
  },
  franjaFondo: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 18,
    right: -40,
    backgroundColor: COLORS.ink,
    transform: [{ skewX: '-12deg' }],
  },
  franjaTexto: { paddingLeft: 40, paddingRight: 16 },
  // Bebas, sin fontWeight. Aire arriba para que iOS no recorte el remate.
  franjaTitulo: {
    color: COLORS.inkFg,
    fontFamily: FONTS.display,
    fontSize: 38,
    lineHeight: 38,
    paddingTop: 6,
    marginTop: -6,
    letterSpacing: 0.5,
  },
  franjaBateador: { color: COLORS.inkDim, fontSize: 13, marginTop: 2 },
  franjaDatos: { color: COLORS.inkDim, fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 1 },
  franjaCarreras: { color: COLORS.inkFg, fontWeight: '600' },

  zona: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
});
