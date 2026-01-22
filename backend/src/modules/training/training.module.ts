import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TrainingService } from './training.service';
import { TrainingAIService } from './training-ai.service';
import { TrainingController } from './training.controller';
import { TrainingSchedulerService } from './training-scheduler.service';
import { RetrospectiveService } from './retrospective.service';
import { NotificationModule } from '../notifications';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        NotificationModule,
    ],
    controllers: [TrainingController],
    providers: [TrainingService, TrainingAIService, TrainingSchedulerService, RetrospectiveService],
    exports: [TrainingService, TrainingAIService, RetrospectiveService],
})
export class TrainingModule { }


