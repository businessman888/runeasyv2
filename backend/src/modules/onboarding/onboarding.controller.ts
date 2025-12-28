import {
    Controller,
    Post,
    Body,
    Headers,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
    private readonly logger = new Logger(OnboardingController.name);

    constructor(private readonly onboardingService: OnboardingService) { }

    /**
     * Mark user onboarding as complete
     */
    @Post('complete')
    async completeOnboarding(
        @Headers('x-user-id') userId: string,
        @Body() body: { quiz_data: any },
    ) {
        if (!userId) {
            throw new BadRequestException('User ID is required');
        }

        try {
            await this.onboardingService.completeOnboarding(userId, body.quiz_data);
            return { success: true, message: 'Onboarding completed successfully' };
        } catch (error) {
            this.logger.error('Failed to complete onboarding', error);
            throw error;
        }
    }
}
