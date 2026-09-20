import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, TEAM_STYLES } from '../constants';

interface Props {
  code: string;
  size?: number;
  /** `solid` para cabeceras y héroes; `outline` para filas de lista. */
  variant?: 'solid' | 'outline';
}

/**
 * La marca del equipo: el código de tres letras en una teja.
 *
 * ── Por qué ya no son los escudos ─────────────────────────────────────────
 * Los escudos oficiales acumulan tres regímenes a la vez: marca figurativa
 * (Ley 20-00), derecho de autor sobre el dibujo (Ley 65-00) y competencia
 * desleal. Y LIDOM tiene una campaña de protección de marca declarada por
 * decisión unánime de su Junta desde octubre de 2022.
 *
 * Los NOMBRES sí tienen defensa —el art. 87 permite usar una marca ajena de
 * buena fe para informar, y no se puede informar sobre un juego de las
 * Águilas sin nombrar a las Águilas—. El escudo no la tiene: se puede
 * informar sin reproducirlo.
 *
 * Beneficio que no es legal: con escudos, la identidad visual de la app ERA
 * la identidad de los clubes. Ahora es de Deportiv.
 *
 * ── Dos pesos, no dos componentes ─────────────────────────────────────────
 * `solid` grita y sirve para cabeceras; `outline` susurra y es lo que va en
 * una lista de veinte filas — veinte tejas sólidas serían un arcoíris.
 *
 * La esquina inferior derecha lleva más radio que las otras tres. Es el eco
 * del corte diagonal de la maqueta: React Native no tiene `clip-path`, y
 * montar un cuadrado rotado encima para recortar una esquina es mucho aparato
 * para un detalle de 32 px. El radio asimétrico da la misma lectura.
 */
export default function TeamBadge({ code, size = 32, variant = 'outline' }: Props) {
  // Respaldo para un código fuera del catálogo: gris de la paleta, nunca un
  // color inventado que parezca de equipo.
  const style = TEAM_STYLES[code] ?? {
    primary: COLORS.textSecondary,
    tint: `${COLORS.textSecondary}26`,
    text: COLORS.textSecondary,
  };

  const radio = Math.round(size * 0.22);
  const solido = variant === 'solid';

  return (
    <View
      style={[
        styles.teja,
        {
          width: size,
          height: size,
          borderRadius: radio,
          borderBottomRightRadius: Math.round(size * 0.42),
          backgroundColor: solido ? style.primary : style.tint,
          borderColor: solido ? style.primary : style.primary,
          borderWidth: solido ? 0 : 1.5,
        },
      ]}
      accessibilityLabel={code}
    >
      <Text
        style={[
          styles.texto,
          {
            color: solido ? COLORS.accentOn : style.text,
            fontSize: Math.round(size * 0.36),
          },
        ]}
      >
        {code}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  teja: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  texto: {
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
