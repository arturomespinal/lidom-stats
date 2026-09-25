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
import type { LiveStackParamList, PilaParamList } from './src/navigation';
import StandingsScreen from './src/screens/StandingsScreen';
import BattingScreen from './src/screens/BattingScreen';
import PitchingScreen from './src/screens/PitchingScreen';
import SearchScreen from './src/screens/SearchScreen';
import TeamScreen from './src/screens/TeamScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import { COLORS, FONTS, TEAM_SHORT_NAMES } from './src/constants';

// La pantalla de arranque se queda hasta que Bebas Neue esté cargada. Sin
// esto, la primera pantalla aparece un instante con la fuente del sistema y
// luego "salta" a la buena.
SplashScreen.preventAutoHideAsync().catch(() => {
  // En algunos entornos (web, pruebas) no hay splash nativo que retener.
});

const Tab = createBottomTabNavigator();
const LiveStack = createNativeStackNavigator<LiveStackParamList>();
const Pila = createNativeStackNavigator<PilaParamList>();

/** Cabecera común a todas las pilas. */
const OPCIONES_PILA = {
  headerStyle: { backgroundColor: COLORS.bgCard },
  headerTintColor: COLORS.textPrimary,
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 15 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: COLORS.bgPage },
  // Solo el chevron. Con el texto, iOS 26 dibuja una cápsula gris que pesa
  // más que el propio título.
  headerBackButtonDisplayMode: 'minimal' as const,
};

/**
 * Cada pestaña es una PILA, no una pantalla suelta.
 *
 * Antes solo "En Vivo" lo era; ahora las cinco, porque las fichas de equipo y
 * de jugador se abren desde cualquiera: posiciones → equipo → jugador →
 * equipo de 2016… El gesto de volver deshace ese camino paso a paso, dentro
 * de la misma pestaña.
 *
 * ── Una sola cabecera ────────────────────────────────────────────────────
 * Las pestañas ya no dibujan cabecera propia (`headerShown: false` en el
 * Tab.Navigator): la pone la pila. Con las dos, una ficha abría con el
 * logotipo arriba y el nombre del jugador debajo — 100 pt de pantalla para
 * dos títulos. Ahora la raíz de cada pila lleva el logotipo y lo que se apila
 * encima lleva su título y la flecha de volver.
 *
 * `@react-navigation/native-stack` es JavaScript sobre `react-native-screens`,
 * que ya estaba: no añade un módulo nativo ni obliga a salir de Expo Go.
 */
function LiveTab() {
  return (
    <LiveStack.Navigator screenOptions={OPCIONES_PILA}>
      <LiveStack.Screen
        name="LiveList"
        component={LiveScreen}
        options={{ headerTitle: () => <Logotipo /> }}
      />
      <LiveStack.Screen
        name="GameDetail"
        component={GameDetailScreen}
        options={({ route }) => ({
          // Del parámetro y no de la respuesta: así el título está puesto antes
          // del primer fetch y la cabecera no parpadea.
          title: `${route.params.awayCode} vs ${route.params.homeCode}`,
        })}
      />
      <LiveStack.Screen
        name="Equipo"
        component={TeamScreen}
        options={({ route }) => ({ title: TEAM_SHORT_NAMES[route.params.code] ?? route.params.code })}
      />
      <LiveStack.Screen
        name="Jugador"
        component={PlayerScreen}
        options={({ route }) => ({ title: route.params.nombre ?? 'Jugador' })}
      />
    </LiveStack.Navigator>
  );
}

/**
 * Las otras cuatro pestañas: una raíz y las fichas encima. Se fabrican con la
 * misma función para que no haya cuatro copias de la misma pila que un día
 * dejen de coincidir.
 */
function crearPila(Raiz: React.ComponentType) {
  return function PilaConFichas() {
    return (
      <Pila.Navigator screenOptions={OPCIONES_PILA}>
        <Pila.Screen name="Raiz" component={Raiz} options={{ headerTitle: () => <Logotipo /> }} />
        <Pila.Screen
          name="Equipo"
          component={TeamScreen}
          options={({ route }) => ({ title: TEAM_SHORT_NAMES[route.params.code] ?? route.params.code })}
        />
        <Pila.Screen
          name="Jugador"
          component={PlayerScreen}
          options={({ route }) => ({ title: route.params.nombre ?? 'Jugador' })}
        />
      </Pila.Navigator>
    );
  };
}

const PosicionesTab = crearPila(StandingsScreen);
const BateoTab = crearPila(BattingScreen);
const PitcheoTab = crearPila(PitchingScreen);
const BuscarTab = crearPila(SearchScreen);

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
  Buscar:     { active: 'search',         inactive: 'search-outline' },
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
          // La cabecera la pone cada pila (ver LiveTab). El logotipo va en la
          // raíz de cada una: antes decía "⚾ LIDOM Stats", el nombre viejo,
          // que la guía legal marca como uso de marca ajena.
          headerShown: false,
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
        <Tab.Screen name="Posiciones" component={PosicionesTab} />
        <Tab.Screen name="Bateo"      component={BateoTab} />
        <Tab.Screen name="Pitcheo"    component={PitcheoTab} />
        <Tab.Screen name="Buscar"     component={BuscarTab} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
