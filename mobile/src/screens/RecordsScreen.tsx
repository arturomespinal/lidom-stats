import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchLideresHistoricos } from '../api';
import { COLORS, FONTS } from '../constants';
import { epocaHistorica, valorHistorico } from '../formato';
import type { FichasParamList } from '../navigation';
import type { GrupoHistorico, LiderHistorico, LideresHistoricos } from '../types';
import { Bloque } from '../components/Esqueleto';
import Pestanas from '../components/Pestanas';
import SelectorTemporada from '../components/SelectorTemporada';
import TeamBadge from '../components/TeamBadge';
import { Aparecer, Tocable } from '../components/Movimiento';

type Props = NativeStackScreenProps<FichasParamList, 'Records'>;

const POR_DEFECTO: Record<GrupoHistorico, string> = { bateo: 'h', pitcheo: 'wins' };

/**
 * Récords de todos los tiempos de una categoría: DIGIMETRICS antes de
 * 2012-13 y la MLB API desde entonces, sumados por jugador (src/historia.py).
 *
 * Arriba, Bateo | Pitcheo (dos opciones: pestañas) y la categoría (trece:
 * botón + hoja inferior, regla 7). El primero va en una tarjeta navy con la
 * cifra en Bebas; el resto, en filas de 56 pt que abren la ficha: la de la
 * MLB API si el jugador está enlazado, la histórica si no.
 *
 * Cambiar de categoría no vacía la lista: la anterior se queda atenuada hasta
 * que llega la nueva, como en Posiciones. Y solo la última respuesta escribe:
 * dos toques rápidos no dejan la lista de la primera categoría.
 */
export default function RecordsScreen({ route, navigation }: Props) {
  const [grupo, setGrupo] = useState<GrupoHistorico>(route.params.grupo);
  const [stat, setStat] = useState(route.params.stat);
  const [datos, setDatos] = useState<LideresHistoricos | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setEstado('cargando');
    const r = await fetchLideresHistoricos(grupo, stat);
    if (n !== pedido.current) return;
    if (!r) {
      setEstado('error');
      return;
    }
    setDatos(r);
    setEstado('listo');
  }, [grupo, stat]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: datos ? `Récords · ${datos.label}` : 'Récords' });
  }, [navigation, datos]);

  const abrir = (l: LiderHistorico) => {
    if (l.player_id) navigation.push('Jugador', { playerId: l.player_id, nombre: l.name });
    else if (l.id_miembro != null) navigation.push('Historico', { idMiembro: l.id_miembro, nombre: l.name });
  };

  const [primero, ...resto] = datos?.data ?? [];

  return (
    <View style={styles.pagina}>
      <Pestanas
        llenar
        tabs={[
          { key: 'bateo', label: 'Bateo' },
          { key: 'pitcheo', label: 'Pitcheo' },
        ]}
        active={grupo}
        onChange={g => {
          setGrupo(g);
          setStat(POR_DEFECTO[g]);
        }}
      />
      {datos && datos.group === grupo && (
        <SelectorTemporada
          titulo="Categoría"
          icono={null}
          marcarPrimera={false}
          subtitulo={`${datos.categories.length} categorías de ${grupo}`}
          opciones={datos.categories.map(c => ({
            key: c.stat,
            label: c.label,
            nota: c.is_rate ? 'Con mínimo de carrera' : undefined,
          }))}
          activa={stat}
          onChange={setStat}
        />
      )}

      {estado === 'error' && !datos ? (
        <View style={styles.vacio}>
          <Text style={styles.vacioTexto}>No se pudieron cargar los récords.</Text>
          <Pressable onPress={cargar} style={styles.boton} accessibilityRole="button">
            <Text style={styles.botonTexto}>Reintentar</Text>
          </Pressable>
        </View>
      ) : !datos ? (
        <Esqueleto />
      ) : (
        <FlatList
          style={estado === 'cargando' && styles.atenuada}
          data={resto}
          keyExtractor={l => `${l.player_id ?? l.id_miembro}`}
          contentContainerStyle={{ paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={
            <Aparecer key={`${datos.group}-${datos.stat}`} style={{ padding: 16, paddingBottom: 8 }}>
              {primero ? (
                <Tocable
                  onPress={() => abrir(primero)}
                  style={styles.record}
                  accessibilityRole="button"
                  accessibilityLabel={`Récord de todos los tiempos en ${datos.label}: ${primero.name}, ${valorHistorico(datos.stat, primero.value)}`}
                >
                  <Text style={styles.recordTitulo}>Récord de todos los tiempos · {datos.label}</Text>
                  <View style={styles.recordFila}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.recordNombre} numberOfLines={2}>
                        {primero.name}
                      </Text>
                      <Text style={styles.recordEpoca}>
                        {epocaHistorica(primero.first_season, primero.last_season)} · {primero.seasons}{' '}
                        {primero.seasons === 1 ? 'temporada' : 'temporadas'}
                      </Text>
                    </View>
                    <Text style={styles.recordValor}>{valorHistorico(datos.stat, primero.value)}</Text>
                  </View>
                  <View style={styles.recordEquipos}>
                    {primero.teams.slice(0, 4).map(c => (
                      <TeamBadge key={c} code={c} size={28} variant="solid" />
                    ))}
                  </View>
                </Tocable>
              ) : (
                <Text style={styles.vacioTexto}>Nadie alcanza el mínimo en esta categoría.</Text>
              )}
              {!!datos.minimum && <Text style={styles.minimo}>Mínimo: {datos.minimum}</Text>}
            </Aparecer>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => abrir(item)}
              style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
              accessibilityRole="button"
              accessibilityLabel={`${item.rank}. ${item.name}, ${valorHistorico(datos.stat, item.value)}`}
            >
              <Text style={styles.puesto}>{item.rank}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.nombre} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.epoca} numberOfLines={1}>
                  {epocaHistorica(item.first_season, item.last_season)} · {item.teams.join(' · ')}
                </Text>
              </View>
              <Text style={styles.valor}>{valorHistorico(datos.stat, item.value)}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
          ListFooterComponent={
            <Text style={styles.fuente}>
              Antes de 2012-13: DIGIMETRICS (estadisticas.lidom.com). Desde 2012-13: MLB Stats API. Solo serie
              regular; cada temporada cuenta una sola vez.
            </Text>
          }
        />
      )}
    </View>
  );
}

function Esqueleto() {
  return (
    <View style={{ padding: 16, gap: 12 }} accessibilityLabel="Cargando">
      <Bloque w="100%" h={148} r={12} />
      {Array.from({ length: 6 }, (_, i) => (
        <Bloque key={i} w="100%" h={44} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },
  atenuada: { opacity: 0.5 },
  // La tarjeta del récord: navy, sin color de club (el récord es de la
  // liga). Esquinas parejas: la cortada es de tejas y estados.
  record: { backgroundColor: COLORS.ink, borderRadius: 12, padding: 16 },
  recordTitulo: { fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.inkDim },
  recordFila: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginTop: 8 },
  // Bebas sin fontWeight (ver FONTS).
  recordNombre: { fontFamily: FONTS.display, fontSize: 32, lineHeight: 32, paddingTop: 4, color: COLORS.inkFg },
  recordEpoca: { fontSize: 13, color: COLORS.inkDim, marginTop: 4, fontVariant: ['tabular-nums'] },
  recordValor: { fontFamily: FONTS.display, fontSize: 56, lineHeight: 56, paddingTop: 6, color: COLORS.inkFg },
  recordEquipos: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  minimo: { fontSize: 11, color: COLORS.textSecondary, marginTop: 8, textAlign: 'right' },
  fila: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 8,
    backgroundColor: COLORS.bgCard,
  },
  presionada: { backgroundColor: COLORS.bgRaised },
  puesto: { width: 24, textAlign: 'right', fontSize: 14, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  nombre: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  epoca: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, fontVariant: ['tabular-nums'] },
  valor: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, fontVariant: ['tabular-nums'] },
  chevron: { fontSize: 22, color: COLORS.textFaint, width: 16, textAlign: 'center' },
  sep: { height: 1, backgroundColor: COLORS.borderSoft },
  fuente: { fontSize: 11, lineHeight: 16, color: COLORS.textFaint, padding: 16 },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  vacioTexto: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  boton: { minHeight: 44, paddingHorizontal: 24, justifyContent: 'center', borderRadius: 8, backgroundColor: COLORS.ink },
  botonTexto: { color: COLORS.inkFg, fontSize: 14, fontWeight: '600' },
});
