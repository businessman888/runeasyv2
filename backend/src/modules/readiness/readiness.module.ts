import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';
import { ReadinessAIService } from './readiness-ai.service';
import { ReadinessScheduler } from './readiness-scheduler.service';
import { QuestionSetsParserService } from './question-sets-parser.service';
import { DatabaseModule } from '../../database';
import { NotificationModule } from '../notifications';

/**
 * ⚠️ NÃO adicione `ScheduleModule.forRoot()` aqui.
 *
 * Ele estava nesta lista e era metade da causa de 97,5% dos lembretes de treino
 * duplicarem em produção: um segundo `forRoot()` instancia um segundo
 * `ScheduleExplorer`, que registra TODOS os `@Cron` do app de novo. O
 * `@Cron` deste módulo (`unlock-daily-readiness`) continua sendo descoberto
 * normalmente pelo explorador único de `app.module.ts`, porque `forRoot()` é
 * `global: true`.
 */
@Module({
  imports: [ConfigModule, DatabaseModule, NotificationModule],
  controllers: [ReadinessController],
  providers: [
    ReadinessService,
    ReadinessAIService,
    ReadinessScheduler,
    QuestionSetsParserService,
  ],
  exports: [ReadinessService],
})
export class ReadinessModule {}
