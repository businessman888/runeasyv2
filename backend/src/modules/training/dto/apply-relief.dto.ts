import { IsIn, IsString, MaxLength } from 'class-validator';

/**
 * Corpo do `POST /training/workouts/:id/relief` — Fase 6.2.
 *
 * ── POR QUE O DIGEST VEM DO CLIENTE ───────────────────────────────────────────
 *
 * `expected_digest` é o token de versão que a PREVIEW devolveu. O servidor
 * poderia buscar o digest atual sozinho, e é justamente isso que não pode
 * acontecer: aplicar contra o estado de "agora" anularia a concorrência
 * otimista inteira — o corredor confirmaria um treino e o servidor escreveria
 * sobre outro.
 *
 * O cliente não interpreta esse valor. É string opaca: veio da preview, volta
 * no apply, e quem compara é `apply_plan_adaptation` dentro da transação.
 *
 * O `level` é um enum fechado de propósito. Um percentual livre transformaria a
 * ação num editor de treino — cada valor exigiria recomputar os segmentos e uma
 * preview própria, e o corredor passaria a redesenhar a prescrição em vez de
 * aliviá-la.
 */
export class ApplyReliefDto {
  /** `light` = −20% · `strong` = −35% (alvos nominais; ver `RELIEF_TARGET_PCT`). */
  @IsIn(['light', 'strong'])
  level: 'light' | 'strong';

  /** O digest devolvido pela preview. Opaco — não inspecionar, não recalcular. */
  @IsString()
  @MaxLength(128)
  expected_digest: string;
}
