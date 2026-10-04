import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';

import { fetchMiembroHistorico } from '../api';
import { COLORS, FONTS, TEAM_STYLES } from '../constants';
import { entradas, epocaHistorica, num, pct3 } from '../formato';
import type { FichasParamList } from '../navigation';
import type { MiembroHistorico } from '../types';
import { EsqueletoFicha } from '../components/Esqueleto';
import Pestanas from '../components/Pestanas';
import { Aparecer } from '../components/Movimiento';
import Seccion from '../components/Seccion';
import TablaTemporadas from '../components/TablaTemporadas';
import Heroe, { CifraHeroe, FilaCifras } from '../components/Heroe';
import { tamanoNombre } from '../components/Ajuste';
import Monograma from '../components/Monograma';
import Trayectoria from '../components/Trayectoria';
import { COLS_BATEO, COLS_PITCHEO, FilaBateo, FilaPitcheo, FranjaCarrera } from './PlayerScreen';

type Props = NativeStackScreenProps<FichasParamList, 'Historico'>;
type Rol = 'bateo' | 'pitcheo';

/**
 * La ficha de un jugador que solo existe en DIGIMETRICS (antes de 2012-13):
 * Marichal, los Alou, Tony Peña. Misma forma que la ficha de la MLB API
 * (PlayerScreen) —cabecera, trayectoria, franja de carrera, año a año— sin lo
 * que esos años no tienen: contra la liga, juego a juego, biografía.
 *
 * Si resulta estar enlazado a la MLB API (un enlace viejo, una ficha abierta
 * antes de enlazar), se reemplaza por su ficha completa, que ya trae estos
 * años.
 *
 * La tabla trae también la postemporada (RR y Final marcadas), con su total
 * aparte; la franja y la fila de carrera son solo la serie regular.
 */
export default function HistoricoScreen({ route, navigation }: Props) {
  const { idMiembro, nombre } = route.params;
  const [m, setM] = useState<MiembroHistorico | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [rol, setRol] = useState<Rol | null>(null);
  const { width: anchoPantalla } = useWindowDimensions();

  const cargar = useCallback(async () => {
    setEstado('cargando');
    const r = await fetchMiembroHistorico(idMiembro);
    if (!r) {
      setEstado('error');
      return;
    }
    if (r.player.player_id) {
      navigation.replace('Jugador', { playerId: r.player.player_id, nombre: r.player.name });
      return;
    }
    setM(r);
    setEstado('listo');
  }, [idMiembro, navigation]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Cabecera navy: barra de estado clara mientras tiene el foco.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: m?.player.name ?? nombre ?? 'Jugador histórico' });
  }, [navigation, m, nombre]);

  if (estado === 'cargando' && !m) return <EsqueletoFicha />;

  if (estado === 'error' || !m) {
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

  const cb = m.career_batting;
  const cp = m.career_pitching;
  const bateo = (cb?.pa ?? 0) >= 10;
  const pitcheo = (cp?.outs ?? 0) >= 9;
  const principal: Rol | null = m.is_pitcher
    ? pitcheo ? 'pitcheo' : bateo ? 'bateo' : null
    : bateo ? 'bateo' : pitcheo ? 'pitcheo' : null;
  const activo = rol ?? principal;

  // El equipo con más temporadas da el color: es por el que se le recuerda.
  const principalEquipo = [...m.teams].sort((a, b) => b.seasons - a.seasons)[0]?.team_code ?? null;
  const color = (principalEquipo && TEAM_STYLES[principalEquipo]?.primary) || COLORS.textSecondary;
  const primera = m.teams.reduce((x, t) => (t.first_season < x ? t.first_season : x), '9999');
  const ultima = m.teams.reduce((x, t) => (t.last_season > x ? t.last_season : x), '0000');
  const temporadas = (cb?.seasons ?? 0) || (cp?.seasons ?? 0);
  const tamNombre = tamanoNombre(m.player.name, (anchoPantalla - 32) * 0.52, 52);

  return (
    <ScrollView style={styles.pagina} contentContainerStyle={{ paddingBottom: 32 }}>
      <Heroe color={color}>
        <View style={styles.identidad}>
          <View style={styles.nombreCaja}>
            <Text style={styles.micro} numberOfLines={1}>
              Historia{m.teams.length ? ` · ${epocaHistorica(primera, ultima)}` : ''}
            </Text>
            <Text
              style={[styles.nombre, { fontSize: tamNombre, lineHeight: Math.round(tamNombre * 0.92) }]}
              accessibilityRole="header"
              numberOfLines={3}
            >
              {m.player.name}
            </Text>
            <Text style={styles.meta}>
              {temporadas} {temporadas === 1 ? 'temporada' : 'temporadas'} en LIDOM
            </Text>
          </View>
          <Monograma nombre={m.player.name} />
        </View>
        {(cp || cb) && (
          <FilaCifras titulo="Carrera · serie regular">
            {m.is_pitcher && cp ? (
              <>
                <CifraHeroe valor={num(cp.era, 2)} etiqueta="EFE" />
                <CifraHeroe valor={`${cp.wins}-${cp.losses}`} etiqueta="G-P" />
                <CifraHeroe valor={num(cp.so)} etiqueta="K" />
                <CifraHeroe valor={entradas(cp.innings_pitched)} etiqueta="IP" />
              </>
            ) : cb ? (
              <>
                <CifraHeroe valor={pct3(cb.avg)} etiqueta="AVG" />
                <CifraHeroe valor={num(cb.h)} etiqueta="H" />
                <CifraHeroe valor={num(cb.hr)} etiqueta="HR" />
                <CifraHeroe valor={num(cb.rbi)} etiqueta="CI" />
              </>
            ) : null}
          </FilaCifras>
        )}
      </Heroe>

      {m.teams.length > 0 && (
        <>
          <Seccion titulo="Trayectoria" nota={`${m.teams.length} ${m.teams.length === 1 ? 'equipo' : 'equipos'}`} />
          {/* El tramo abre el equipo de hoy: de esos años no hay ficha de
              equipo, pero el club sigue siendo el mismo. */}
          <Trayectoria equipos={m.teams} onEquipo={code => navigation.push('Equipo', { code })} />
        </>
      )}

      {activo && <FranjaCarrera rol={activo} bateo={cb} pitcheo={cp} titulo="Carrera en LIDOM" />}

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
        <Seccion titulo={activo === 'bateo' ? 'Bateo' : 'Pitcheo'} nota="Temporada por temporada" />
      ) : null}

      <Aparecer key={activo ?? 'ninguno'}>
        {activo === 'bateo' && (
          <TablaTemporadas<FilaBateo>
            temporadas={[]}
            historicas={m.batting}
            separador={null}
            carrera={cb}
            postemporada={m.postseason_batting}
            cols={COLS_BATEO}
            onEquipo={() => {}}
          />
        )}
        {activo === 'pitcheo' && (
          <TablaTemporadas<FilaPitcheo>
            temporadas={[]}
            historicas={m.pitching}
            separador={null}
            carrera={cp}
            postemporada={m.postseason_pitching}
            cols={COLS_PITCHEO}
            onEquipo={() => {}}
          />
        )}
      </Aparecer>

      <Text style={styles.fuente}>
        Fuente: LIDOM. La carrera es la serie regular.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },
  identidad: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  // Columna del 52 %: el resto es del plano del club (ver Heroe.tsx).
  nombreCaja: { width: '52%', gap: 6 },
  micro: { fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.inkDim },
  nombre: { fontFamily: FONTS.display, paddingTop: 4, color: COLORS.inkFg },
  meta: { fontSize: 13, lineHeight: 18, color: COLORS.inkDim },
  fuente: { fontSize: 11, lineHeight: 16, color: COLORS.textFaint, paddingHorizontal: 16, marginTop: 16 },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, backgroundColor: COLORS.bgPage },
  vacioTexto: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  boton: {
    minHeight: 44,
    paddingHorizontal: 24,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.ink,
  },
  presionado: { opacity: 0.8 },
  botonTexto: { color: COLORS.inkFg, fontSize: 14, fontWeight: '600' },
});
