import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Corpo do `POST /training/plan/week-relief` — Fase 6.3.
 *
 * ── O QUE NÃO ESTÁ AQUI, E POR QUÊ ────────────────────────────────────────────
 *
 * Não há `week_number`. O backend resolve a semana alvo sozinho (a seguinte à
 * corrente), e isso é deliberado: se o cliente escolhesse, existiria um caminho
 * em que ele pede uma semana e a preview mostrou outra. Um app não pode pedir a
 * semana errada se ele não pede semana nenhuma.
 *
 * `expected_digest` é o token de versão devolvido pela preview — string opaca,
 * conferida dentro da transação. Buscar um digest novo no momento do toque
 * anularia a concorrência otimista: o corredor confirmaria uma semana e o
 * servidor escreveria sobre outra.
 */
export class ApplyWeekReliefDto {
  /** `light` = −20% · `strong` = −35% do total da semana (alvos nominais). */
  @IsIn(['light', 'strong'])
  level: 'light' | 'strong';

  /** O digest devolvido pela preview. Opaco — não inspecionar, não recalcular. */
  @IsString()
  @MaxLength(128)
  expected_digest: string;

  /**
   * O insight que sugeriu o alívio, quando a ação vem da bandeja semanal.
   *
   * Vira `plan_adaptations.source_insight_id` e é o que torna o padrão "aliviou
   * N das últimas M semanas" auditável — sem ele, o alívio melhora o
   * `executionRatio` seguinte e o próprio rastro do hábito desaparece dentro de
   * uma aderência artificialmente boa.
   *
   * Também é a chave do `already_applied`: o histórico substitui um carimbo que
   * exigiria migration.
   */
  @IsOptional()
  @IsUUID()
  insight_id?: string;
}
