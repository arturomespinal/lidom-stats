import { registerRootComponent } from 'expo';

import App from './App';

/**
 * Punto de entrada de la app.
 *
 * El orden de estos dos imports NO es cosmético. Importar `expo` primero
 * ejecuta `expo/src/Expo.fx`, que instala los polyfills del runtime —entre
 * ellos un `URL` conforme al estándar— ANTES de que se cargue `expo-asset`.
 *
 * Con `"main": "App.tsx"` ese archivo nunca corría: App.tsx importa
 * @expo/vector-icons, que arrastra expo-font y con él expo-asset, el cual
 * calcula `manifestBaseUrl` al importarse. Como el `URL` de React Native 0.86
 * define `protocol` solo con getter, la asignación de expo-asset reventaba con
 *
 *     TypeError: Cannot assign to property 'protocol' which has only a getter
 *
 * y la app moría antes de renderizar.
 */
registerRootComponent(App);
