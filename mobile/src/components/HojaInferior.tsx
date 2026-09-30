import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../constants';
import { useReducirMovimiento } from './Movimiento';

/**
 * Hoja que sube desde abajo (bottom sheet), el patrón que piden las reglas de
 * diseño móvil antes que un modal centrado: aparece donde está el pulgar, y
 * se cierra tocando fuera, arrastrándola hacia abajo o con el botón de atrás
 * de Android.
 *
 * Es un `Modal` transparente con dos capas animadas: el velo, que se funde,
 * y la hoja, que sube con un resorte sin rebote. Todo con `useNativeDriver`
 * (opacidad y traslación). Al cerrar, el Modal sigue montado hasta que la
 * hoja termina de bajar; si no, desaparecería de golpe.
 *
 * Sin librerías: `@gorhom/bottom-sheet` pide reanimated y gesture-handler,
 * dos módulos nativos por una sola hoja.
 *
 * El margen de abajo sale del contexto de safe-area y no de
 * `useSafeAreaInsets`, que lanza un error si no hay proveedor (el arnés de
 * pruebas en la web no lo tiene).
 */
export default function HojaInferior({
  visible,
  onClose,
  titulo,
  subtitulo,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  const reducir = useReducirMovimiento();
  const insets = useContext(SafeAreaInsetsContext);
  const { height } = useWindowDimensions();
  const [montada, setMontada] = useState(visible);
  // 0 = cerrada (abajo, fuera de la vista), 1 = abierta.
  const t = useRef(new Animated.Value(0)).current;
  const arrastre = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMontada(true);
      arrastre.setValue(0);
      if (reducir) {
        t.setValue(1);
        return;
      }
      Animated.spring(t, { toValue: 1, speed: 18, bounciness: 0, useNativeDriver: true }).start();
    } else if (montada) {
      if (reducir) {
        t.setValue(0);
        setMontada(false);
        return;
      }
      Animated.timing(t, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setMontada(false));
    }
    // `montada` queda fuera de las dependencias a propósito: solo manda el
    // cambio de `visible`.
  }, [visible, reducir]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Arrastrar la hoja hacia abajo desde la manija o el título. Más de 100 pt,
  // o un tirón rápido, la cierra; si no, vuelve a su sitio.
  const gesto = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => arrastre.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 1.2) onCloseRef.current();
        else Animated.spring(arrastre, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;
  if (!montada) return null;

  const subir = t.interpolate({ inputRange: [0, 1], outputRange: [height * 0.8, 0] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[styles.velo, { opacity: t }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar" />
      </Animated.View>
      <Animated.View
        style={[
          styles.hoja,
          { maxHeight: height * 0.75, paddingBottom: Math.max(insets?.bottom ?? 0, 16) },
          { transform: [{ translateY: Animated.add(subir, arrastre) }] },
        ]}
        accessibilityViewIsModal
      >
        <View {...gesto.panHandlers} style={styles.cabeza}>
          <View style={styles.manija} />
          <Text style={styles.titulo} accessibilityRole="header">
            {titulo}
          </Text>
          {!!subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
        </View>
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Navy y no negro: el velo tiñe la app con su propia tinta.
  velo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(9, 28, 58, 0.45)' },
  hoja: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#091C3A',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  cabeza: { alignItems: 'center', paddingTop: 8, paddingBottom: 12, paddingHorizontal: 24 },
  manija: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.border, marginBottom: 16 },
  titulo: { fontFamily: FONTS.display, fontSize: 28, lineHeight: 30, color: COLORS.textPrimary },
  subtitulo: { marginTop: 2, fontSize: 13, color: COLORS.textSecondary },
});
