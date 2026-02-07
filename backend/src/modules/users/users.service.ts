import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    /**
     * Get user by ID (includes onboarding_completed flag for navigation control)
     */
    async getUser(userId: string) {
        const { data, error } = await this.supabaseService
            .from('users')
            .select('id, email, strava_athlete_id, profile, subscription_status, created_at, onboarding_completed')
            .eq('id', userId)
            .single();

        if (error) {
            this.logger.error(`Failed to get user ${userId}`, error);
            throw error;
        }

        return data;
    }

    /**
     * Mark user onboarding as complete (called after quiz submission)
     */
    async markOnboardingComplete(userId: string) {
        const { data, error } = await this.supabaseService
            .from('users')
            .update({
                onboarding_completed: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to mark onboarding complete for user ${userId}`, error);
            throw error;
        }

        this.logger.log(`Onboarding marked complete for user ${userId}`);
        return data;
    }


    /**
     * Update user profile
     */
    async updateProfile(userId: string, profileUpdates: Record<string, any>) {
        // First get the current user to merge profile data
        const { data: currentUser, error: fetchError } = await this.supabaseService
            .from('users')
            .select('profile')
            .eq('id', userId)
            .single();

        if (fetchError) {
            this.logger.error(`Failed to fetch user ${userId}`, fetchError);
            throw fetchError;
        }

        // Merge existing profile with updates
        const mergedProfile = {
            ...(currentUser.profile || {}),
            ...profileUpdates,
        };

        // Update the user with merged profile
        const { data, error } = await this.supabaseService
            .from('users')
            .update({
                profile: mergedProfile,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            this.logger.error(`Failed to update profile for user ${userId}`, error);
            throw error;
        }

        this.logger.log(`Profile updated for user ${userId}`);
        return data;
    }

    /**
     * Delete user (LGPD compliance)
     */
    async deleteUser(userId: string) {
        // Delete related data first
        await this.supabaseService.from('ai_feedbacks').delete().eq('user_id', userId);
        await this.supabaseService.from('strava_activities').delete().eq('user_id', userId);
        await this.supabaseService.from('workouts').delete().eq('user_id', userId);
        await this.supabaseService.from('training_plans').delete().eq('user_id', userId);
        await this.supabaseService.from('points_history').delete().eq('user_id', userId);
        await this.supabaseService.from('user_badges').delete().eq('user_id', userId);
        await this.supabaseService.from('user_levels').delete().eq('user_id', userId);
        await this.supabaseService.from('user_onboarding').delete().eq('user_id', userId);

        // Finally delete the user
        const { error } = await this.supabaseService
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) throw error;
        return { success: true };
    }
}
