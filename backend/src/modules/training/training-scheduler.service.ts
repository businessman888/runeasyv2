import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service';
import { NotificationService } from '../notifications/notification.service';
import { RetrospectiveService } from './retrospective.service';
import { WeeklyInsightService } from './weekly-insight.service';

/**
 * A linha de `workouts` que o lembrete precisa — só o que está no `select`.
 *
 * O PostgREST devolve `any`, e sem este tipo `workout.id` e `workout.user_id`
 * entram na `dedupeKey` e no `userId` como `any`. Numa chave de idempotência
 * isso importa mais do que de costume: um `undefined` silencioso viraria a
 * string `'reminder:undefined:undefined'`, que é a MESMA para todo mundo — a
 * primeira notificação do dia bloquearia todas as outras.
 */
interface ReminderWorkoutRow {
  id: string;
  user_id: string;
  type: string;
  distance_km: number | null;
  objective: string | null;
  /** `date` puro, já em 'YYYY-MM-DD'. */
  scheduled_date: string;
}

@Injectable()
export class TrainingSchedulerService {
  private readonly logger = new Logger(TrainingSchedulerService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly notificationService: NotificationService,
    private readonly retrospectiveService: RetrospectiveService,
    private readonly weeklyInsightService: WeeklyInsightService,
  ) {}

  /**
   * Check for upcoming workouts and send reminders 1 hour before.
   * Runs every hour.
   *
   * ── A GUARDA CONTRA DUPLICATA ─────────────────────────────────────────────
   *
   * É `notifyOnce` + índice UNIQUE, e não mais um `Set` em memória. O `Set`
   * (`sentReminders`) foi removido: ele não pegou nenhuma das 4.038 duplicatas
   * medidas em produção, porque as duas execuções do cron liam o Set vazio
   * antes de qualquer escrita — e ainda tinha um bug próprio, `key.split('-')`
   * sobre `<uuid>-<data>`, que devolvia um pedaço do UUID no lugar da data e
   * deixava a limpeza sem efeito.
   *
   * A chave usa `workout.scheduled_date`, não um "hoje" calculado: é a data do
   * próprio treino, imune a fuso e estável entre execuções.
   */
  @Cron('0 * * * *', {
    name: 'workout-reminders',
    timeZone: 'America/Sao_Paulo', // UTC-3 (Brasília time)
  })
  async sendWorkoutReminders() {
    this.logger.log('Starting workout reminder job...');

    try {
      const supabase = this.supabaseService.getClient();
      const now = new Date();

      // Get current date and time
      const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const currentHour = now.getHours();

      // Workouts are scheduled for 05:00 by default
      // We want to send reminder at 04:00 (1 hour before)
      const WORKOUT_HOUR = 5;
      const REMINDER_HOUR = 4;

      // Only run at the reminder hour (04:00)
      if (currentHour !== REMINDER_HOUR) {
        this.logger.debug(
          `Not reminder time yet (current: ${currentHour}:00, target: ${REMINDER_HOUR}:00)`,
        );
        return;
      }

      // Find all pending workouts scheduled for today
      const { data: workouts, error } = await supabase
        .from('workouts')
        .select('id, user_id, type, distance_km, objective, scheduled_date')
        .eq('scheduled_date', currentDate)
        .eq('status', 'pending');

      if (error) {
        this.logger.error('Failed to fetch workouts', error);
        return;
      }

      const rows = (workouts ?? []) as ReminderWorkoutRow[];

      if (rows.length === 0) {
        this.logger.log('No workouts scheduled for today');
        return;
      }

      this.logger.log(`Found ${rows.length} workouts scheduled for today`);

      let remindersSent = 0;

      for (const workout of rows) {
        try {
          const workoutTypeName = this.getWorkoutTypeName(workout.type);
          const title = '🏃 Hora do Treino!';
          const description = `Você tem um ${workoutTypeName} agendado para hoje às ${WORKOUT_HOUR}:00. Vamos lá!`;

          const result = await this.notificationService.notifyOnce({
            userId: workout.user_id,
            type: 'reminder',
            title,
            description,
            dedupeKey: `reminder:${workout.id}:${workout.scheduled_date}`,
            metadata: {
              workout_id: workout.id,
              workout_type: workout.type,
              distance_km: workout.distance_km,
              scheduled_time: `${WORKOUT_HOUR}:00`,
              screen: 'Home', // For navigation
            },
            push: {
              data: {
                type: 'workout_reminder',
                workout_id: workout.id,
                screen: 'Home', // Deep link target
              },
              channelId: 'training',
            },
          });

          if (result.pushSent) {
            remindersSent++;
            this.logger.log(
              `Sent reminder for workout ${workout.id} to user ${workout.user_id}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to send reminder for workout ${workout.id}`,
            error,
          );
        }
      }

      this.logger.log(
        `Workout reminder job completed: ${remindersSent} reminders sent`,
      );
    } catch (error) {
      this.logger.error('Failed to send workout reminders', error);
    }
  }

  /**
   * Helper to get Portuguese workout type name
   */
  private getWorkoutTypeName(type: string): string {
    const types: Record<string, string> = {
      easy_run: 'Corrida Leve',
      long_run: 'Long Run',
      intervals: 'Treino Intervalado',
      tempo: 'Tempo Run',
      recovery: 'Corrida de Recuperação',
    };
    return types[type] || type;
  }

  /**
   * Manual trigger for testing
   */
  async triggerReminders() {
    this.logger.log('Manually triggering workout reminders...');
    await this.sendWorkoutReminders();
  }

  /**
   * Check for completed training plans and generate retrospectives
   * Runs at midnight São Paulo time (00:00 UTC-3)
   *
   * ⚠️ NÃO ENVIE NOTIFICAÇÃO DAQUI. `RetrospectiveService.generateRetrospective`
   * é o dono do envio, e por um motivo estrutural: o endpoint manual
   * `POST /training/retrospective/generate` chama aquele método direto, sem
   * passar por este cron — se o dono fosse aqui, geração manual não notificaria
   * ninguém.
   *
   * Até a Fase 1A este método tinha o seu próprio `sendRetrospectiveNotification`,
   * e o resultado eram 2 linhas em `notifications` + 2 pushes por retrospectiva
   * (uma 'recovery_analysis' do service, uma 'achievement' daqui, com títulos
   * diferentes). O método foi removido — `training-scheduler.service.spec.ts`
   * trava a remoção contra reintrodução.
   */
  @Cron('0 0 * * *', {
    name: 'retrospective-check',
    timeZone: 'America/Sao_Paulo',
  })
  async checkForCompletedPlans() {
    const now = new Date();
    this.logger.log(
      `[Retrospective Cron] Starting at ${now.toISOString()} (midnight São Paulo)`,
    );

    try {
      const generatedRetros =
        await this.retrospectiveService.checkForCompletedPlans();

      this.logger.log(
        `[Retrospective Cron] Completed successfully, generated ${generatedRetros.length} retrospectives`,
      );
    } catch (error) {
      this.logger.error('[Retrospective Cron] Failed:', error);
    }
  }

  /**
   * Manual trigger for retrospective check (testing)
   */
  async triggerRetrospectiveCheck() {
    this.logger.log('Manually triggering retrospective check...');
    await this.checkForCompletedPlans();
  }

  /**
   * Gera o insight de toda SEMANA DO PLANO que fechou e ainda não tem um.
   * Roda à meia-noite de São Paulo, junto do check de retrospectiva.
   *
   * ⚠️ NÃO ENVIE NOTIFICAÇÃO DAQUI, pelo mesmo motivo da retrospectiva:
   * `WeeklyInsightService` é o dono do envio, porque o endpoint manual
   * `POST /training/weekly-insight/generate` chama a geração direto, sem passar
   * por este cron.
   *
   * A dedupe também NÃO é o `sentReminders` acima: é `SELECT` +
   * `UNIQUE (plan_id, week_number)` no banco, que sobrevive a restart e a
   * múltiplas réplicas.
   */
  @Cron('0 0 * * *', {
    name: 'weekly-insight-check',
    timeZone: 'America/Sao_Paulo',
  })
  async checkForClosedPlanWeeks() {
    this.logger.log('[WeeklyInsight Cron] Starting (midnight São Paulo)');

    try {
      const generated =
        await this.weeklyInsightService.checkForClosedPlanWeeks();
      this.logger.log(
        `[WeeklyInsight Cron] Completed, generated ${generated.length} insight(s)`,
      );
    } catch (error) {
      this.logger.error('[WeeklyInsight Cron] Failed:', error);
    }
  }

  /** Manual trigger for weekly insight check (testing) */
  async triggerWeeklyInsightCheck() {
    this.logger.log('Manually triggering weekly insight check...');
    await this.checkForClosedPlanWeeks();
  }
}
