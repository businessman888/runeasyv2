import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FeedbackAIService } from './feedback-ai.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackProcessor } from './feedback.processor';
import { NotificationModule } from '../notifications';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
    imports: [
        forwardRef(() => NotificationModule),
        GamificationModule,
        BullModule.registerQueue({
            name: 'feedback-queue',
        }),
    ],
    controllers: [FeedbackController],
    providers: [FeedbackAIService, FeedbackProcessor],
    exports: [FeedbackAIService, BullModule],
})
export class FeedbackModule { }
