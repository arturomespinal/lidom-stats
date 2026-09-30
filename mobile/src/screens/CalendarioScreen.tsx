import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Tocable } from '../components/Movimiento';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchCalendar } from '../api';
import { COLORS, FONTS } from '../constants';
import type { LiveStackParamList } from '../navigation';
import type { Calendario, DiaCalendario } from '../types';
import Pestanas from '../components/Pestanas';
import Seccion from '../components/Seccion';
import EmptyState from '../components/EmptyState';
import { Bloque } from '../components/Esqueleto';

type Props = NativeStackScreenProps<LiveStackParamList, 'Calendario'>;

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/**
 * Las jornadas de una temporada, para saltar a cualquier fecha desde la
 * portada. Antes solo se llegaba caminando la franja de siete días: el juego
 * inaugural estaba a ~70 toques de la última jornada.
 *
 * Los meses llegan del servidor con las semanas ya armadas (GET /calendar);
 * aquí no se calcula en qué columna cae el día 1. Un día sin juegos se pinta
 * atenuado y no se puede tocar. Elegir un día vuelve a la portada con esa
 * fecha (`popTo`), sin apilar otra portada encima.
 */
export default function CalendarioScreen({ route, navigation }: Props) {
  const activa = route.params?.activa;
  const [season, setSeason] = useState<string | undefined>(route.params?.season);
  const [cal, setCal] = useState<Calendario | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setEstado('cargando');
    const c = await fetchCalendar(season);
    if (n !== pedido.current) return;
    if (!c) {
      setEstado('error');
      return;
    }
    setCal(c);
    setEstado('listo');
  }, [season]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const elegir = (d: DiaCalendario) => navigation.popTo('Portada', { fecha: d.date });

  if (!cal) {
    if (estado === 'error') return <EmptyState sinConexion onReintentar={cargar} />;
    return (
      <View style={[styles.pagina, { padding: 16, gap: 12 }]} accessibilityLabel="Cargando el calendario">
        <Bloque w="100%" h={44} />
        <Bloque w="60%" h={20} />
        <Bloque w="100%" h={300} r={12} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.pagina} contentContainerStyle={{ paddingBottom: 32 }} stickyHeaderIndices={[0]}>
      <Pestanas
        tabs={cal.seasons.map(s => ({ key: s, label: s }))}
        active={cal.season_id}
        onChange={setSeason}
      />

      <View style={estado === 'cargando' && styles.atenuado}>
        <View style={styles.resumen}>
          <Text style={styles.resumenTexto}>
            {cal.game_days} jornadas · {cal.games} juegos
          </Text>
          {/* El atajo que motivó esta pantalla: el día inaugural. */}
          {!!cal.first_date && (
            <Pressable
              onPress={() => navigation.popTo('Portada', { fecha: cal.first_date! })}
              style={({ pressed }) => [styles.atajo, pressed && styles.presionado]}
              accessibilityRole="button"
            >
              <Text style={styles.atajoTexto}>Ir al inaugural ›</Text>
            </Pressable>
          )}
        </View>

        {cal.months.map(m => (
          <View key={m.key}>
            <Seccion titulo={m.label} nota={`${m.games} juegos`} />
            <View style={styles.mes}>
              <View style={styles.semana}>
                {DIAS.map((d, i) => (
                  <Text key={i} style={styles.cabeza}>
                    {d}
                  </Text>
                ))}
              </View>
              {m.weeks.map((w, i) => (
                <View key={i} style={styles.semana}>
                  {w.map((c, j) => {
                    if (!c) return <View key={j} style={styles.celda} />;
                    const hay = c.games > 0;
                    const es = c.date === activa;
                    return (
                      <Tocable
                        key={j}
                        contenedor={styles.caja}
                        disabled={!hay}
                        onPress={() => elegir(c)}
                        style={({ pressed }) => [
                          styles.celda,
                          styles.dia,
                          es && styles.diaActivo,
                          c.is_today && !es && styles.diaHoy,
                          pressed && styles.presionado,
                        ]}
                        accessibilityRole={hay ? 'button' : undefined}
                        accessibilityState={{ selected: es, disabled: !hay }}
                        accessibilityLabel={`${c.day} de ${m.label}, ${
                          hay ? `${c.games} ${c.games === 1 ? 'juego' : 'juegos'}` : 'sin juegos'
                        }`}
                      >
                        <Text style={[styles.numero, !hay && styles.vacio, es && styles.textoActivo]}>{c.day}</Text>
                        {hay && <Text style={[styles.juegos, es && styles.subActivo]}>{c.games}</Text>}
                      </Tocable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },
  atenuado: { opacity: 0.5 },
  resumen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  resumenTexto: { fontSize: 13, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  atajo: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  atajoTexto: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  mes: {
    marginHorizontal: 16,
    padding: 8,
    gap: 4,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
  semana: { flexDirection: 'row', gap: 4 },
  cabeza: { flex: 1, textAlign: 'center', fontSize: 11, color: COLORS.textSecondary, paddingVertical: 4 },
  // 44 pt de alto: cada día es un blanco de toque.
  celda: { flex: 1, minHeight: 44 },
  caja: { flex: 1 },
  dia: { alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  diaActivo: { backgroundColor: COLORS.ink },
  diaHoy: { borderWidth: 1.5, borderColor: COLORS.ink },
  presionado: { backgroundColor: COLORS.bgRaised },
  // Bebas sin fontWeight (ver FONTS).
  numero: { fontFamily: FONTS.display, fontSize: 20, lineHeight: 22, color: COLORS.textPrimary },
  vacio: { color: COLORS.textSecondary, opacity: 0.45 },
  juegos: { fontSize: 10, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  textoActivo: { color: COLORS.inkFg },
  subActivo: { color: COLORS.inkDim },
});
