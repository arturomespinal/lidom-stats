import Constants from 'expo-constants';

/**
 * A dónde llama la app.
 *
 * ── La IP de la PC se saca sola ──────────────────────────────────────────
 * Con Expo Go el teléfono ya descarga el código desde la PC (Metro, puerto
 * 8081), así que Expo conoce su IP en la red: `hostUri` vale algo como
 * "10.0.0.250:8081". La API corre en esa misma máquina, en el 8000. Antes la
 * IP iba escrita a mano y cada vez que el router le daba otra a la PC la app
 * dejaba de conectar sin decir por qué (pasó el 29-sep: 10.0.0.127 → .250).
 *
 * Orden de preferencia:
 * 1. `EXPO_PUBLIC_API_URL`, si se define — para apuntar a otra máquina o a un
 *    servidor desplegado.
 * 2. La IP de la PC que sirve el código, si es una IP de verdad. En modo
 *    túnel `hostUri` es un dominio de ngrok, y la API no está ahí.
 * 3. `RESPALDO`: la última IP conocida.
 */
const RESPALDO = 'http://10.0.0.250:8000';
const PUERTO_API = 8000;

function ipDeLaPc(): string | null {
  const host = Constants.expoConfig?.hostUri ?? null; // "10.0.0.250:8081"
  const ip = host?.split(':')[0] ?? '';
  const esIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip === 'localhost';
  return esIp ? ip : null;
}

const ip = ipDeLaPc();

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? (ip ? `http://${ip}:${PUERTO_API}` : RESPALDO);

export const DEFAULT_SEASON = '2025';
