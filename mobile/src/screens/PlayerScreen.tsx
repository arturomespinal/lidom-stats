import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchPlayerProfile } from '../api';
import { COLORS, FONTS, TEAM_SHORT_NAMES, TEAM_STYLES } from '../constants';
import { entradas, fechaEs, num, pct3, rangoTemporadas } from '../formato';
import type { FichasParamList } from '../navigation';
import type {
  CareerBatting,
  CareerPitching,
  PlayerBattingSeason,
  PlayerPitchingSeason,
  PlayerProfile,
} from '../types';
import { EsqueletoFicha } from '../components/Esqueleto';
import Pestanas from '../components/Pestanas';
import Seccion from '../components/Seccion';
import TablaTemporadas, { Col } from '../components/TablaTemporadas';
import TeamBadge from '../components/TeamBadge';

type Props = NativeStackScreenProps<FichasParamList, 'Jugador'>;
type Rol = 'bateo' | 'pitcheo';

/* Las columnas son las de la web (SeasonTable.tsx), en el mismo orden: quien
   usa las dos plataformas encuentra cada número donde lo dejó. */
type FilaBateo = PlayerBattingSeason | CareerBatting;
type FilaPitcheo = PlayerPitchingSeason | CareerPitching;

const COLS_BATEO: Col<FilaBateo>[] = [
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

const COLS_PITCHEO: Col<FilaPitcheo>[] = [
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

/** Etiqueta chica arriba, valor abajo. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <Text style={styles.datoValor} numberOfLines={1}>
        {valor}
      </Text>
    </View>
  );
}

/** Una cifra de la franja navy de carrera. */
function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <View style={styles.cifra} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text style={styles.cifraValor} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
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
function FranjaCarrera({ rol, perfil }: { rol: Rol; perfil: PlayerProfile }) {
  if (rol === 'bateo' && perfil.career_batting) {
    const c = perfil.career_batting;
    return (
      <View style={styles.franja}>
        <Text style={styles.franjaTitulo}>Carrera en LIDOM · bateo</Text>
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
  if (rol === 'pitcheo' && perfil.career_pitching) {
    const c = perfil.career_pitching;
    return (
      <View style={styles.franja}>
        <Text style={styles.franjaTitulo}>Carrera en LIDOM · pitcheo</Text>
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

  const cargar = useCallback(async () => {
    setEstado('cargando');
    const p = await fetchPlayerProfile(playerId);
    if (!p) {
      setEstado('error');
      return;
    }
    setPerfil(p);
    setEstado('listo');
  }, [playerId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

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
  // El equipo de la temporada más reciente da el color. Las listas llegan de
  // la más nueva a la más vieja; un lanzador puro no tiene filas de bateo.
  const equipo = perfil.batting[0]?.team_code ?? perfil.pitching[0]?.team_code ?? null;
  const color = equipo ? TEAM_STYLES[equipo]?.primary : undefined;

  // Mismos umbrales que la web: un lanzador con tres turnos al bate no
  // necesita una tabla de bateo llena de ceros.
  const bateo = perfil.batting.length > 0 && (perfil.career_batting?.pa ?? 0) >= 10;
  const pitcheo = perfil.pitching.length > 0 && (perfil.career_pitching?.outs ?? 0) >= 9;
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

  return (
    <ScrollView style={styles.pagina} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* ── Quién es ── */}
      <View style={styles.cabecera}>
        {color && <View style={[styles.franjaClub, { backgroundColor: color }]} />}
        <View style={styles.identidad}>
          {equipo && <TeamBadge code={equipo} size={48} variant="solid" />}
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre} accessibilityRole="header" numberOfLines={2}>
              {bio.full_name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {[
                equipo ? TEAM_SHORT_NAMES[equipo] ?? equipo : 'Sin equipo registrado',
                bio.nationality,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        {/* Solo lo que existe: una fila de guiones no informa de nada. La
            lateralidad llega traducida (bats_label) — el cliente nunca
            traduce 'S', ver src/lateralidad.py. */}
        <View style={styles.datos}>
          {bio.age != null && <Dato etiqueta="Edad" valor={`${bio.age} años`} />}
          {bio.bats_label && <Dato etiqueta="Batea" valor={bio.bats_label} />}
          {bio.throws_label && <Dato etiqueta="Lanza" valor={bio.throws_label} />}
          {!!fisico && <Dato etiqueta="Físico" valor={fisico} />}
          {bio.birth_date && <Dato etiqueta="Nacimiento" valor={fechaEs(bio.birth_date)} />}
        </View>
      </View>

      {/* ── Qué tan bueno es ── */}
      {activo && <FranjaCarrera rol={activo} perfil={perfil} />}

      {/* ── Dónde jugó ── Carrusel: con cuatro o cinco equipos no cabe en una
          fila, y partirlo en dos renglones empuja la tabla hacia abajo. */}
      {perfil.teams.length > 0 && (
        <>
          <Seccion
            titulo="Trayectoria"
            nota={`${perfil.teams.length} ${perfil.teams.length === 1 ? 'equipo' : 'equipos'}`}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carrusel}
          >
            {perfil.teams.map(t => (
              <Pressable
                key={t.team_code}
                onPress={() => abrirEquipo(t.team_code)}
                style={({ pressed }) => [styles.chip, pressed && styles.presionado]}
                accessibilityRole="button"
                accessibilityLabel={`${t.team_code}, ${t.seasons} temporadas. Abrir equipo`}
              >
                <TeamBadge code={t.team_code} size={24} />
                <Text style={styles.chipTexto}>
                  {rangoTemporadas(t.first_season, t.last_season)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

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

      {activo === 'bateo' && (
        <TablaTemporadas<FilaBateo>
          temporadas={perfil.batting}
          carrera={perfil.career_batting}
          cols={COLS_BATEO}
          onEquipo={abrirEquipo}
        />
      )}
      {activo === 'pitcheo' && (
        <TablaTemporadas<FilaPitcheo>
          temporadas={perfil.pitching}
          carrera={perfil.career_pitching}
          cols={COLS_PITCHEO}
          onEquipo={abrirEquipo}
        />
      )}

      {!activo && (
        <Text style={styles.sinTabla}>
          Este jugador aparece en la base pero no acumula suficientes turnos ni
          entradas para una tabla.
        </Text>
      )}

      <Text style={styles.fuente}>
        Datos: MLB Stats API · {perfil.batting.length + perfil.pitching.length}{' '}
        temporadas-equipo registradas
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  // El color del club entra por el borde: identifica sin competir con el
  // texto, que es lo que pasaría si tiñera la tarjeta entera.
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
  datos: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 16 },
  dato: { width: '33.33%', paddingRight: 8 },
  etiqueta: {
    fontSize: 11,
    color: COLORS.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  datoValor: { fontSize: 14, color: COLORS.textPrimary, marginTop: 4 },

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
    fontFamily: FONTS.display,
    fontSize: 28,
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
