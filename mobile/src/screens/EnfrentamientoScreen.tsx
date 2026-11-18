import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { fetchEnfrentamiento } from '../api';
import { COLORS, FONTS, TEAM_SHORT_NAMES } from '../constants';
import { fechaEs, num, pct3 } from '../formato';
import type { FichasParamList } from '../navigation';
import type { DestacadoBateoH2H, DestacadoPitcheoH2H, Enfrentamiento } from '../types';
import EmptyState from '../components/EmptyState';
import Seccion from '../components/Seccion';
import TeamBadge from '../components/TeamBadge';
import { tematico } from '../tema';

type Props = NativeStackScreenProps<FichasParamList, 'Enfrentamiento'>;

/**
 * Un equipo contra otro en una temporada: la serie, de local y de visita, sus
 * juegos y quién brilló. Se abre desde "Contra cada rival" en la ficha del
 * equipo. Lo compone el servidor (GET /teams/{code}/h2h/{rival},
 * src/enfrentamiento.py). Misma pantalla que la web
 * (frontend/app/teams/[code]/vs/[rival]/page.tsx).
 */
export default function EnfrentamientoScreen({ route, navigation }: Props) {
  const { code, rival, season } = route.params;
  const [h2h, setH2h] = useState<Enfrentamiento | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'vacio'>('cargando');
  const corto = (c: string) => TEAM_SHORT_NAMES[c] ?? c;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `${TEAM_SHORT_NAMES[code] ?? code} vs ${TEAM_SHORT_NAMES[rival] ?? rival}`,
    });
  }, [navigation, code, rival]);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    const r = await fetchEnfrentamiento(code, rival, season);
    setH2h(r);
    setEstado(r ? 'listo' : 'vacio');
  }, [code, rival, season]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (estado === 'cargando') return <ActivityIndicator color={COLORS.textSecondary} style={{ marginTop: 40 }} />;
  if (!h2h) {
    return (
      <EmptyState message={`${corto(code)} y ${corto(rival)} no se han enfrentado en ${season}, o no hay conexión.`} />
    );
  }

  const split = (lado: 'home' | 'away') => {
    const s = h2h.split[lado];
    return s ? `${s.wins}-${s.games_played - s.wins}` : '0-0';
  };
  const abrirJugador = (playerId: string, nombre: string) => navigation.push('Jugador', { playerId, nombre });

  return (
    <ScrollView style={styles.pagina} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.tarjeta}>
        <View style={styles.cabecera}>
          <Pressable
            style={styles.equipo}
            onPress={() => navigation.push('Equipo', { code, season })}
            accessibilityRole="link"
            accessibilityLabel={`Abrir ${corto(code)}`}
          >
            <TeamBadge code={code} size={44} variant="solid" />
            <Text style={styles.nombreEquipo} numberOfLines={1}>{corto(code)}</Text>
          </Pressable>
          <View style={styles.centro}>
            <Text style={styles.serie} accessibilityLabel={`${h2h.summary.wins} ganados, ${h2h.summary.losses} perdidos`}>
              {h2h.summary.wins}-{h2h.summary.losses}
            </Text>
            <Text style={styles.micro}>SERIE {h2h.season_id ?? season}</Text>
          </View>
          <Pressable
            style={styles.equipo}
            onPress={() => navigation.push('Equipo', { code: rival, season })}
            accessibilityRole="link"
            accessibilityLabel={`Abrir ${corto(rival)}`}
          >
            <TeamBadge code={rival} size={44} variant="solid" />
            <Text style={styles.nombreEquipo} numberOfLines={1}>{corto(rival)}</Text>
          </Pressable>
        </View>
        <Text style={styles.titular}>{h2h.headline}</Text>
        <View style={styles.cifras}>
          {[
            ['De local', split('home')],
            ['De visita', split('away')],
            ['Carreras', `${h2h.summary.runs_for}-${h2h.summary.runs_against}`],
          ].map(([etiqueta, valor]) => (
            <View key={etiqueta} style={styles.cifra}>
              <Text style={styles.micro}>{etiqueta.toUpperCase()}</Text>
              <Text style={styles.valorCifra}>{valor}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.nota}>Del lado de {corto(code)}.</Text>
      </View>

      <Seccion titulo="Los juegos" nota={`${h2h.count}`} />
      <View style={styles.lista}>
        {h2h.games.map((g, i) => {
          const ganoVisita = g.away_score > g.home_score;
          return (
            <Pressable
              key={g.game_id}
              onPress={() =>
                navigation.push('Juego', { gameId: g.game_id, awayCode: g.away_team_code, homeCode: g.home_team_code })
              }
              style={({ pressed }) => [styles.juego, i > 0 && styles.borde, pressed && styles.presionada]}
              accessibilityRole="button"
              accessibilityLabel={`${fechaEs(g.game_date)}: ${corto(g.away_team_code)} ${g.away_score}, ${corto(g.home_team_code)} ${g.home_score}`}
            >
              <Text style={styles.fecha}>{fechaEs(g.game_date).replace(/ \d{4}$/, '')}</Text>
              <View style={styles.marcador}>
                <Text style={[styles.codigo, !ganoVisita && styles.atenuado]}>{g.away_team_code}</Text>
                <Text style={[styles.carreras, !ganoVisita && styles.atenuado]}>{g.away_score}</Text>
                <Text style={styles.atenuado}>–</Text>
                <Text style={[styles.carreras, ganoVisita && styles.atenuado]}>{g.home_score}</Text>
                <Text style={[styles.codigo, ganoVisita && styles.atenuado]}>{g.home_team_code}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
            </Pressable>
          );
        })}
      </View>

      <Seccion
        titulo="Los que brillaron"
        nota="En la serie"
        sub="Bateo por OPS (2 turnos por juego como mínimo) y pitcheo por efectividad (1 entrada por juego)."
      />
      {(['team', 'opponent'] as const).map(lado => {
        const c = lado === 'team' ? code : rival;
        const d = h2h.leaders[lado];
        return (
          <View key={lado} style={[styles.lista, { marginBottom: 12, paddingHorizontal: 14, paddingVertical: 8 }]}>
            <View style={styles.cabeceraDestacados}>
              <TeamBadge code={c} size={26} />
              <Text style={styles.nombreDestacados}>{corto(c)}</Text>
            </View>
            {d.batting.length === 0 && d.pitching.length === 0 && (
              <Text style={styles.nota}>Nadie con el volumen suficiente en la serie.</Text>
            )}
            {d.batting.map((b: DestacadoBateoH2H) => (
              <Destacado
                key={b.player_id}
                nombre={b.full_name}
                linea={[`${b.h}-${b.ab}`, b.hr ? `${b.hr} HR` : '', b.rbi ? `${b.rbi} CI` : ''].filter(Boolean).join(' · ')}
                valor={pct3(b.ops)}
                etiqueta="OPS"
                onPress={() => abrirJugador(b.player_id, b.full_name)}
              />
            ))}
            {d.pitching.map((p: DestacadoPitcheoH2H) => (
              <Destacado
                key={p.player_id}
                nombre={p.full_name}
                linea={`${p.ip} IP · ${p.er} CL · ${p.so} K`}
                valor={num(p.era, 2)}
                etiqueta="EFE"
                onPress={() => abrirJugador(p.player_id, p.full_name)}
              />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Destacado({
  nombre,
  linea,
  valor,
  etiqueta,
  onPress,
}: {
  nombre: string;
  linea: string;
  valor: string;
  etiqueta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.destacado, pressed && styles.presionada]}
      accessibilityRole="button"
      accessibilityLabel={`${nombre}, ${linea}, ${etiqueta} ${valor}. Abrir su ficha`}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.nombreJugador} numberOfLines={1}>{nombre}</Text>
        <Text style={styles.nota}>{linea}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.valorDestacado}>{valor}</Text>
        <Text style={styles.micro}>{etiqueta}</Text>
      </View>
    </Pressable>
  );
}

const styles = tematico(() => StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },
  tarjeta: {
    margin: 16,
    padding: 16,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center' },
  equipo: { flex: 1, alignItems: 'center', gap: 6, minHeight: 44 },
  nombreEquipo: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  centro: { alignItems: 'center', paddingHorizontal: 8 },
  serie: { color: COLORS.textPrimary, fontFamily: FONTS.display, fontSize: 60, lineHeight: 64, fontVariant: ['tabular-nums'] },
  micro: { color: COLORS.textSecondary, fontSize: 10, letterSpacing: 0.8 },
  titular: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 14 },
  cifras: { flexDirection: 'row', marginTop: 14 },
  cifra: { flex: 1, alignItems: 'center' },
  valorCifra: { color: COLORS.textPrimary, fontFamily: FONTS.display, fontSize: 24, fontVariant: ['tabular-nums'] },
  nota: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  lista: {
    marginHorizontal: 16,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    overflow: 'hidden',
  },
  juego: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14 },
  borde: { borderTopWidth: 1, borderTopColor: COLORS.border },
  presionada: { backgroundColor: COLORS.bgRaised },
  fecha: { width: 64, color: COLORS.textSecondary, fontSize: 12 },
  marcador: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  codigo: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  carreras: { color: COLORS.textPrimary, fontFamily: FONTS.display, fontSize: 20, fontVariant: ['tabular-nums'] },
  atenuado: { color: COLORS.textSecondary, fontWeight: '400' },
  cabeceraDestacados: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  nombreDestacados: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  destacado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  nombreJugador: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  valorDestacado: { color: COLORS.textPrimary, fontFamily: FONTS.display, fontSize: 20, fontVariant: ['tabular-nums'] },
}));
