import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service';
import { NotificationService } from '../notifications/notification.service';
import { saoPauloTodayStr } from '../training/wellness/helpers/streak.helper';
import { addDaysStr } from '../training/helpers/plan-window.helper';

@Injectable()
export class ReadinessScheduler {
  private readonly logger = new Logger(ReadinessScheduler.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Convida o corredor para o check-in de prontidão, às 03:00 SP.
   *
   * ── POR QUE ISTO NUNCA RODOU ──────────────────────────────────────────────
   *
   * O loop começava com um `upsert` em `readiness_checkins` — uma tabela que
   * NÃO EXISTE no banco (a migration em `backend/migrations/` nunca foi
   * aplicada, e o ledger de migrações está desatualizado, então ninguém notou).
   * Todo usuário caía no `if (upsertError) { continue; }` e o job terminava com
   * "0 unlocked, 0 notifications sent". Zero notificações de readiness foram
   * criadas em produção — nunca, nem uma vez.
   *
   * Nada a jusante dependia daquele upsert: `createNotification` e
   * `sendDailyReadinessNotification` recebem só `userId`, e o estado real do
   * check-in vive em `readiness_history`. `readiness_checkins` não era lida em
   * lugar nenhum do repositório. O bloco saiu inteiro.
   *
   * ⚠️ Este job NOTIFICA; ele não desbloqueia nada. A elegibilidade continua
   * sendo `getReadinessStatus`, calculada on-read. Separar as duas coisas — e o
   * horário civil da notificação — é R.1.
   */
  @Cron('0 3 * * *', {
    name: 'unlock-daily-readiness',
    timeZone: 'America/Sao_Paulo', // UTC-3 (Brasília time)
  })
  async unlockDailyReadiness() {
    this.logger.log('Starting daily readiness unlock job...');

    try {
      const supabase = this.supabaseService.getClient();

      // "Ontem" em dia de São Paulo, não em dia UTC. O job roda 03:00 SP =
      // 06:00 UTC, então o dia UTC coincide — mas a JANELA não: um dia de São
      // Paulo vai de 03:00Z a 02:59Z do dia seguinte. Com a janela em UTC puro,
      // quem correu entre 21h e meia-noite ficava de fora, e quem correu nesse
      // horário anteontem entrava no lugar.
      const yesterdayStr = addDaysStr(saoPauloTodayStr(), -1);
      const windowStart = `${yesterdayStr}T03:00:00Z`; // 00:00 SP de ontem
      const windowEnd = `${addDaysStr(yesterdayStr, 1)}T02:59:59Z`; // 23:59 SP

      // 1. Find all users who completed a workout YESTERDAY (São Paulo)
      const { data: usersWithWorkouts, error: activitiesError } = await supabase
        .from('activities')
        .select('user_id')
        .eq('type', 'Run')
        .gte('start_date', windowStart)
        .lte('start_date', windowEnd);

      if (activitiesError) {
        this.logger.error(
          `[ReadinessScheduler] Falha ao buscar atividades de ${yesterdayStr}: ` +
            `code=${activitiesError.code} message=${activitiesError.message}`,
        );
        return;
      }

      if (!usersWithWorkouts || usersWithWorkouts.length === 0) {
        this.logger.log('No users trained yesterday - nothing to notify');
        return;
      }

      // Get unique user IDs
      const uniqueUserIds: string[] = [
        ...new Set(usersWithWorkouts.map((a: any) => a.user_id as string)),
      ];
      this.logger.log(
        `Found ${uniqueUserIds.length} users eligible for check-in`,
      );

      let notifiedCount = 0;
      let notificationsSent = 0;

      // 2. For each user, create the in-app row + send the push
      for (const userId of uniqueUserIds) {
        try {
          // 3. Create persistent notification in database
          await this.notificationService.createNotification(
            userId,
            'system',
            '☀️ Bom dia!',
            'Seu check-in diário está disponível. Como você está se sentindo hoje?',
            {
              // `NotificationsScreen` navega direto para `metadata.screen`
              // quando o tipo é system/reminder/achievement. Era 'Evolution' —
              // uma aba que não existe (Home/Calendar/Ranking/Wellness/Settings).
              screen: 'ReadinessQuiz',
              type: 'daily_readiness',
            },
          );
          notifiedCount++;

          // 4. Send push notification
          const notificationSent =
            await this.notificationService.sendDailyReadinessNotification(
              userId,
            );
          if (notificationSent) {
            notificationsSent++;
          }
        } catch (error) {
          this.logger.error(`Error processing user ${userId}`, error);
        }
      }

      this.logger.log(
        `Daily readiness unlock completed: ${notifiedCount} notified, ${notificationsSent} pushes sent`,
      );
    } catch (error) {
      this.logger.error('Failed to unlock daily readiness', error);
    }
  }

  /**
   * Manual trigger for testing (can be called via admin endpoint)
   */
  async triggerUnlock() {
    this.logger.log('Manually triggering daily readiness unlock...');
    await this.unlockDailyReadiness();
  }
}
