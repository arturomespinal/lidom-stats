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

import { searchPlayers } from '../api';
import { COLORS } from '../constants';
import { useFichas } from '../navigation';
import type { PlayerSearchHit } from '../types';
import TeamBadge from '../components/TeamBadge';

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
}

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
  const [resultado, setResultado] = useState<Resultado>({ consulta: '', hits: [] });
  const [fallo, setFallo] = useState(false);

  const consulta = texto.trim();

  useEffect(() => {
    if (consulta.length < 2) return;
    const control = new AbortController();
    const t = setTimeout(async () => {
      const hits = await searchPlayers(consulta, control.signal);
      if (control.signal.aborted) return;
      // Un fallo de red no vacía la lista: lo de hace un segundo sirve más
      // que un panel en blanco. Solo se avisa.
      if (hits === null) {
        setFallo(true);
        return;
      }
      setFallo(false);
      setResultado({ consulta, hits });
    }, 250);
    return () => {
      clearTimeout(t);
      control.abort();
    };
  }, [consulta]);

  const corto = consulta.length < 2;
  const buscando = !corto && resultado.consulta !== consulta && !fallo;
  const hits = corto ? [] : resultado.hits;

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
        data={hits}
        keyExtractor={h => h.player_id}
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
            <Text style={styles.ayuda}>
              Escribe al menos dos letras. Hay 2.253 jugadores, de la 2012-13 a la
              2025-26.
            </Text>
          ) : !buscando && resultado.consulta === consulta ? (
            <Text style={styles.ayuda}>Nadie se llama así en la base.</Text>
          ) : null
        }
        renderItem={({ item }) => {
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
});
