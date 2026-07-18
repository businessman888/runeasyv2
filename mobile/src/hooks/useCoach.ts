/**
 * Leitura foreground do estado do coach para a UI (sino/balão). O orquestrador
 * (que roda inclusive no background/locationTask) escreve o último aviso e o flag
 * de "não lido" no MMKV; aqui o foreground apenas LÊ para renderizar. Pull, não push.
 */

import { useState, useEffect, useCallback } from 'react';
import { trackingStorage } from '../tasks/locationTask';
import { useCoachStore } from '../stores/coachStore';
import { COACH_MMKV } from '../services/coach/coachConfig';

interface UseCoachReturn {
  /** Preferência (liga/desliga) — a fonte de verdade da vontade. */
  enabled: boolean;
  /** displayText do último aviso falado (ou null). */
  lastMessage: string | null;
  /** Há aviso novo ainda não aberto no sino? */
  unread: boolean;
  /** Marca como lido (ao abrir o balão). */
  markRead: () => void;
}

/**
 * @param active só faz polling enquanto a tela de corrida está montada/ativa.
 */
export function useCoach(active: boolean): UseCoachReturn {
  const enabled = useCoachStore((s) => s.enabled);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    if (!active) return;
    const read = () => {
      setLastMessage(trackingStorage.getString(COACH_MMKV.lastMessage) ?? null);
      setUnread(trackingStorage.getBoolean(COACH_MMKV.unread) ?? false);
    };
    read();
    // 1s basta: avisos chegam ~1/km, e a leitura MMKV é barata.
    const t = setInterval(read, 1000);
    return () => clearInterval(t);
  }, [active]);

  const markRead = useCallback(() => {
    trackingStorage.set(COACH_MMKV.unread, false);
    setUnread(false);
  }, []);

  return { enabled, lastMessage, unread, markRead };
}
