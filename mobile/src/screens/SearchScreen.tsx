import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { fetchResumenHistorico, searchPlayers } from '../api';
import { COLORS, FONTS } from '../constants';
import { epocaHistorica, valorHistorico } from '../formato';
import { useFichas } from '../navigation';
import type { HistoricoHit, PlayerSearchHit, ResumenHistorico } from '../types';
import TeamBadge from '../components/TeamBadge';
import { Tocable } from '../components/Movimiento';

/**
 * Lo que la lista muestra, y la consulta a la que corresponde.
 *
 * Van en UN estado y no en dos: con resultados y consulta por separado hace
 * falta mantenerlos a la par a mano, y el día que se desfasen la lista dice
 * "sin resultados" para algo que sí los tiene. Lo que se pinta se DERIVA:
 * "buscando" es "lo que tengo no corresponde a lo escrito". Mismo diseño que
 * PlayerSearch.tsx en la web.
 */
interface Resultado {
  consulta: string;
  hits: PlayerSearchHit[];
  /** Los que solo están en DIGIMETRICS (antes de 2012-13). */
  historicos: HistoricoHit[];
}

/** Una fila de la lista: un jugador de la MLB API, el rótulo de los históricos, o un histórico. */
type Item =
  | { tipo: 'mlb'; hit: PlayerSearchHit }
  | { tipo: 'titulo' }
  | { tipo: 'hist'; hit: HistoricoHit };

/** "LIC,TOR" + "TOR,EST" → ["LIC", "TOR", "EST"], sin repetir. */
function equipos(h: PlayerSearchHit): string[] {
  const todos = [h.batting_teams, h.pitching_teams]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return [...new Set(todos)];
}

/**
 * El buscador: la única puerta a las 2.253 fichas de jugador.
 *
 * ── Por qué es una pestaña y no una lupa en la cabecera ─────────────────
 * Las reglas de diseño ponen la navegación principal en el 40% inferior de
 * la pantalla, donde llega el pulgar. Una lupa arriba a la derecha es lo
 * convencional, pero en un teléfono de 6.7" es el punto más lejano de la
 * mano. Como pestaña queda abajo, y además se ve: una lupa es fácil de no
 * notar.
 *
 * ── 250 ms de espera y cancelación ──────────────────────────────────────
 * Sin la espera, escribir "munguia" dispara siete peticiones. Sin la
 * cancelación, la respuesta lenta de "mun" puede llegar después de la de
 * "munguia" y pisarla.
 */
export default function SearchScreen() {
  const nav = useFichas();
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<Resultado>({ consulta: '', hits: [], historicos: [] });
  const [fallo, setFallo] = useState(false);
  // Los récords de la pantalla vacía. Se piden una vez: cambian solo cuando
  // entra un juego, y la API ya los guarda en caché.
  const [records, setRecords] = useState<ResumenHistorico | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchResumenHistorico().then(r => {
      if (vivo) setRecords(r);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const consulta = texto.trim();

  useEffect(() => {
    if (consulta.length < 2) return;
    const control = new AbortController();
    const t = setTimeout(async () => {
      const r = await searchPlayers(consulta, control.signal);
      if (control.signal.aborted) return;
      // Un fallo de red no vacía la lista: lo de hace un segundo sirve más
      // que un panel en blanco. Solo se avisa.
      if (r === null) {
        setFallo(true);
        return;
      }
      setFallo(false);
      setResultado({ consulta, hits: r.jugadores, historicos: r.historicos });
    }, 250);
    return () => {
      clearTimeout(t);
      control.abort();
    };
  }, [consulta]);

  const corto = consulta.length < 2;
  const buscando = !corto && resultado.consulta !== consulta && !fallo;
  const items: Item[] = corto
    ? []
    : [
        ...resultado.hits.map(hit => ({ tipo: 'mlb' as const, hit })),
        ...(resultado.historicos.length ? [{ tipo: 'titulo' as const }] : []),
        ...resultado.historicos.map(hit => ({ tipo: 'hist' as const, hit })),
      ];

  return (
    <View style={styles.pagina}>
      <View style={styles.barra}>
        <Ionicons name="search" size={18} color={COLORS.textSecondary} />
        <TextInput
          value={texto}
          onChangeText={setTexto}
          placeholder="Busca un jugador"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.entrada}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Buscar jugador por nombre"
        />
      </View>

      <FlatList
        data={items}
        keyExtractor={i => (i.tipo === 'mlb' ? i.hit.player_id : i.tipo === 'hist' ? `h${i.hit.id_miembro}` : 'titulo')}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListHeaderComponent={
          buscando || fallo ? (
            <Text style={styles.estado} accessibilityLiveRegion="polite">
              {fallo ? 'Sin conexión. Mostrando lo último que llegó.' : 'Buscando…'}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          corto ? (
            // Un View y no un fragmento: la lista le pone onLayout a este
            // elemento, y un fragmento no lo admite.
            <View>
              {records && (
                <PanelRecords
                  records={records}
                  onAbrir={(grupo, stat) => nav.push('Records', { grupo, stat })}
                />
              )}
              <Text style={styles.ayuda}>
                Escribe al menos dos letras. Están los jugadores de LIDOM desde 1951.
              </Text>
            </View>
          ) : !buscando && resultado.consulta === consulta ? (
            <Text style={styles.ayuda}>Nadie se llama así en la base.</Text>
          ) : null
        }
        renderItem={({ item: fila }) => {
          if (fila.tipo === 'titulo') {
            return <Text style={styles.titulo}>Históricos · antes de 2012-13</Text>;
          }
          if (fila.tipo === 'hist') {
            const h = fila.hit;
            return (
              <Pressable
                onPress={() => nav.push('Historico', { idMiembro: h.id_miembro, nombre: h.name })}
                style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
                accessibilityRole="button"
                accessibilityLabel={`${h.name}, ${epocaHistorica(h.first_season, h.last_season)}. ${h.teams.join(', ')}`}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.nombre} numberOfLines={1}>
                    {h.name}
                  </Text>
                  {/* Sin fecha de nacimiento en la fuente: lo que los distingue es la época. */}
                  <Text style={styles.meta} numberOfLines={1}>
                    {epocaHistorica(h.first_season, h.last_season)}
                  </Text>
                </View>
                <View style={styles.tejas}>
                  {h.teams.slice(0, 3).map(c => (
                    <TeamBadge key={c} code={c} size={24} />
                  ))}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          }
          const item = fila.hit;
          const eqs = equipos(item);
          const anio = item.birth_date?.slice(0, 4);
          return (
            <Pressable
              onPress={() => nav.push('Jugador', { playerId: item.player_id, nombre: item.full_name })}
              style={({ pressed }) => [styles.fila, pressed && styles.presionada]}
              accessibilityRole="button"
              accessibilityLabel={`${item.full_name}${anio ? `, nacido en ${anio}` : ''}. ${eqs.join(', ')}`}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.nombre} numberOfLines={1}>
                  {item.full_name}
                </Text>
                {/* El año de nacimiento es lo que separa a dos homónimos. */}
                <Text style={styles.meta} numberOfLines={1}>
                  {[anio && `n. ${anio}`, item.nationality].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.tejas}>
                {eqs.slice(0, 3).map(c => (
                  <TeamBadge key={c} code={c} size={24} />
                ))}
                {eqs.length > 3 && <Text style={styles.mas}>+{eqs.length - 3}</Text>}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  entrada: { flex: 1, height: 44, fontSize: 16, color: COLORS.textPrimary },
  estado: { fontSize: 11, color: COLORS.textSecondary, paddingHorizontal: 16, paddingBottom: 8 },
  ayuda: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  fila: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 8,
    backgroundColor: COLORS.bgCard,
  },
  presionada: { backgroundColor: COLORS.bgRaised },
  nombre: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  meta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
  tejas: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mas: { fontSize: 11, color: COLORS.textSecondary },
  chevron: { fontSize: 22, color: COLORS.textFaint, width: 16, textAlign: 'center' },
  sep: { height: 1, backgroundColor: COLORS.borderSoft },
  titulo: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
    backgroundColor: COLORS.bgHeader,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  panel: { paddingHorizontal: 16, paddingTop: 8 },
  panelTitulo: { fontFamily: FONTS.display, fontSize: 28, lineHeight: 30, paddingTop: 2, color: COLORS.textPrimary },
  panelSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, marginBottom: 12 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tarjeta: {
    minHeight: 88,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  tarjetaEtiqueta: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.textSecondary },
  // Bebas sin fontWeight (ver FONTS).
  tarjetaValor: { fontFamily: FONTS.display, fontSize: 32, lineHeight: 34, paddingTop: 4, color: COLORS.textPrimary },
  tarjetaNombre: { fontSize: 12, color: COLORS.textSupport },
});

/**
 * La pantalla vacía del buscador: los dueños de los récords de todos los
 * tiempos. Es la puerta a la historia en el móvil: con cinco pestañas abajo
 * no cabe una sexta, y el buscador vacío era espacio sin usar. Cada tarjeta
 * abre la tabla completa de su categoría.
 */
function PanelRecords({
  records,
  onAbrir,
}: {
  records: ResumenHistorico;
  onAbrir: (grupo: 'bateo' | 'pitcheo', stat: string) => void;
}) {
  const todas = (['bateo', 'pitcheo'] as const).flatMap(g => records[g].map(c => ({ ...c, grupo: g })));
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitulo} accessibilityRole="header">
        Récords de todos los tiempos
      </Text>
      <Text style={styles.panelSub}>LIDOM desde 1951 · serie regular</Text>
      <View style={styles.rejilla}>
        {todas.map(c => (
          <Tocable
            key={`${c.grupo}-${c.stat}`}
            contenedor={{ width: '48.5%' }}
            onPress={() => onAbrir(c.grupo, c.stat)}
            style={({ pressed }) => [styles.tarjeta, pressed && styles.presionada]}
            accessibilityRole="button"
            accessibilityLabel={`${c.label}: ${c.leader ? `${c.leader.name}, ${valorHistorico(c.stat, c.leader.value)}` : 'sin datos'}`}
          >
            <Text style={styles.tarjetaEtiqueta} numberOfLines={1}>
              {c.label}
            </Text>
            <Text style={styles.tarjetaValor}>{c.leader ? valorHistorico(c.stat, c.leader.value) : '—'}</Text>
            <Text style={styles.tarjetaNombre} numberOfLines={1}>
              {c.leader?.name ?? 'Sin datos'}
            </Text>
          </Tocable>
        ))}
      </View>
    </View>
  );
}
