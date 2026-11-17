import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer, type NavigationState } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import HoyScreen from './src/screens/HoyScreen';
import LiveScreen from './src/screens/LiveScreen';
import GameDetailScreen from './src/screens/GameDetailScreen';
import JuegoScreen from './src/screens/JuegoScreen';
import CalendarioScreen from './src/screens/CalendarioScreen';
import type { LiveStackParamList, PilaParamList } from './src/navigation';
import StandingsScreen from './src/screens/StandingsScreen';
import BattingScreen from './src/screens/BattingScreen';
import PitchingScreen from './src/screens/PitchingScreen';
import SearchScreen from './src/screens/SearchScreen';
import TeamScreen from './src/screens/TeamScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import HistoricoScreen from './src/screens/HistoricoScreen';
import RecordsScreen from './src/screens/RecordsScreen';
import BotonTema from './src/components/BotonTema';
import { COLORS, FONTS, TEAM_SHORT_NAMES } from './src/constants';
import { cargarTema, estiloBarra, tematico, temaActual, useTema } from './src/tema';

// La pantalla de arranque se queda hasta que Barlow Condensed esté cargada. Sin
// esto, la primera pantalla aparece un instante con la fuente del sistema y
// luego "salta" a la buena.
SplashScreen.preventAutoHideAsync().catch(() => {
  // En algunos entornos (web, pruebas) no hay splash nativo que retener.
});

const Tab = createBottomTabNavigator();
const LiveStack = createNativeStackNavigator<LiveStackParamList>();
const Pila = createNativeStackNavigator<PilaParamList>();

/**
 * Cabecera común a todas las pilas. Estas opciones y el tema de navegación
 * van en `tematico()` (src/tema.ts): un objeto por modo.
 */
const OPCIONES_PILA = tematico(() => ({
  headerStyle: { backgroundColor: COLORS.bgCard },
  headerTintColor: COLORS.textPrimary,
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 15 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: COLORS.bgPage },
  // Solo el chevron. Con el texto, iOS 26 dibuja una cápsula gris que pesa
  // más que el propio título.
  headerBackButtonDisplayMode: 'minimal' as const,
}));

/**
 * Las fichas abren con la cabecera oscura (components/Heroe.tsx), así que la
 * barra de navegación se pinta del mismo tono (COLORS.ink) y sin título: la flecha blanca
 * queda sobre la franja y el nombre grande de la ficha hace de título. El
 * `title` se sigue poniendo —lo usa el lector de pantalla—; solo no se dibuja.
 */
const OPCIONES_FICHA = tematico(() => ({
  headerStyle: { backgroundColor: COLORS.ink },
  headerTintColor: COLORS.inkFg,
  headerTitle: () => null,
}));

/**
 * El detalle de juego también abre con la franja oscura, pero conserva el
 * título ("AGU vs LIC") en blanco: el marcador se va al desplazar, y el
 * título es lo único que queda diciendo qué juego es.
 */
const OPCIONES_JUEGO = tematico(() => ({
  headerStyle: { backgroundColor: COLORS.ink },
  headerTintColor: COLORS.inkFg,
}));

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
function HoyTab() {
  return (
    <LiveStack.Navigator screenOptions={OPCIONES_PILA}>
      <LiveStack.Screen
        // "Portada" y no "Hoy": la pestaña ya se llama Hoy, y una pantalla con
        // el mismo nombre dentro de ella hace que la navegación avise ("screens
        // with the same name nested inside one another").
        name="Portada"
        component={HoyScreen}
        options={OPCIONES_RAIZ}
      />
      <LiveStack.Screen name="LiveList" component={LiveScreen} options={{ title: 'En vivo' }} />
      <LiveStack.Screen name="Calendario" component={CalendarioScreen} options={{ title: 'Calendario' }} />
      <LiveStack.Screen
        name="GameDetail"
        component={GameDetailScreen}
        options={({ route }) => ({
          ...OPCIONES_JUEGO,
          // Del parámetro y no de la respuesta: así el título está puesto antes
          // del primer fetch y la cabecera no parpadea.
          title: `${route.params.awayCode} vs ${route.params.homeCode}`,
        })}
      />
      <LiveStack.Screen
        name="Juego"
        component={JuegoScreen}
        options={({ route }) => ({ title: `${route.params.awayCode} vs ${route.params.homeCode}` })}
      />
      <LiveStack.Screen
        name="Equipo"
        component={TeamScreen}
        options={({ route }) => ({ ...OPCIONES_FICHA, title: TEAM_SHORT_NAMES[route.params.code] ?? route.params.code })}
      />
      <LiveStack.Screen
        name="Jugador"
        component={PlayerScreen}
        options={({ route }) => ({ ...OPCIONES_FICHA, title: route.params.nombre ?? 'Jugador' })}
      />
      <LiveStack.Screen
        name="Historico"
        component={HistoricoScreen}
        options={({ route }) => ({ ...OPCIONES_FICHA, title: route.params.nombre ?? 'Jugador histórico' })}
      />
      <LiveStack.Screen name="Records" component={RecordsScreen} options={{ title: 'Récords' }} />
    </LiveStack.Navigator>
  );
}

/**
 * Las otras cuatro pestañas: una raíz y las fichas encima. Se fabrican con la
 * misma función para que no haya cuatro copias de la misma pila que un día
 * dejen de coincidir.
 */
/**
 * La raíz de cada pestaña: el logotipo y, a la derecha, el botón de modo
 * claro u oscuro (components/BotonTema.tsx), como en la barra de la web.
 */
const OPCIONES_RAIZ = {
  headerTitle: () => <Logotipo />,
  headerRight: () => <BotonTema />,
};

function crearPila(Raiz: React.ComponentType) {
  return function PilaConFichas() {
    return (
      <Pila.Navigator screenOptions={OPCIONES_PILA}>
        <Pila.Screen name="Raiz" component={Raiz} options={OPCIONES_RAIZ} />
        <Pila.Screen
          name="Juego"
          component={JuegoScreen}
          options={({ route }) => ({ title: `${route.params.awayCode} vs ${route.params.homeCode}` })}
        />
        <Pila.Screen
          name="Equipo"
          component={TeamScreen}
          options={({ route }) => ({ ...OPCIONES_FICHA, title: TEAM_SHORT_NAMES[route.params.code] ?? route.params.code })}
        />
        <Pila.Screen
          name="Jugador"
          component={PlayerScreen}
          options={({ route }) => ({ ...OPCIONES_FICHA, title: route.params.nombre ?? 'Jugador' })}
        />
        <Pila.Screen
          name="Historico"
          component={HistoricoScreen}
          options={({ route }) => ({ ...OPCIONES_FICHA, title: route.params.nombre ?? 'Jugador histórico' })}
        />
        <Pila.Screen name="Records" component={RecordsScreen} options={{ title: 'Récords' }} />
      </Pila.Navigator>
    );
  };
}

const PosicionesTab = crearPila(StandingsScreen);
const BateoTab = crearPila(BattingScreen);
const PitcheoTab = crearPila(PitchingScreen);
const BuscarTab = crearPila(SearchScreen);

/**
 * El tema de navegación sale de COLORS, así que sigue a la paleta sola. Parte
 * de `DarkTheme` en el modo oscuro y de `DefaultTheme` en el claro: eso le
 * dice a la navegación (y por ella al sistema) de qué lado van las barras y
 * los menús nativos.
 */
const TemaDeportiv = tematico(() => {
  const base = temaActual() === 'claro' ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: COLORS.bgPage,
      card: COLORS.bgCard,
      text: COLORS.textPrimary,
      border: COLORS.border,
      primary: COLORS.accent,
      notification: COLORS.accent,
    },
  };
});

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Hoy:        { active: 'today',          inactive: 'today-outline' },
  Posiciones: { active: 'podium',         inactive: 'podium-outline' },
  Bateo:      { active: 'baseball',       inactive: 'baseball-outline' },
  Pitcheo:    { active: 'radio-button-on',inactive: 'radio-button-off' },
  Buscar:     { active: 'search',         inactive: 'search-outline' },
};

/** DEPORTIV en Barlow Condensed con el punto verde: el mismo logotipo que la web. */
function Logotipo() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text
        style={{ fontFamily: FONTS.display, textTransform: 'uppercase', fontSize: 24, letterSpacing: 1.4, color: COLORS.textPrimary }}
        accessibilityRole="header"
      >
        DEPORTIV
      </Text>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.brand }} />
    </View>
  );
}

export default function App() {
  // Solo los dos pesos que usa la app, pedidos por archivo. Importarlos del
  // índice del paquete metería en la app los 18 pesos de la familia (~1.8 MB):
  // el índice hace un require de cada uno. Los nombres son las familias de
  // FONTS en constants.ts.
  const [fuentesListas, errorFuentes] = useFonts({
    BarlowCondensed_600SemiBold: require('@expo-google-fonts/barlow-condensed/600SemiBold/BarlowCondensed_600SemiBold.ttf'),
    BarlowCondensed_700Bold: require('@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'),
  });

  // El modo guardado (src/tema.ts) se lee antes de pintar nada: así quien
  // eligió el claro no ve un instante la app en oscuro.
  const [temaListo, setTemaListo] = useState(false);
  useEffect(() => {
    cargarTema().finally(() => setTemaListo(true));
  }, []);
  const tema = useTema();

  // Al cambiar de modo el árbol se vuelve a montar (`key={tema}`) para que
  // cada pantalla lea los estilos del modo nuevo. La navegación no se pierde:
  // el estado se guarda en cada cambio y el árbol nuevo arranca desde él, en
  // la misma pestaña y la misma ficha.
  const estadoNavegacion = useRef<NavigationState | undefined>(undefined);

  const fuentesResueltas = fuentesListas || !!errorFuentes;
  useEffect(() => {
    // Si la fuente falla, la app arranca igual con la del sistema: un título
    // en Roboto es mejor que una pantalla de arranque que no se va nunca.
    if (fuentesResueltas && temaListo) SplashScreen.hideAsync().catch(() => {});
  }, [fuentesResueltas, temaListo]);

  if (!fuentesResueltas || !temaListo) return null;

  return (
    <NavigationContainer
      key={tema}
      theme={TemaDeportiv}
      initialState={estadoNavegacion.current}
      onStateChange={(estado) => {
        estadoNavegacion.current = estado;
      }}
    >
      <StatusBar style={estiloBarra()} />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          // La cabecera la pone cada pila (ver HoyTab). El logotipo va en la
          // raíz de cada una: antes decía "⚾ LIDOM Stats", el nombre viejo,
          // que la guía legal marca como uso de marca ajena.
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.bgPage,
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.textFaint,
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
        <Tab.Screen name="Hoy"        component={HoyTab} />
        <Tab.Screen name="Posiciones" component={PosicionesTab} />
        <Tab.Screen name="Bateo"      component={BateoTab} />
        <Tab.Screen name="Pitcheo"    component={PitcheoTab} />
        <Tab.Screen name="Buscar"     component={BuscarTab} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
