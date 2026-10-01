import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants';
import TeamBadge from './TeamBadge';

/**
 * Una columna de la tabla. Se declaran como DATOS y no como JSX repetido: la
 * cabecera, las filas y el pie de carrera tienen que ir en el mismo orden, y
 * con tres listas escritas a mano es cuestión de tiempo que una se desfase.
 * Mismo patrón que la web (SeasonTable.tsx).
 */
export interface Col<T> {
  /** Sigla oficial: lo que un fanático busca con la vista. */
  k: string;
  /** Nombre largo, para el lector de pantalla. */
  t: string;
  val: (f: T) => string;
  /** Las tasas van en tinta y con más peso: son el dato que se compara. */
  fuerte?: boolean;
  /** Ancho propio, para columnas cuyo total de carrera no cabe ("223.2"). */
  ancho?: number;
}

type Temporada = {
  season_id: string;
  team_code: string;
  /** Solo las filas de DIGIMETRICS: "regular", "round_robin" o "final". */
  stage?: string;
};

const ALTO_FILA = 44;
const ALTO_CABECERA = 32;
const ALTO_SEPARADOR = 28;
const ANCHO_FIJA = 104;
/** Con marcas de etapa ("1973-74 RR") la columna fija necesita más. */
const ANCHO_FIJA_ETAPAS = 136;

/** Las etapas que no son la regular llevan una marca junto a la temporada. */
const ETAPA: Record<string, string> = { round_robin: 'RR', final: 'Final' };
const ANCHO_COL = 40;
const ANCHO_TASA = 52;

/**
 * Temporada por temporada, con la carrera al pie.
 *
 * ── La columna de la temporada NO se desplaza ─────────────────────────────
 * Con dieciséis columnas de bateo no hay teléfono donde quepan. Encogerlas
 * deja cada número en dos líneas; desplazar la tabla entera pierde de vista
 * de qué año es la fila que uno está leyendo. Así que la temporada y el
 * equipo van en una columna fija a la izquierda, y solo las cifras se
 * desplazan. React Native no tiene `position: sticky` en horizontal: son dos
 * columnas lado a lado con las filas a la MISMA altura fija, que es lo que
 * las mantiene alineadas.
 *
 * ── La fila lleva al equipo de ESA temporada ─────────────────────────────
 * Tocar la celda fija abre el equipo en ese año, no en el actual: quien toca
 * "2016-17 · LIC" quiere ver el Licey con el que jugó, no el de hoy.
 */
export default function TablaTemporadas<T>({
  temporadas,
  carrera,
  cols,
  onEquipo,
  historicas = [],
  // Corto a propósito: tiene que caber en la columna fija (en Android, lo
  // que se sale lo tapa la parte desplazable). La fuente va en la nota del pie.
  separador = 'Antes de 2012-13',
  etiquetaCarrera = 'Carrera',
  postemporada = null,
}: {
  temporadas: (T & Temporada)[];
  carrera: (T & { seasons: number }) | null;
  cols: Col<T>[];
  onEquipo: (code: string, season: string) => void;
  /**
   * Temporadas de DIGIMETRICS, debajo de las de la MLB API. No abren el
   * equipo: de esos años no hay ficha de equipo.
   */
  historicas?: (T & Temporada)[];
  /** La franja entre las dos fuentes; null para no ponerla. */
  separador?: string | null;
  /** La etiqueta de la fila de carrera. */
  etiquetaCarrera?: string;
  /** Una segunda fila de totales: la postemporada (ficha de un histórico). */
  postemporada?: (T & { seasons: number }) | null;
}) {
  const [visible, setVisible] = useState(0);
  const [contenido, setContenido] = useState(0);
  const [desplazada, setDesplazada] = useState(false);

  const ancho = (c: Col<T>) => c.ancho ?? (c.fuerte ? ANCHO_TASA : ANCHO_COL);
  const conEtapas = historicas.some(f => f.stage && ETAPA[f.stage]);
  const anchoFija = conEtapas ? ANCHO_FIJA_ETAPAS : ANCHO_FIJA;
  const conSeparador = historicas.length > 0 && !!separador;
  // La pista "Desliza" solo aparece si de verdad hay algo escondido, y se va
  // en cuanto el usuario la usa: una instrucción que ya se cumplió es ruido.
  const hayMas = contenido > visible + 1 && !desplazada;

  return (
    <View style={styles.marco}>
      <View style={styles.cuerpo}>
        {/* ── Columna fija ── */}
        <View style={[styles.fija, { width: anchoFija }]}>
          <View style={[styles.celdaCab, { height: ALTO_CABECERA }]}>
            <Text style={styles.cab}>Temp.</Text>
          </View>
          {temporadas.map((f, i) => (
            <Pressable
              key={`${f.season_id}-${f.team_code}-${i}`}
              onPress={() => onEquipo(f.team_code, f.season_id)}
              style={({ pressed }) => [styles.fijaFila, pressed && styles.presionada]}
              accessibilityRole="button"
              accessibilityLabel={`${f.team_code} en ${f.season_id}. Abrir equipo`}
            >
              <Text style={styles.temporada}>{f.season_id}</Text>
              <TeamBadge code={f.team_code} size={24} />
            </Pressable>
          ))}
          {/* La franja entre fuentes: la columna fija lleva una franja vacía
              y el texto va en la parte desplazable, a la MISMA altura, que es
              lo que mantiene alineadas las filas de abajo. En la fija no cabe:
              con 104 pt "Antes de 2012-13" salía cortado. */}
          {conSeparador && <View style={styles.separador} />}
          {historicas.map((f, i) => (
            <View
              key={`h${f.season_id}-${f.team_code}-${f.stage ?? ''}-${i}`}
              style={styles.fijaFila}
              accessible
              accessibilityLabel={`${f.team_code} en ${f.season_id}${f.stage && ETAPA[f.stage] ? `, ${ETAPA[f.stage]}` : ''}`}
            >
              <View style={styles.temporadaCaja}>
                <Text style={styles.temporada}>{f.season_id}</Text>
                {!!f.stage && !!ETAPA[f.stage] && <Text style={styles.etapa}>{ETAPA[f.stage]}</Text>}
              </View>
              <TeamBadge code={f.team_code} size={24} />
            </View>
          ))}
          {carrera && (
            <View style={[styles.fijaFila, styles.pie]}>
              <Text style={styles.carrera} numberOfLines={1}>
                {etiquetaCarrera}
              </Text>
              <Text style={styles.nTemp}>{carrera.seasons}T</Text>
            </View>
          )}
          {postemporada && (
            <View style={[styles.fijaFila, styles.pie2]}>
              <Text style={styles.post} numberOfLines={1}>
                Postemp.
              </Text>
              <Text style={styles.nTemp}>{postemporada.seasons}T</Text>
            </View>
          )}
        </View>

        {/* ── Cifras, desplazables ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={e => setVisible(e.nativeEvent.layout.width)}
          onContentSizeChange={w => setContenido(w)}
          onScrollBeginDrag={() => setDesplazada(true)}
        >
          <View>
            <View style={[styles.filaCifras, { height: ALTO_CABECERA }, styles.celdaCab]}>
              {cols.map(c => (
                <Text
                  key={c.k}
                  style={[styles.cab, styles.num, { width: ancho(c) }]}
                  accessibilityLabel={c.t}
                >
                  {c.k}
                </Text>
              ))}
            </View>
            {temporadas.map((f, i) => (
              <View key={`${f.season_id}-${f.team_code}-${i}`} style={styles.filaCifras}>
                {cols.map(c => (
                  <Text
                    key={c.k}
                    style={[styles.cifra, c.fuerte && styles.fuerte, { width: ancho(c) }]}
                  >
                    {c.val(f)}
                  </Text>
                ))}
              </View>
            ))}
            {conSeparador && (
              <View style={styles.separador}>
                <Text style={[styles.separadorTexto, { paddingLeft: 8 }]} numberOfLines={1}>
                  {separador}
                </Text>
              </View>
            )}
            {historicas.map((f, i) => (
              <View key={`h${f.season_id}-${f.team_code}-${f.stage ?? ''}-${i}`} style={styles.filaCifras}>
                {cols.map(c => (
                  <Text
                    key={c.k}
                    style={[styles.cifra, c.fuerte && styles.fuerte, { width: ancho(c) }]}
                  >
                    {c.val(f)}
                  </Text>
                ))}
              </View>
            ))}
            {carrera && (
              <View style={[styles.filaCifras, styles.pie]}>
                {cols.map(c => (
                  <Text key={c.k} style={[styles.cifra, styles.fuerte, { width: ancho(c) }]}>
                    {c.val(carrera)}
                  </Text>
                ))}
              </View>
            )}
            {postemporada && (
              <View style={[styles.filaCifras, styles.pie2]}>
                {cols.map(c => (
                  <Text key={c.k} style={[styles.cifra, { width: ancho(c) }]}>
                    {c.val(postemporada)}
                  </Text>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {hayMas && (
        <Text style={styles.pista} accessibilityElementsHidden>
          Desliza la tabla para ver más ›
        </Text>
      )}
    </View>
  );
}

// Sin Bebas en la tabla, a propósito: sus cifras son de ancho variable, y en
// columnas alineadas a la derecha un 1 y un 8 no quedan uno sobre otro. La
// fuente del sistema sí trae tabulares.
const styles = StyleSheet.create({
  marco: {
    backgroundColor: COLORS.bgCard,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  cuerpo: { flexDirection: 'row' },
  fija: {
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  celdaCab: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: COLORS.bgHeader,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cab: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  fijaFila: {
    height: ALTO_FILA,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  presionada: { backgroundColor: COLORS.bgRaised },
  temporada: { color: COLORS.textSupport, fontSize: 14, fontVariant: ['tabular-nums'] },
  filaCifras: {
    height: ALTO_FILA,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  num: { textAlign: 'right' },
  cifra: {
    color: COLORS.textSupport,
    fontSize: 14,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  fuerte: { color: COLORS.textPrimary, fontWeight: '700' },
  // El pie de carrera se distingue por la raya doble y el fondo, no solo por
  // la etiqueta: no es una temporada más y tiene que leerse así sin leerla.
  pie: {
    backgroundColor: COLORS.bgHeader,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
    borderBottomWidth: 0,
  },
  carrera: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  pie2: { backgroundColor: COLORS.bgHeader, borderTopWidth: 1, borderTopColor: COLORS.border, borderBottomWidth: 0 },
  post: { color: COLORS.textSupport, fontSize: 13, flexShrink: 1 },
  temporadaCaja: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  etapa: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.bgHeader,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  separador: {
    height: ALTO_SEPARADOR,
    justifyContent: 'center',
    backgroundColor: COLORS.bgHeader,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  separadorTexto: {
    paddingLeft: 16,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  nTemp: { color: COLORS.textSecondary, fontSize: 11, fontVariant: ['tabular-nums'] },
  pista: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textAlign: 'right',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
});
