import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TrainingService } from './training.service';
import { TrainingAIService } from './training-ai.service';
import { TrainingController } from './training.controller';
import { TrainingSchedulerService } from './training-scheduler.service';
import { NotificationModule } from '../notifications';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        NotificationModule,
    ],
    controllers: [TrainingController],
    providers: [TrainingService, TrainingAIService, TrainingSchedulerService],
    exports: [TrainingService, TrainingAIService],
})
export class TrainingModule { }

