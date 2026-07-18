/**
 * Sessão de áudio do coach (ducking). `expo-speech` NÃO configura a sessão sozinho
 * — quem decide se a fala abaixa a música, toca no silencioso e sobrevive à tela
 * apagada é a sessão configurada via `expo-audio` (SDK 54).
 *
 * duckOthers = abaixa a música do usuário durante a fala e devolve depois (padrão
 * de app de navegação). playsInSilentMode = fura o silencioso do iOS (decisão de
 * produto: coaching por voz é importante). shouldPlayInBackground = tela apagada.
 */

import { setAudioModeAsync } from 'expo-audio';

let configured = false;

/** Configura a sessão para ducking. Idempotente; chamar no start da corrida e
 *  reassertar antes da 1ª fala (barato). Nunca lança — degrada silencioso. */
export async function ensureCoachAudioSession(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    });
    configured = true;
  } catch (e) {
    // Não bloqueia a fala nem a corrida; só perde o ducking/silent-mode.
    console.warn('[coach] Falha ao configurar sessão de áudio:', e);
  }
}

export function isCoachAudioSessionConfigured(): boolean {
  return configured;
}
