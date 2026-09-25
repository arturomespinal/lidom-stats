import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { BebasNeue_400Regular, useFonts } from '@expo-google-fonts/bebas-neue';
import * as SplashScreen from 'expo-splash-screen';
import LiveScreen from './src/screens/LiveScreen';
import GameDetailScreen from './src/screens/GameDetailScreen';
import type { LiveStackParamList } from './src/navigation';
import StandingsScreen from './src/screens/StandingsScreen';
import BattingScreen from './src/screens/BattingScreen';
import PitchingScreen from './src/screens/PitchingScreen';
import { COLORS, FONTS } from './src/constants';

// La pantalla de arranque se queda hasta que Bebas Neue esté cargada. Sin
// esto, la primera pantalla aparece un instante con la fuente del sistema y
// luego "salta" a la buena.
SplashScreen.preventAutoHideAsync().catch(() => {
  // En algunos entornos (web, pruebas) no hay splash nativo que retener.
});

const Tab = createBottomTabNavigator();
const LiveStack = createNativeStackNavigator<LiveStackParamList>();

/**
 * La pestaña "En Vivo" es una PILA, no una pantalla suelta: tocar un juego
 * empuja el detalle encima, con el gesto de volver y el botón de atrás que el
 * usuario ya espera. Un Modal habría evitado la dependencia, pero también el
 * deslizar para volver, y en iOS eso se nota.
 *
 * `@react-navigation/native-stack` es JavaScript sobre `react-native-screens`,
 * que ya estaba: no añade un módulo nativo nuevo ni obliga a salir de Expo Go.
 */
function LiveTab() {
  return (
    <LiveStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.bgCard },
        headerTintColor: COLORS.textPrimary,
        headerTitleStyle: { fontWeight: '700', fontSize: 15 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.bgPage },
      }}
    >
      <LiveStack.Screen
        name="LiveList"
        component={LiveScreen}
        options={{ headerShown: false }}
      />
      <LiveStack.Screen
        name="GameDetail"
        component={GameDetailScreen}
        options={({ route }) => ({
          // Del parámetro y no de la respuesta: así el título está puesto antes
          // del primer fetch y la cabecera no parpadea.
          title: `${route.params.awayCode} vs ${route.params.homeCode}`,
          // Solo el chevron. Con el texto, iOS 26 dibuja una cápsula gris que
          // pesa más que el propio título del juego.
          headerBackButtonDisplayMode: 'minimal',
        })}
      />
    </LiveStack.Navigator>
  );
}

/**
 * El tema de navegación sale de COLORS, así que sigue a la paleta sola: pasó a
 * claro sin tocar nada más que este nombre, que decía "Dark".
 */
const TemaDeportiv = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.bgPage,
    card: COLORS.bgCard,
    text: COLORS.textPrimary,
    border: COLORS.border,
    primary: COLORS.accent,
    notification: COLORS.accent,
  },
};

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  'En Vivo':  { active: 'flash',          inactive: 'flash-outline' },
  Posiciones: { active: 'podium',         inactive: 'podium-outline' },
  Bateo:      { active: 'baseball',       inactive: 'baseball-outline' },
  Pitcheo:    { active: 'radio-button-on',inactive: 'radio-button-off' },
};

/** DEPORTIV en Bebas Neue con el punto verde: el mismo logotipo que la web. */
function Logotipo() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text
        style={{ fontFamily: FONTS.display, fontSize: 22, letterSpacing: 0.5, color: COLORS.textPrimary }}
        accessibilityRole="header"
      >
        DEPORTIV
      </Text>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.brand }} />
    </View>
  );
}

export default function App() {
  const [fuentesListas, errorFuentes] = useFonts({ BebasNeue_400Regular });

  useEffect(() => {
    // Si la fuente falla, la app arranca igual con la del sistema: un título
    // en Roboto es mejor que una pantalla de arranque que no se va nunca.
    if (fuentesListas || errorFuentes) SplashScreen.hideAsync().catch(() => {});
  }, [fuentesListas, errorFuentes]);

  if (!fuentesListas && !errorFuentes) return null;

  return (
    <NavigationContainer theme={TemaDeportiv}>
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: COLORS.bgCard },
          headerTintColor: COLORS.textPrimary,
          headerTitleStyle: { fontWeight: '700', fontSize: 16 },
          // Decía "⚾ LIDOM Stats": el nombre viejo, que la guía legal marca
          // como uso de marca ajena. El producto se llama Deportiv.
          headerTitle: () => <Logotipo />,
          tabBarStyle: {
            backgroundColor: COLORS.bgCard,
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.textSecondary,
          tabBarIcon: ({ color, size, focused }) => {
            const icons = TAB_ICONS[route.name];
            return (
              <Ionicons
                name={focused ? icons.active : icons.inactive}
                size={size}
                color={color}
              />
            );
          },
        })}
      >
        <Tab.Screen name="En Vivo"    component={LiveTab} />
        <Tab.Screen name="Posiciones" component={StandingsScreen} />
        <Tab.Screen name="Bateo"      component={BattingScreen} />
        <Tab.Screen name="Pitcheo"    component={PitchingScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
