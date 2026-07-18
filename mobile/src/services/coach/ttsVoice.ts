/**
 * Verificação de voz pt-BR para o TTS.
 *
 * iOS: vozes pt-BR são universais → sempre 'ok', sem fricção.
 * Android: o motor existe, mas os dados de voz de pt-BR podem não estar instalados.
 * `getAvailableVoicesAsync()` pode retornar vazio em alguns Androids → tratamos
 * lista vazia como 'unknown' ("não sei"), NÃO como 'missing' ("não tem").
 *
 * Verificar no momento que importa (habilitar a feature / pré-corrida), NUNCA no
 * onboarding. Silencioso quando está tudo ok.
 */

import * as Speech from 'expo-speech';
import { Platform, Linking } from 'react-native';

export type VoiceStatus = 'ok' | 'missing' | 'unknown';

export async function checkPtBrVoice(): Promise<VoiceStatus> {
  if (Platform.OS === 'ios') return 'ok';
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (!voices || voices.length === 0) return 'unknown';
    const has = voices.some((v) => {
      const lang = (v.language || '').toLowerCase().replace('_', '-');
      return lang.startsWith('pt-br');
    });
    return has ? 'ok' : 'missing';
  } catch {
    return 'unknown';
  }
}

/**
 * Abre as configurações de TTS do Android (o caminho exato varia por fabricante,
 * então é orientação genérica — não dá para instalar a voz pela pessoa). Cai para
 * as configs gerais do app se o intent específico falhar.
 */
export async function openAndroidTtsSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.sendIntent('com.android.settings.TTS_SETTINGS');
  } catch {
    try {
      await Linking.openSettings();
    } catch (e) {
      console.warn('[coach] Não foi possível abrir as configs de TTS:', e);
    }
  }
}
