import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../../database';
import { DevicesModule } from '../devices/devices.module';
import { GOOGLE_HEALTH_SYNC_QUEUE } from '../devices/providers/google-health-webhook.types';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionProcessor } from './account-deletion.processor';
import { ACCOUNT_DELETION_QUEUE } from './account-deletion.types';

/**
 * Módulo próprio, e não um pedaço do `UsersModule`, por causa de um ciclo real:
 * `TrainingModule` importa `UsersModule`, e `DevicesModule` importa
 * `TrainingModule`. Pôr a exclusão dentro do `UsersModule` exigiria
 * `forwardRef` num grafo que já tem dois.
 *
 * Aqui o sentido é único — `AccountDeletionModule` → `DevicesModule` → … →
 * `UsersModule` — e ninguém importa este módulo de volta. O `UsersModule` só
 * registra a fila para injetar o `Queue` e enfileirar, que é exatamente a
 * divisão produtor/consumidor que `feedback-queue` e `elevation-queue` já usam.
 */
@Module({
  imports: [
    DatabaseModule,
    DevicesModule,
    BullModule.registerQueue({ name: ACCOUNT_DELETION_QUEUE }),
    // Filas drenadas na exclusão — registradas só para injetar o `Queue`.
    BullModule.registerQueue({ name: 'feedback-queue' }),
    BullModule.registerQueue({ name: 'elevation-queue' }),
    BullModule.registerQueue({ name: GOOGLE_HEALTH_SYNC_QUEUE }),
  ],
  providers: [AccountDeletionService, AccountDeletionProcessor],
  exports: [AccountDeletionService],
})
export class AccountDeletionModule {}
