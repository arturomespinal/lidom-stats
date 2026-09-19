import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ALPHA, COLORS, TEAM_STYLES } from '../constants';
import { crestUrl } from '../api';

/**
 * El distintivo del equipo: escudo si lo hay, siglas si no.
 *
 * El escudo se pide por URL al backend (`/static/crests/AGU.png`) en vez de
 * empaquetarse con `require()`. Dos razones:
 *
 *   - `require()` de un archivo que no existe revienta el empaquetado de
 *     Metro. Con URL, un escudo que falta simplemente no carga.
 *   - Cambiar un escudo no obliga a publicar una versión nueva de la app.
 *
 * `onError` es lo que hace que esto funcione con la carpeta vacía: si la
 * imagen da 404 se marca el fallo y se pintan las siglas, que es exactamente
 * lo que la app mostraba antes.
 */
export default function TeamBadge({ code, size = 32 }: { code: string; size?: number }) {
  const [sinEscudo, setSinEscudo] = useState(false);

  // Respaldo para un código fuera del catálogo: gris de la paleta, nunca un
  // color inventado que parezca de equipo.
  const style = TEAM_STYLES[code] ?? {
    primary: COLORS.textSecondary,
    bg: ALPHA.neutral15,
    text: COLORS.textSecondary,
  };

  const conocido = !!TEAM_STYLES[code];
  const muestraEscudo = conocido && !sinEscudo;

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: 6,
          // Con escudo el recuadro se aparta: el color ya lo pone el propio
          // escudo, y un borde de color alrededor lo ensucia.
          backgroundColor: muestraEscudo ? 'transparent' : style.bg,
          borderColor: muestraEscudo ? 'transparent' : `${style.primary}60`,
        },
      ]}
    >
      {muestraEscudo ? (
        <Image
          source={{ uri: crestUrl(code) }}
          style={{ width: size, height: size }}
          resizeMode="contain"
          onError={() => setSinEscudo(true)}
          accessibilityLabel={code}
        />
      ) : (
        <Text style={[styles.text, { color: style.text, fontSize: size * 0.34 }]}>
          {code}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
