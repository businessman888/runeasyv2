import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    /**
     * Get user by ID (includes onboarding_completed flag for navigation control)
     * Performs lazy sync of Google OAuth metadata and onboarding biometrics on first call
     */
    async getUser(userId: string) {
        const { data, error } = await this.supabaseService
            .from('users')
            .select('id, email, profile, subscription_status, created_at, onboarding_completed')
            .eq('id', userId)
            .single();

        if (error) {
            this.logger.error(`Failed to get user ${userId}`, error);
            throw error;
        }

        // Lazy sync: populate profile from Google OAuth and onboarding if missing
        const profile = data.profile || {};
        let needsRefetch = false;

        if (!profile.full_name) {
            await this.syncGoogleMetadata(userId);
            needsRefetch = true;
        }

        if (!profile.weight_kg && data.onboarding_completed) {
            await this.syncOnboardingBiometrics(userId);
            needsRefetch = true;
        }

        if (needsRefetch) {
            const { data: refreshed } = await this.supabaseService
                .from('users')
                .select('id, email, profile, subscription_status, created_at, onboarding_completed')
                .eq('id', userId)
                .single();
            return refreshed || data;
        }

        return data;
    }

    /**
     * Sync Google OAuth metadata (full_name, avatar_url) from auth.users to public.users.profile
     * Only fills in missing fields — never overwrites user-edited values
     */
    async syncGoogleMetadata(userId: string): Promise<void> {
        try {
            const { data: { user: authUser }, error } = await this.supabaseService.auth.admin.getUserById(userId);
            if (error || !authUser) {
                this.logger.warn(`Could not fetch auth user ${userId} for metadata sync`);
                return;
            }

            const meta = authUser.user_metadata || {};
            const fullName = meta.full_name || meta.name || '';
            const avatarUrl = meta.avatar_url || meta.picture || '';

            if (!fullName && !avatarUrl) return;

            const nameParts = fullName.split(' ');
            const updates: Record<string, any> = {};

            if (fullName) {
                updates.full_name = fullName;
                updates.firstname = nameParts[0] || '';
                updates.lastname = nameParts.slice(1).join(' ') || '';
            }
            if (avatarUrl) {
                updates.avatar_url = avatarUrl;
                updates.profile_pic = avatarUrl;
            }

            await this.updateProfile(userId, updates);
            this.logger.log(`Google metadata synced for user ${userId}`);
        } catch (err) {
            this.logger.error(`Failed to sync Google metadata for user ${userId}`, err);
        }
    }

    /**
     * Sync onboarding biometrics (birth_date, weight, height) from user_onboarding to users.profile
     */
    async syncOnboardingBiometrics(userId: string): Promise<void> {
        try {
            const { data: onboarding, error } = await this.supabaseService
                .from('user_onboarding')
                .select('birth_date, weight, height')
                .eq('user_id', userId)
                .single();

            if (error || !onboarding) return;

            const updates: Record<string, any> = {};
            if (onboarding.birth_date) updates.birth_date = onboarding.birth_date;
            if (onboarding.weight) updates.weight_kg = onboarding.weight;
            if (onboarding.height) updates.height_cm = onboarding.height;

            if (Object.keys(updates).length > 0) {
                await this.updateProfile(userId, updates);
                this.logger.log(`Onboarding biometrics synced for user ${userId}`);
            }
        } catch (err) {
            this.logger.error(`Failed to sync onboarding biometrics for user ${userId}`, err);
        }
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
        await this.supabaseService.from('activities').delete().eq('user_id', userId);
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
