import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { FeedbackAIService } from './feedback-ai.service';

@Processor('feedback-queue')
export class FeedbackProcessor extends WorkerHost {
    private readonly logger = new Logger(FeedbackProcessor.name);

    constructor(private readonly feedbackAIService: FeedbackAIService) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing job ${job.id} of type ${job.name}`);
        
        if (job.name === 'generate') {
            const { userId, workoutId, activityId } = job.data;
            try {
                this.logger.log(`Starting feedback generation for workout: ${workoutId}`);
                await this.feedbackAIService.generateFeedback(userId, workoutId, activityId);
                this.logger.log(`Feedback generated successfully for workout ${workoutId}`);
                return { success: true };
            } catch (error) {
                this.logger.error(`Failed to generate feedback for workout ${workoutId}`, error);
                throw error; // Lança erro para o BullMQ tentar novamente caso configurado
            }
        }
        
        return { ignored: true };
    }
}
