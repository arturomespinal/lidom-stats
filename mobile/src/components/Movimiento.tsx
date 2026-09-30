import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

/**
 * Las micro-animaciones de la app, en un solo sitio.
 *
 * Son tres y ninguna decora: cada una confirma algo.
 * - `Tocable`: la tarjeta se hunde un poco bajo el dedo. Dice "te oí" antes de
 *   que la pantalla siguiente termine de cargar.
 * - `Aparecer`: el contenido de una pestaña entra con un fundido corto. Sin
 *   él, el cambio es un salto seco y cuesta ver que algo cambió.
 * - El subrayado de las pestañas se desliza de una a otra (en Pestanas.tsx):
 *   el ojo sigue la raya en vez de buscarla.
 *
 * ── Quien pidió menos movimiento, no lo ve ──────────────────────────────────
 * iOS y Android tienen "reducir movimiento". Con eso activo las tres se
 * apagan: la tarjeta cambia de fondo como antes, el contenido aparece de una
 * vez y la raya salta. Se escucha el cambio del ajuste, no solo el valor al
 * abrir: alguien puede activarlo con la app abierta.
 *
 * Todo corre con `useNativeDriver` —escala y opacidad lo admiten—, así que la
 * animación va en el hilo nativo y no compite con el sondeo ni con el scroll.
 */

/* El último valor conocido del ajuste, compartido por todos. La consulta al
   sistema es asíncrona: sin esto, cada componente nuevo arrancaría creyendo
   que el ajuste está apagado y animaría su primer cuadro. */
let ultimoConocido = false;

/** true si el teléfono tiene activado "reducir movimiento". */
export function useReducirMovimiento(): boolean {
  const [reducir, setReducir] = useState(ultimoConocido);
  useEffect(() => {
    let vivo = true;
    const poner = (v: boolean) => {
      ultimoConocido = v;
      if (vivo) setReducir(v);
    };
    AccessibilityInfo.isReduceMotionEnabled().then(poner).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', poner);
    return () => {
      vivo = false;
      sub.remove();
    };
  }, []);
  return reducir;
}

/** Cuánto se hunde. Menos no se nota bajo el dedo; más parece un rebote. */
const HUNDIDO = 0.97;

/**
 * Un Pressable que se hunde al tocarlo.
 *
 * La escala va en una vista EXTERNA y el Pressable dentro conserva su estilo
 * tal cual, función `({ pressed })` incluida: así el fondo de "presionado"
 * que ya tenía cada tarjeta sigue funcionando, y la escala se suma encima. La
 * vista externa es un bloque sin estilo; si la tarjeta vive en una fila y
 * tenía `flex: 1`, ese estilo va en `contenedor`.
 */
export function Tocable({
  contenedor,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps & { contenedor?: StyleProp<ViewStyle> }) {
  const reducir = useReducirMovimiento();
  const escala = useRef(new Animated.Value(1)).current;

  const ir = (a: number) =>
    Animated.spring(escala, {
      toValue: a,
      // Rígido y sin rebote: un botón que tiembla al soltarlo se siente roto.
      speed: 40,
      bounciness: 0,
      useNativeDriver: true,
    }).start();

  return (
    <Animated.View style={[contenedor, { transform: [{ scale: escala }] }]}>
      <Pressable
        {...props}
        onPressIn={e => {
          if (!reducir && !props.disabled) ir(HUNDIDO);
          onPressIn?.(e);
        }}
        onPressOut={e => {
          if (!reducir) ir(1);
          onPressOut?.(e);
        }}
      />
    </Animated.View>
  );
}

/**
 * Hace entrar a sus hijos con un fundido y un desplazamiento de 6 pt hacia
 * arriba. Para que se repita al cambiar de pestaña, quien lo usa le pone
 * `key={pestaña}`: una key nueva es un componente nuevo, y la animación
 * vuelve a empezar.
 */
export function Aparecer({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reducir = useReducirMovimiento();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducir) {
      t.setValue(1);
      return;
    }
    const a = Animated.timing(t, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [reducir, t]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
