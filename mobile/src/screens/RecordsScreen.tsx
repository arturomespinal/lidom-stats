import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchLideresHistoricos, fetchMejoresTemporadas } from '../api';
import { COLORS, FONTS } from '../constants';
import { epocaHistorica, valorHistorico } from '../formato';
import type { FichasParamList } from '../navigation';
import type {
  GrupoHistorico,
  LiderHistorico,
  LideresHistoricos,
  MejoresTemporadas,
  TemporadaHistorica,
} from '../types';
import { Bloque } from '../components/Esqueleto';
import Pestanas from '../components/Pestanas';
import SelectorTemporada from '../components/SelectorTemporada';
import TeamBadge from '../components/TeamBadge';
import { Aparecer, Tocable } from '../components/Movimiento';

type Props = NativeStackScreenProps<FichasParamList, 'Records'>;

const POR_DEFECTO: Record<GrupoHistorico, string> = { bateo: 'h', pitcheo: 'wins' };

type Vista = 'carrera' | 'temporada';

/** Una fila de la lista: un líder de carrera o una de las mejores temporadas. */
type Fila = { tipo: 'carrera'; l: LiderHistorico } | { tipo: 'temporada'; t: TemporadaHistorica };

/**
 * Récords de todos los tiempos de una categoría: DIGIMETRICS antes de
 * 2012-13 y la MLB API desde entonces, sumados por jugador (src/historia.py).
 *
 * Arriba, Bateo | Pitcheo (dos opciones: pestañas) y la categoría (trece:
 * botón + hoja inferior, regla 7). El primero va en una tarjeta navy con la
 * cifra en Bebas; el resto, en filas de 56 pt que abren la ficha: la de la
 * MLB API si el jugador está enlazado, la histórica si no.
 *
 * ── Carrera | Una temporada ────────────────────────────────────────────────
 * La misma categoría tiene dos récords: el de la carrera y el de una sola
 * campaña (GET /historia/temporadas, de la capa analítica). En la web van uno
 * debajo del otro; aquí, 25 filas de carrera empujarían las temporadas fuera
 * de la vista, así que un control de dos opciones cambia la lista. Las dos se
 * piden juntas: cambiar de vista no espera a la red. Si las temporadas no
 * están publicadas, el control no sale y la pantalla es la de siempre.
 *
 * Cambiar de categoría no vacía la lista: la anterior se queda atenuada hasta
 * que llega la nueva, como en Posiciones. Y solo la última respuesta escribe:
 * dos toques rápidos no dejan la lista de la primera categoría.
 */
export default function RecordsScreen({ route, navigation }: Props) {
  const [grupo, setGrupo] = useState<GrupoHistorico>(route.params.grupo);
  const [stat, setStat] = useState(route.params.stat);
  const [vista, setVista] = useState<Vista>('carrera');
  const [datos, setDatos] = useState<LideresHistoricos | null>(null);
  const [temporadas, setTemporadas] = useState<MejoresTemporadas | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setEstado('cargando');
    const [r, t] = await Promise.all([fetchLideresHistoricos(grupo, stat), fetchMejoresTemporadas(grupo, stat)]);
    if (n !== pedido.current) return;
    if (!r) {
      setEstado('error');
      return;
    }
    setDatos(r);
    setTemporadas(t);
    setEstado('listo');
  }, [grupo, stat]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: datos ? `Récords · ${datos.label}` : 'Récords' });
  }, [navigation, datos]);

  const abrir = (l: Pick<LiderHistorico, 'player_id' | 'id_miembro' | 'name'>) => {
    if (l.player_id) navigation.push('Jugador', { playerId: l.player_id, nombre: l.name });
    else if (l.id_miembro != null) navigation.push('Historico', { idMiembro: l.id_miembro, nombre: l.name });
  };

  // Sin temporadas publicadas (o de otra categoría, mientras llega la nueva)
  // se ve la carrera.
  const hayTemporadas = !!temporadas && !!datos && temporadas.stat === datos.stat;
  const vistaActiva: Vista = hayTemporadas ? vista : 'carrera';
  const filas: Fila[] =
    vistaActiva === 'temporada' && temporadas
      ? temporadas.data.map(t => ({ tipo: 'temporada' as const, t }))
      : (datos?.data ?? []).map(l => ({ tipo: 'carrera' as const, l }));
  const [primera, ...resto] = filas;
  const minimo = vistaActiva === 'temporada' ? temporadas?.minimum : datos?.minimum;

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
            nota: c.is_rate
              ? vistaActiva === 'temporada'
                ? 'Con mínimo por temporada'
                : 'Con mínimo de carrera'
              : undefined,
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
          // Un jugador puede tener varias de las mejores temporadas: la llave
          // de esa vista lleva la temporada.
          keyExtractor={f =>
            f.tipo === 'carrera'
              ? `${f.l.player_id ?? f.l.id_miembro}`
              : `${f.t.player_id ?? f.t.id_miembro}-${f.t.season_id}`
          }
          contentContainerStyle={{ paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={
            <View style={{ padding: 16, paddingBottom: 8 }}>
              {hayTemporadas && <SelectorVista vista={vistaActiva} onChange={setVista} />}
              <Aparecer key={`${datos.group}-${datos.stat}-${vistaActiva}`}>
                {primera ? (
                  <Tarjeta fila={primera} stat={datos.stat} etiqueta={datos.label} onPress={abrir} />
                ) : (
                  <Text style={styles.vacioTexto}>Nadie alcanza el mínimo en esta categoría.</Text>
                )}
                {!!minimo && <Text style={styles.minimo}>Mínimo: {minimo}</Text>}
              </Aparecer>
            </View>
          }
          renderItem={({ item }) => {
            const { rank, name } = item.tipo === 'carrera' ? item.l : item.t;
            const valor = valorHistorico(datos.stat, item.tipo === 'carrera' ? item.l.value : item.t.value);
            return (
              <Pressable
                onPress={() => abrir(item.tipo === 'carrera' ? item.l : item.t)}
                style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
                accessibilityRole="button"
                accessibilityLabel={`${rank}. ${name}${item.tipo === 'temporada' ? `, ${item.t.season_id}` : ''}, ${valor}`}
              >
                <Text style={styles.puesto}>{rank}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.nombre} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.epoca} numberOfLines={1}>
                    {linea(item)}
                  </Text>
                </View>
                <Text style={styles.valor}>{valor}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          }}
          ListFooterComponent={
            <Text style={styles.fuente}>
              Serie regular. Fuentes: LIDOM hasta 2011-12 y MLB Stats API desde 2012-13.
              {vistaActiva === 'temporada' &&
                ' Las mejores temporadas cuentan solo temporadas terminadas: la que está en curso entra cuando acaba.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

/** La línea bajo el nombre: la época de la carrera, o la temporada. Los equipos, siempre con su código. */
function linea(f: Fila): string {
  if (f.tipo === 'carrera') {
    return `${epocaHistorica(f.l.first_season, f.l.last_season)} · ${f.l.teams.join(' · ')}`;
  }
  return `${f.t.season_id} · ${f.t.teams.join(' / ')}`;
}

/**
 * Carrera | Una temporada. Dos opciones que cambian la misma lista: un
 * control segmentado, no otra fila de pestañas (las de Bateo | Pitcheo ya
 * están arriba y dos barras subrayadas se confunden). 44 pt de alto; la
 * elegida, rellena de navy como los chips de orden.
 */
function SelectorVista({ vista, onChange }: { vista: Vista; onChange: (v: Vista) => void }) {
  return (
    <View style={styles.segmento} accessibilityRole="tablist">
      {(['carrera', 'temporada'] as const).map(v => {
        const activa = v === vista;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            style={[styles.segmentoOpcion, activa && styles.segmentoActiva]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activa }}
          >
            <Text style={[styles.segmentoTexto, activa && styles.segmentoTextoActivo]}>
              {v === 'carrera' ? 'Carrera' : 'Una temporada'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** La tarjeta navy del primero: el récord de carrera o la mejor temporada. */
function Tarjeta({
  fila,
  stat,
  etiqueta,
  onPress,
}: {
  fila: Fila;
  stat: string;
  etiqueta: string;
  onPress: (l: Pick<LiderHistorico, 'player_id' | 'id_miembro' | 'name'>) => void;
}) {
  const persona = fila.tipo === 'carrera' ? fila.l : fila.t;
  const valor = valorHistorico(stat, persona.value);
  const titulo = fila.tipo === 'carrera' ? 'Récord de todos los tiempos' : 'Mejor temporada de la historia';
  const detalle =
    fila.tipo === 'carrera'
      ? `${epocaHistorica(fila.l.first_season, fila.l.last_season)} · ${fila.l.seasons} ${
          fila.l.seasons === 1 ? 'temporada' : 'temporadas'
        }`
      : `Temporada ${fila.t.season_id}`;
  return (
    <Tocable
      onPress={() => onPress(persona)}
      style={styles.record}
      accessibilityRole="button"
      accessibilityLabel={`${titulo} en ${etiqueta}: ${persona.name}, ${valor}${
        fila.tipo === 'temporada' ? `, temporada ${fila.t.season_id}` : ''
      }`}
    >
      <Text style={styles.recordTitulo}>
        {titulo} · {etiqueta}
      </Text>
      <View style={styles.recordFila}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.recordNombre} numberOfLines={2}>
            {persona.name}
          </Text>
          <Text style={styles.recordEpoca}>{detalle}</Text>
        </View>
        <Text style={styles.recordValor}>{valor}</Text>
      </View>
      <View style={styles.recordEquipos}>
        {persona.teams.slice(0, 4).map(c => (
          <TeamBadge key={c} code={c} size={28} variant="solid" />
        ))}
      </View>
    </Tocable>
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
  segmento: {
    flexDirection: 'row',
    marginBottom: 12,
    padding: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  segmentoOpcion: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  segmentoActiva: { backgroundColor: COLORS.accent },
  segmentoTexto: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  segmentoTextoActivo: { color: COLORS.accentOn },
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
