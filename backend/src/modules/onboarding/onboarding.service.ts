import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';

@Injectable()
export class OnboardingService {
    private readonly logger = new Logger(OnboardingService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    /**
     * Complete user onboarding and save quiz data
     */
    async completeOnboarding(userId: string, quizData: any) {
        try {
            // Check if onboarding record already exists
            const { data: existing } = await this.supabaseService
                .from('user_onboarding')
                .select('id')
                .eq('user_id', userId)
                .single();

            if (existing) {
                // Update existing record
                const { error } = await this.supabaseService
                    .from('user_onboarding')
                    .update({
                        completed_at: new Date().toISOString(),
                        quiz_data: quizData,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', userId);

                if (error) throw error;
            } else {
                // Create new record
                const { error } = await this.supabaseService
                    .from('user_onboarding')
                    .insert({
                        user_id: userId,
                        completed_at: new Date().toISOString(),
                        quiz_data: quizData,
                    });

                if (error) throw error;
            }

            this.logger.log(`Onboarding completed for user ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to complete onboarding for user ${userId}`, error);
            throw error;
        }
    }
}
