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

type Temporada = { season_id: string; team_code: string };

const ALTO_FILA = 44;
const ALTO_CABECERA = 32;
const ANCHO_FIJA = 104;
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
}: {
  temporadas: (T & Temporada)[];
  carrera: (T & { seasons: number }) | null;
  cols: Col<T>[];
  onEquipo: (code: string, season: string) => void;
}) {
  const [visible, setVisible] = useState(0);
  const [contenido, setContenido] = useState(0);
  const [desplazada, setDesplazada] = useState(false);

  const ancho = (c: Col<T>) => c.ancho ?? (c.fuerte ? ANCHO_TASA : ANCHO_COL);
  // La pista "Desliza" solo aparece si de verdad hay algo escondido, y se va
  // en cuanto el usuario la usa: una instrucción que ya se cumplió es ruido.
  const hayMas = contenido > visible + 1 && !desplazada;

  return (
    <View style={styles.marco}>
      <View style={styles.cuerpo}>
        {/* ── Columna fija ── */}
        <View style={styles.fija}>
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
          {carrera && (
            <View style={[styles.fijaFila, styles.pie]}>
              <Text style={styles.carrera}>Carrera</Text>
              <Text style={styles.nTemp}>{carrera.seasons}T</Text>
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
            {carrera && (
              <View style={[styles.filaCifras, styles.pie]}>
                {cols.map(c => (
                  <Text key={c.k} style={[styles.cifra, styles.fuerte, { width: ancho(c) }]}>
                    {c.val(carrera)}
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
    width: ANCHO_FIJA,
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
  carrera: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
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
