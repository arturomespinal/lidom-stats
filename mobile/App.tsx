import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import StandingsScreen from './src/screens/StandingsScreen';
import BattingScreen from './src/screens/BattingScreen';
import PitchingScreen from './src/screens/PitchingScreen';
import { COLORS } from './src/constants';

const Tab = createBottomTabNavigator();

const DarkTheme = {
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
  Posiciones: { active: 'podium',         inactive: 'podium-outline' },
  Bateo:      { active: 'baseball',       inactive: 'baseball-outline' },
  Pitcheo:    { active: 'radio-button-on',inactive: 'radio-button-off' },
};

export default function App() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: COLORS.bgCard },
          headerTintColor: COLORS.textPrimary,
          headerTitleStyle: { fontWeight: '700', fontSize: 16 },
          headerTitle: '⚾  LIDOM Stats',
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
        <Tab.Screen name="Posiciones" component={StandingsScreen} />
        <Tab.Screen name="Bateo"      component={BattingScreen} />
        <Tab.Screen name="Pitcheo"    component={PitchingScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
