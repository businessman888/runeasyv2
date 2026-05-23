/**
 * App UUID do RunEasy no Connect IQ Store. Usado pelo Connect IQ Mobile SDK
 * para abrir comunicação com a instância do app no relógio.
 *
 * O mesmo UUID precisa ser usado pelo Expo config plugin (`withGarminConnectIQ`)
 * para registrar o URL scheme `gcm-ciq-{APP_UUID}` no Info.plist.
 */
export const GARMIN_APP_UUID = '8338c29a-1ddf-40d4-892c-b1a3038a1cf5';

/** Store UUID (mesmo que o App UUID enquanto não publicamos uma versão privada). */
export const GARMIN_STORE_UUID = GARMIN_APP_UUID;
