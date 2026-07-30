import { IsInt, Max, Min } from 'class-validator';

/**
 * Corpo do `PATCH /training/workouts/:id/rpe`.
 *
 * Existe separado do fluxo de conclusão porque a coleta acontece DEPOIS: a
 * WorkoutProcessingScreen dispara o submit da conclusão já no mount, então não há
 * janela para o atleta responder antes. O app pergunta o RPE na tela de destino
 * (RunSummary para corrida livre/manual, CoachAnalysis para treino de plano), sem
 * pressão de tempo e com opção de pular.
 *
 * `rpe` é obrigatório AQUI — quem chama este endpoint está afirmando um valor.
 * "Opcional" no produto significa que o endpoint pode simplesmente nunca ser
 * chamado, não que ele aceite um valor vazio.
 */
export class SetWorkoutRpeDto {
  /** Percepção de esforço na escala Borg CR10 (1 = muito leve, 10 = máximo). */
  @IsInt()
  @Min(1)
  @Max(10)
  rpe: number;
}
