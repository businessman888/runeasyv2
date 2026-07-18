/**
 * Coach de áudio — constantes, tipos e chaves de MMKV compartilhadas.
 *
 * Tudo aqui é ajustável (vamos calibrar em campo). O orquestrador (foreground E
 * background/locationTask) lê o "contexto do coach" do MMKV de forma síncrona,
 * porque o contexto headless não consegue ler SecureStore/Zustand sincronamente.
 */

export type CoachMessageType = 'split' | 'pace' | 'structure' | 'motivational';

export interface CoachMessage {
  id: string;
  type: CoachMessageType;
  /** Maior = ganha quando duas colidem. */
  priority: number;
  /** Efêmera → pode ser DESCARTADA (não atrasada) quando envelhece. */
  ephemeral: boolean;
  /** Validade (ms) desde createdAt. Expirou → descarta. */
  ttlMs: number;
  createdAt: number;
  /** Texto para o TTS (formatado para soar natural — separado do visual). */
  spokenText: string;
  /** Texto para a tela (balão/sino). */
  displayText: string;
  /** Metadado opcional (ex.: número do km do split). */
  meta?: Record<string, number | string>;
}

/** Prioridades por tipo. Estrutura de intervalado é inadiável (Fase 4). */
export const COACH_PRIORITY: Record<CoachMessageType, number> = {
  structure: 100,
  pace: 50,
  split: 40,
  motivational: 10,
};

/** Orçamento de fala — ajustável em campo. */
export const COACH_BUDGET = {
  /** Intervalo mínimo entre falas. */
  MIN_GAP_MS: 3000,
  /** Teto de avisos por km (o coach não pode sufocar). */
  MAX_PER_KM: 3,
  /** TTL de um split falado: se atrasar mais que isso, vira mentira → descarta. */
  SPLIT_TTL_MS: 8000,
};

/**
 * Chaves no MMKV `trackingStorage` (mesma instância da locationTask). Algumas já
 * existem (paused/finished); as `coach_*` são novas.
 */
export const COACH_MMKV = {
  enabled: 'coach_enabled', // preferência (espelhada do coachStore)
  isPro: 'coach_is_pro', // snapshot de entitlement no início da corrida (Fase 4)
  mode: 'coach_mode', // 'planned' | 'manual' | 'free' (snapshot)
  paused: 'tracking_paused', // já escrito pelo useTracking
  finished: 'tracking_finished', // já escrito pelo useTracking
  lastKm: 'coach_last_km', // último km já anunciado (idempotência)
  speakCountKm: 'coach_speak_count_km', // falas no km atual (orçamento)
  lastMessage: 'coach_last_message', // displayText do último aviso (para o sino/balão)
  unread: 'coach_unread', // há aviso novo não aberto?
  spokenSplits: 'coach_spoken_splits', // JSON dos splits já falados (histórico p/ UI)
} as const;

export type CoachRunMode = 'planned' | 'manual' | 'free';
