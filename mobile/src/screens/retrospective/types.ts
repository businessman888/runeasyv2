/**
 * Forma da resposta de `GET /api/training/retrospective/latest`.
 *
 * Espelha o DTO `Retrospective` do backend + os campos formatados que o
 * controller acrescenta (`avgPaceFormatted`, `targetPaceFormatted`).
 *
 * ── DOIS ESCOPOS QUE NÃO SE MISTURAM ─────────────────────────────────────────
 *
 * `planDistanceCompletedKm` é PLANO-ONLY (a Fase 1A existiu para isso: corrida
 * livre não pode inflar aderência). `totalDistanceKm` é TUDO no período.
 * `longestRunKm` conta TUDO também — recorde é conquista pessoal, não medida de
 * cumprimento. Nunca some os dois primeiros num indicador só.
 */
export interface RetrospectiveData {
  id: string;

  // ── Total corrido no período (inclui corrida livre) ──
  totalDistanceKm: number;
  totalRunsInPeriod: number;
  freeRunDistanceKm: number;

  // ── Aderência ao plano ──
  totalDistancePlannedKm: number;
  planDistanceCompletedKm: number;
  totalWorkoutsCompleted: number;
  totalWorkoutsPlanned: number;
  completionRate: number;
  distanceVsGoalPercent: number;

  // ── Pace ──
  avgPaceSeconds: number;
  avgPaceFormatted: string;
  /** "m:ss" ou "—" quando o plano não prescreveu pace. */
  targetPaceFormatted: string;
  paceVsGoalPercent: number;

  // ── Cadência semanal (métrica própria desde a 1A) ──
  frequencyActualPerWeek: number;
  frequencyTargetPerWeek: number;
  frequencyVsGoalPercent: number;

  // ── Clímax ──
  longestRunKm: number;
  /** 'YYYY-MM-DD' (São Paulo) ou null quando não houve corrida no período. */
  longestRunDate: string | null;

  // ── Contexto do ciclo ──
  planGoalLabel: string | null;
  planDurationWeeks: number | null;
  planWindowStart: string | null;
  planWindowEnd: string | null;

  // ── Conteúdo da IA ──
  aiInsights: string;
  suggestedNextGoal: string;
  suggestedNextGoalType: string;
}
