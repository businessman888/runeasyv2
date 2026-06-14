import { Dimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { BREAKPOINTS } from '../hooks/useBreakpoint';

/**
 * Lock de orientação POR DEVICE.
 *
 * - Phone (largura < 600dp): travado em PORTRAIT_UP — comportamento idêntico ao
 *   atual, o app de celular nunca rotaciona.
 * - Tablet / iPad (>= 600dp): liberado (portrait + landscape), habilitando os
 *   layouts adaptativos (side rail, master-detail, grids multi-coluna).
 *
 * A classificação usa a largura INICIAL da janela (Dimensions.get) — o form
 * factor de um device não muda em runtime, então decidir uma vez basta.
 * Idempotente e à prova de falha (catch silencioso em emuladores que não
 * suportam a API).
 */
export async function applyDeviceOrientationLock(): Promise<void> {
  try {
    const { width, height } = Dimensions.get('window');
    // Usa o maior lado: no boot a janela pode vir já rotacionada num tablet,
    // e o que define "é tablet" é a menor dimensão (largura em portrait).
    const shortestSide = Math.min(width, height);
    const isPhone = shortestSide < BREAKPOINTS.tablet;

    if (isPhone) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      await ScreenOrientation.unlockAsync();
    }
  } catch {
    /* silencioso — alguns emuladores/devices não suportam a API */
  }
}
