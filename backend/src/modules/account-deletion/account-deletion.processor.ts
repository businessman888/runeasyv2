import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { AccountDeletionService } from './account-deletion.service';
import {
  ACCOUNT_DELETION_JOB,
  ACCOUNT_DELETION_QUEUE,
  AccountDeletionJobData,
} from './account-deletion.types';

/**
 * Worker da exclusão de conta. Molde: `FeedbackProcessor`.
 *
 * A exclusão é assíncrona porque fala com o Google, com o Storage e com o Auth
 * — três redes diferentes, nenhuma delas dentro de uma transação. Segurar a
 * requisição HTTP até tudo terminar transformaria uma indisponibilidade
 * externa num erro na cara do usuário, num momento em que ele já decidiu sair.
 */
@Processor(ACCOUNT_DELETION_QUEUE)
export class AccountDeletionProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountDeletionProcessor.name);

  constructor(private readonly accountDeletion: AccountDeletionService) {
    super();
  }

  async process(job: Job<AccountDeletionJobData, unknown, string>) {
    if (job.name !== ACCOUNT_DELETION_JOB) {
      this.logger.warn(
        `[account-deletion] job name desconhecido "${job.name}" — ignorado`,
      );
      return { ignored: true };
    }

    const { userId } = job.data;

    try {
      const summary = await this.accountDeletion.deleteAccount(userId);
      return { success: true, summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // `user_id` malformado não melhora com retentativa: é bug de chamador, e
      // insistir só enche o log. Converter em irrecuperável faz o job morrer
      // rápido e visível, em vez de oito vezes em silêncio.
      if (message.includes('user_id inválido')) {
        this.logger.error(`[account-deletion] ${message}`);
        return Promise.reject(new UnrecoverableError(message));
      }

      const isFinalAttempt =
        !job.opts?.attempts || job.attemptsMade + 1 >= job.opts.attempts;
      this.logger.error(
        `[account-deletion] ${userId} falhou` +
          `${isFinalAttempt ? ' (ÚLTIMA tentativa — conta fica com deletion_requested_at preenchido)' : ''}: ${message}`,
      );
      throw error;
    }
  }
}
