import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { fetchComparacion, searchPlayers } from '../api';
import { COLORS } from '../constants';
import type { FichasParamList } from '../navigation';
import type { Comparacion, PlayerSearchHit, RenglonComparado, RolComparacion } from '../types';
import EmptyState from '../components/EmptyState';
import Seccion from '../components/Seccion';
import TeamBadge from '../components/TeamBadge';
import { tematico, temaActual } from '../tema';

type Props = NativeStackScreenProps<FichasParamList, 'Comparar'>;
type Elegido = { id: string; nombre: string } | null;

/**
 * Dos jugadores lado a lado: la carrera completa o una temporada que jugaron
 * los dos, en bateo o en pitcheo. Se abre con el botón "Comparar" de la ficha
 * de un jugador, que deja puesto al de la izquierda; el otro se elige aquí.
 * Misma pantalla que la web (frontend/app/comparar/page.tsx).
 *
 * Todo lo que se compara lo compone el servidor (GET /players/compare,
 * src/comparar.py): las tasas recompuestas, quién gana cada renglón (en
 * efectividad, la MÁS BAJA) y la frase. Aquí solo se dibuja.
 */

/** El buscador de un lado: escribe, espera 250 ms, cancela la anterior. */
function Buscador({ lado, onElegir }: { lado: 'a' | 'b'; onElegir: (j: PlayerSearchHit) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ q: string; data: PlayerSearchHit[] }>({ q: '', data: [] });

  useEffect(() => {
    const termino = q.trim();
    if (termino.length < 2) return;
    const control = new AbortController();
    const reloj = setTimeout(async () => {
      const r = await searchPlayers(termino, control.signal, 8);
      // Un fallo no vacía la lista: lo de hace un segundo sirve más que nada.
      if (r && !control.signal.aborted) setRes({ q: termino, data: r.jugadores });
    }, 250);
    return () => {
      control.abort();
      clearTimeout(reloj);
    };
  }, [q]);

  const termino = q.trim();
  const visibles = termino.length < 2 ? [] : res.data;
  const buscando = termino.length >= 2 && res.q !== termino;
  return (
    <View>
      <View style={styles.barra}>
        <Ionicons name="search" size={17} color={COLORS.textSecondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={lado === 'a' ? 'Primer jugador' : 'Segundo jugador'}
          placeholderTextColor={COLORS.textSecondary}
          style={styles.entrada}
          autoFocus
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          clearButtonMode="while-editing"
          keyboardAppearance={temaActual() === 'claro' ? 'light' : 'dark'}
          accessibilityLabel={lado === 'a' ? 'Buscar el primer jugador' : 'Buscar el segundo jugador'}
        />
      </View>
      {termino.length >= 2 && visibles.length === 0 && (
        <Text style={styles.ayuda}>{buscando ? 'Buscando…' : 'Sin coincidencias'}</Text>
      )}
      {visibles.map(j => {
        const equipos = [...new Set(`${j.batting_teams ?? ''},${j.pitching_teams ?? ''}`.split(',').filter(Boolean))];
        return (
          <Pressable
            key={j.player_id}
            onPress={() => onElegir(j)}
            style={({ pressed }) => [styles.resultado, pressed && styles.presionado]}
            accessibilityRole="button"
            accessibilityLabel={`Elegir a ${j.full_name}`}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.resultadoNombre} numberOfLines={1}>{j.full_name}</Text>
              {!!j.birth_date && <Text style={styles.resultadoNota}>{j.birth_date}</Text>}
            </View>
            <View style={styles.tejas}>
              {equipos.slice(0, 3).map(c => <TeamBadge key={c} code={c} size={24} />)}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function Barra({ valor, maximo, gana, lado }: { valor: number; maximo: number; gana: boolean; lado: 'izq' | 'der' }) {
  const ancho = valor > 0 && maximo > 0 ? Math.max(4, (valor / maximo) * 100) : 0;
  return (
    <View style={[styles.carril, lado === 'izq' ? styles.carrilIzq : styles.carrilDer]}>
      {ancho > 0 && (
        <View
          style={[
            styles.barraDato,
            lado === 'izq' ? styles.barraIzq : styles.barraDer,
            { width: `${ancho}%`, backgroundColor: gana ? COLORS.accent : COLORS.border },
          ]}
        />
      )}
    </View>
  );
}

/**
 * Un renglón: la cifra de A, la etiqueta con las barras enfrentadas, la de B.
 * El color dice quién gana, no de quién es la barra (eso lo dice el lado).
 * Los de volumen (juegos, apariciones) van sin barras: no se ganan.
 */
function Renglon({ f, nombres }: { f: RenglonComparado; nombres: [string, string] }) {
  const estilo = (gana: boolean) =>
    !f.decides ? styles.valorNeutro : gana ? styles.valorGana : f.better ? styles.valorPierde : styles.valorNeutro;
  const quien = f.better ? ` Gana ${f.better === 'a' ? nombres[0] : nombres[1]}.` : '';
  return (
    <View style={styles.fila} accessible accessibilityLabel={`${f.label}: ${nombres[0]} ${f.a_text}, ${nombres[1]} ${f.b_text}.${quien}`}>
      <Text style={[styles.valor, styles.valorIzq, estilo(f.better === 'a')]}>{f.a_text}</Text>
      <View style={styles.centro}>
        <Text style={styles.etiqueta}>{f.label}</Text>
        {f.decides && f.a != null && f.b != null && (
          <View style={styles.barras}>
            <Barra valor={f.a} maximo={Math.max(f.a, f.b)} gana={f.better === 'a'} lado="izq" />
            <Barra valor={f.b} maximo={Math.max(f.a, f.b)} gana={f.better === 'b'} lado="der" />
          </View>
        )}
      </View>
      <Text style={[styles.valor, styles.valorDer, estilo(f.better === 'b')]}>{f.b_text}</Text>
    </View>
  );
}

function Pastilla({ texto, activa, onPress }: { texto: string; activa: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pastilla, activa && styles.pastillaActiva, pressed && !activa && styles.presionado]}
      accessibilityRole="button"
      accessibilityState={{ selected: activa }}
    >
      <Text style={[styles.pastillaTexto, activa && styles.pastillaTextoActiva]}>{texto}</Text>
    </Pressable>
  );
}

export default function CompararScreen({ route, navigation }: Props) {
  const p = route.params ?? {};
  const [a, setA] = useState<Elegido>(p.a ? { id: p.a, nombre: p.nombreA ?? '' } : null);
  const [b, setB] = useState<Elegido>(p.b ? { id: p.b, nombre: p.nombreB ?? '' } : null);
  const [rol, setRol] = useState<RolComparacion | undefined>(undefined);
  const [temporada, setTemporada] = useState<string | undefined>(undefined);
  const [cmp, setCmp] = useState<Comparacion | null>(null);
  const [estado, setEstado] = useState<'vacio' | 'cargando' | 'listo' | 'error'>('vacio');
  const pedido = useRef(0);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Comparar' });
  }, [navigation]);

  useEffect(() => {
    if (!a || !b) {
      setCmp(null);
      setEstado('vacio');
      return;
    }
    // Solo la última petición escribe: tocar tres temporadas seguidas
    // dispara tres respuestas que llegan en cualquier orden.
    const n = ++pedido.current;
    setEstado('cargando');
    fetchComparacion(a.id, b.id, rol, temporada).then(r => {
      if (n !== pedido.current) return;
      setCmp(r);
      setEstado(r ? 'listo' : 'error');
    });
  }, [a, b, rol, temporada]);

  // Al cambiar a uno de los dos se sueltan el papel y la temporada: la
  // temporada puede no ser común con el nuevo, y el papel por defecto
  // depende de los dos.
  const elegir = (lado: 'a' | 'b') => (j: PlayerSearchHit) => {
    const nuevo = { id: j.player_id, nombre: j.full_name };
    if (lado === 'a') setA(nuevo);
    else setB(nuevo);
    setRol(undefined);
    setTemporada(undefined);
  };
  const soltar = (lado: 'a' | 'b') => () => {
    if (lado === 'a') setA(null);
    else setB(null);
    setRol(undefined);
    setTemporada(undefined);
  };

  const jugadores = cmp?.players;
  const lado = (l: 'a' | 'b', e: Elegido) => {
    const j = jugadores?.[l === 'a' ? 0 : 1];
    const nombre = j?.full_name ?? e?.nombre ?? '';
    const pie = j ? [j.volume, j.age != null ? `${j.age} años` : null].filter(Boolean).join(' · ') : '';
    return (
      <View style={[styles.lado, l === 'b' && styles.ladoDer]}>
        {!!j?.team_code && <TeamBadge code={j.team_code} size={30} variant="solid" />}
        <View style={{ flexShrink: 1, alignItems: l === 'b' ? 'flex-end' : 'flex-start' }}>
          <Text style={[styles.nombre, l === 'b' && { textAlign: 'right' }]} numberOfLines={2}>{nombre}</Text>
          {!!pie && <Text style={[styles.pie, l === 'b' && { textAlign: 'right' }]}>{pie}</Text>}
          <Pressable onPress={soltar(l)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Cambiar a ${nombre}`}>
            <Text style={styles.cambiar}>Cambiar</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.pagina} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>Dos jugadores lado a lado: la carrera o una temporada que jugaron los dos.</Text>

      <View style={styles.tarjeta}>
        <View style={styles.cabecera}>
          {a ? lado('a', a) : <Text style={[styles.hueco]}>Primer jugador</Text>}
          <Text style={styles.vs}>VS</Text>
          {b ? lado('b', b) : <Text style={[styles.hueco, { textAlign: 'right' }]}>Segundo jugador</Text>}
        </View>
        {/* Un buscador a la vez: primero el que falte a la izquierda. */}
        {!a && <Buscador lado="a" onElegir={elegir('a')} />}
        {!!a && !b && <Buscador lado="b" onElegir={elegir('b')} />}
      </View>

      {estado === 'cargando' && !cmp && <ActivityIndicator color={COLORS.textSecondary} style={{ marginTop: 24 }} />}
      {estado === 'error' && (
        <EmptyState message="No se pudo armar la comparación. Prueba con otro jugador o revisa la conexión." />
      )}

      {cmp && a && b && (
        <View style={{ opacity: estado === 'cargando' ? 0.6 : 1 }}>
          {/* El papel se elige si hay otro en que los dos tienen cifras. */}
          {cmp.roles.some(r => r !== cmp.role) && (
            <View style={styles.filaPastillas}>
              {cmp.roles.map(r => (
                <Pastilla
                  key={r}
                  texto={r === 'batting' ? 'Bateo' : 'Pitcheo'}
                  activa={r === cmp.role}
                  onPress={() => {
                    setRol(r);
                    setTemporada(undefined);
                  }}
                />
              ))}
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filaPastillas}>
            {['career', ...cmp.seasons_in_common].map(t => (
              <Pastilla
                key={t}
                texto={t === 'career' ? 'Carrera' : t}
                activa={t === cmp.season}
                onPress={() => setTemporada(t === 'career' ? undefined : t)}
              />
            ))}
          </ScrollView>

          <View style={styles.seccion}>
            <Seccion
              titulo={cmp.role === 'batting' ? 'Bateo' : 'Pitcheo'}
              nota={cmp.season_label}
              titular={cmp.headline}
              sub={
                cmp.comparable === false
                  ? undefined
                  : cmp.note ?? (cmp.season === 'career' ? 'Carrera completa, con los años anteriores a 2012-13 si los tiene.' : undefined)
              }
            />
          </View>
          {cmp.comparable !== false ? (
            <View style={styles.tabla}>
              {cmp.rows.map(f => (
                <Renglon key={f.key} f={f} nombres={[cmp.players[0].full_name, cmp.players[1].full_name]} />
              ))}
            </View>
          ) : (
            // Un lanzador contra un bateador: no hay renglones que comparar.
            // Antes salía una tabla de rayas de un lado (16-nov-2026).
            <View style={styles.aviso}>
              <Text style={styles.avisoTexto}>{cmp.note} Compara jugadores del mismo papel.</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = tematico(() => StyleSheet.create({
  pagina: { flex: 1, backgroundColor: COLORS.bgPage },
  intro: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingTop: 14 },
  tarjeta: {
    margin: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lado: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  ladoDer: { flexDirection: 'row-reverse' },
  nombre: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  pie: { color: COLORS.textSecondary, fontSize: 11, marginTop: 1 },
  cambiar: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 4, textDecorationLine: 'underline' },
  hueco: { flex: 1, color: COLORS.textFaint, fontSize: 14 },
  vs: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700', letterSpacing: 1 },

  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgHeader,
  },
  entrada: { flex: 1, height: 44, fontSize: 16, color: COLORS.textPrimary },
  ayuda: { color: COLORS.textSecondary, fontSize: 13, paddingTop: 10, textAlign: 'center' },
  resultado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  resultadoNombre: { color: COLORS.textPrimary, fontSize: 15 },
  resultadoNota: { color: COLORS.textFaint, fontSize: 11, fontVariant: ['tabular-nums'] },
  tejas: { flexDirection: 'row', gap: 4 },
  presionado: { backgroundColor: COLORS.bgRaised },

  filaPastillas: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  pastilla: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  pastillaActiva: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  pastillaTexto: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  pastillaTextoActiva: { color: COLORS.accentOn },

  seccion: { marginTop: -12 },
  aviso: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 28,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
  },
  avisoTexto: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  tabla: {
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  valor: { width: 58, fontSize: 14, fontVariant: ['tabular-nums'] },
  valorIzq: { textAlign: 'left' },
  valorDer: { textAlign: 'right' },
  valorGana: { color: COLORS.textPrimary, fontWeight: '700' },
  valorPierde: { color: COLORS.textSecondary },
  valorNeutro: { color: COLORS.textSupport },
  centro: { flex: 1 },
  etiqueta: { color: COLORS.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 4 },
  barras: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  carril: { flex: 1, height: 8, flexDirection: 'row' },
  carrilIzq: { justifyContent: 'flex-end' },
  carrilDer: { justifyContent: 'flex-start' },
  barraDato: { height: 8 },
  barraIzq: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  barraDer: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
}));
