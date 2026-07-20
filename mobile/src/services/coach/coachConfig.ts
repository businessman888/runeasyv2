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
 * Alerta de pace (Fase 4) — histerese. Todas ajustáveis (calibração em campo).
 * Unidade de pace = segundos/km (número maior = mais lento).
 */
export const COACH_PACE = {
  /** Período de graça no início de um segmento (transição) antes de cobrar o pace. */
  GRACE_SEC: 8,
  /** Só alerta se ficar fora da faixa, na MESMA direção, por este tempo consecutivo. */
  TRIGGER_SEC: 9,
  /** Após alertar, silêncio mínimo antes de repetir o alerta de pace. */
  COOLDOWN_SEC: 25,
  /** Tolerância (s/km) além da faixa antes de considerar "fora". */
  TOL_SEC: 3,
  /** Tolerância extra durante recuperação (o trote varia mais). */
  RECOVERY_EXTRA_TOL_SEC: 8,
  /** Anunciar retorno à faixa? Default off — o silêncio já comunica. */
  ANNOUNCE_RETURN: false,
  /** TTL do alerta de pace (efêmero). */
  TTL_MS: 6000,
};

/** Transições de intervalado (Fase 4). */
export const COACH_TRANSITION = {
  /** Antecedência do aviso "prepare-se, tiro em Ns". */
  PREP_LEAD_SEC: 10,
  /** TTL do "prepare-se" (efêmero — se atrasar, o tiro já começou). */
  PREP_TTL_MS: 5000,
  /** TTL do "vai/recupera" (inadiável, mas ainda expira se ficar velho). */
  BOUNDARY_TTL_MS: 4000,
};

/** Motivacional (Fase 4). */
export const COACH_MOTIV = {
  /** Distância mínima (m) antes de falar a mensagem de início. */
  START_MIN_M: 30,
  /** "Último km" dispara quando falta isto para a distância total planejada. */
  LAST_KM_M: 1000,
  TTL_MS: 10000,
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

  // ── Fase 4: estrutura do treino + cursor de execução + estado de histerese ──
  segments: 'coach_segments', // JSON de workoutBlocks (só planned)
  cursorIdx: 'coach_cursor_idx', // índice da sub-etapa ativa no segmentEngine
  cursorStartDist: 'coach_cursor_start_dist', // distância (m) no início da sub-etapa
  cursorStartTs: 'coach_cursor_start_ts', // timestamp GPS no início da sub-etapa
  paceOutSince: 'coach_pace_out_since', // ts em que o pace saiu da faixa (0 = dentro)
  paceDir: 'coach_pace_dir', // 'slow' | 'fast' | 'in'
  paceLastAlertAt: 'coach_pace_last_alert_at', // cooldown do alerta de pace
  lastTransitionStep: 'coach_last_transition_step', // borda de transição já anunciada
  preparedStep: 'coach_prepared_step', // índice do work já "preparado" (prep falado)
  startedSpoken: 'coach_started_spoken', // motivacional de início já falado?
  lastKmSpoken: 'coach_last_km_spoken', // motivacional de último km já falado?
} as const;

export type CoachRunMode = 'planned' | 'manual' | 'free';
