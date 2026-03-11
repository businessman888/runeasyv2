import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';
import { ReadinessAIService } from './readiness-ai.service';
import { ReadinessScheduler } from './readiness-scheduler.service';
import { QuestionSetsParserService } from './question-sets-parser.service';
import { DatabaseModule } from '../../database';
import { NotificationModule } from '../notifications';

@Module({
    imports: [
        ConfigModule,
        DatabaseModule,
        ScheduleModule.forRoot(),
        NotificationModule,
    ],
    controllers: [ReadinessController],
    providers: [
        ReadinessService,
        ReadinessAIService,
        ReadinessScheduler,
        QuestionSetsParserService,
    ],
    exports: [ReadinessService],
})
export class ReadinessModule { }
