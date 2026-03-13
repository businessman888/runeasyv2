import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { TrainingService } from './training.service';
import { TrainingAIService } from './training-ai.service';
import { TrainingController } from './training.controller';
import { TrainingSchedulerService } from './training-scheduler.service';
import { RetrospectiveService } from './retrospective.service';
import { NotificationModule } from '../notifications';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        NotificationModule,
        UsersModule,
        BullModule.registerQueue({
            name: 'feedback-queue',
        }),
    ],
    controllers: [TrainingController],
    providers: [TrainingService, TrainingAIService, TrainingSchedulerService, RetrospectiveService],
    exports: [TrainingService, TrainingAIService, RetrospectiveService],
})
export class TrainingModule { }

