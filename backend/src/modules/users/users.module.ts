import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ACCOUNT_DELETION_QUEUE } from '../account-deletion/account-deletion.types';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DatabaseModule } from '../../database';

@Module({
  imports: [
    DatabaseModule,
    // Lado PRODUTOR da fila. O consumidor é o `AccountDeletionModule`, que
    // importa o `DevicesModule` — importá-lo aqui fecharia um ciclo, porque o
    // `TrainingModule` importa este módulo de volta. Mesma divisão de
    // `feedback-queue` e `elevation-queue`.
    BullModule.registerQueue({ name: ACCOUNT_DELETION_QUEUE }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
