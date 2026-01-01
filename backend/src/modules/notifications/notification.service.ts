import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';
import axios from 'axios';

interface ExpoPushMessage {
    to: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    sound?: 'default' | null;
    badge?: number;
    channelId?: string;
    priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
    id: string;
    status: 'ok' | 'error';
    message?: string;
    details?: { error: string };
}

// Notification types for in-app notifications
export type NotificationType = 'recovery_analysis' | 'workout_sync' | 'achievement' | 'reminder' | 'system';

export interface AppNotification {
    id: string;
    user_id: string;
    type: NotificationType;
    title: string;
    description: string;
    is_read: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
}

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);
    private readonly expoPushUrl = 'https://exp.host/--/api/v2/push/send';

    constructor(private readonly supabaseService: SupabaseService) { }

    /**
     * Save user's push token
     */
    async savePushToken(userId: string, pushToken: string): Promise<void> {
        const { error } = await this.supabaseService
            .from('users')
            .update({ push_token: pushToken })
            .eq('id', userId);

        if (error) {
            this.logger.error('Failed to save push token', error);
            throw error;
        }

        this.logger.log(`Push token saved for user ${userId}`);
    }

    /**
     * Get user's push token
     */
    async getPushToken(userId: string): Promise<string | null> {
        const { data, error } = await this.supabaseService
            .from('users')
            .select('push_token')
            .eq('id', userId)
            .single();

        if (error || !data?.push_token) {
            return null;
        }

        return data.push_token;
    }

    /**
     * Send a push notification to a user
     */
    async sendPushNotification(
        userId: string,
        title: string,
        body: string,
        data?: Record<string, unknown>,
        options?: { channelId?: string; badge?: number },
    ): Promise<boolean> {
        const pushToken = await this.getPushToken(userId);

        if (!pushToken) {
            this.logger.warn(`No push token found for user ${userId}`);
            return false;
        }

        // Validate Expo push token format
        if (!pushToken.startsWith('ExponentPushToken[')) {
            this.logger.warn(`Invalid push token format for user ${userId}`);
            return false;
        }

        const message: ExpoPushMessage = {
            to: pushToken,
            title,
            body,
            data,
            sound: 'default',
            channelId: options?.channelId,
            badge: options?.badge,
            priority: 'high',
        };

        try {
            const response = await axios.post<ExpoPushTicket[]>(
                this.expoPushUrl,
                [message],
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Accept-Encoding': 'gzip, deflate',
                    },
                },
            );

            const ticket = response.data[0];

            if (ticket.status === 'error') {
                this.logger.error(`Push notification error: ${ticket.message}`, ticket.details);
                return false;
            }

            this.logger.log(`Push notification sent to user ${userId}: ${ticket.id}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to send push notification', error);
            return false;
        }
    }

    /**
     * Send feedback ready notification
     */
    async sendFeedbackReadyNotification(
        userId: string,
        feedbackId: string,
        workoutType: string,
    ): Promise<boolean> {
        const workoutTypeName = this.getWorkoutTypeName(workoutType);

        // Create persistent notification in database
        await this.createNotification(
            userId,
            'workout_sync',
            '📊 Feedback Pronto!',
            `Sua análise do ${workoutTypeName} está disponível. Veja como você se saiu!`,
            {
                feedback_id: feedbackId,
                workout_type: workoutType,
                screen: 'CoachAnalysis', // Navigate to feedback screen
                feedbackId, // For navigation params
            },
        );

        // Send push notification
        return this.sendPushNotification(
            userId,
            '📊 Feedback Pronto!',
            `Sua análise do ${workoutTypeName} está disponível. Veja como você se saiu!`,
            {
                type: 'feedback_ready',
                feedbackId,
                workoutType,
                screen: 'CoachAnalysis',
            },
            { channelId: 'feedback' },
        );
    }

    /**
     * Send workout reminder notification
     */
    async sendWorkoutReminderNotification(
        userId: string,
        workoutId: string,
        workoutType: string,
        scheduledTime: string,
    ): Promise<boolean> {
        const workoutTypeName = this.getWorkoutTypeName(workoutType);

        return this.sendPushNotification(
            userId,
            '🏃 Hora do Treino!',
            `Você tem um ${workoutTypeName} agendado para hoje. Vamos lá!`,
            {
                type: 'workout_reminder',
                workoutId,
                workoutType,
            },
            { channelId: 'training' },
        );
    }

    /**
     * Send badge earned notification
     */
    async sendBadgeEarnedNotification(
        userId: string,
        badgeName: string,
        badgeIcon: string,
    ): Promise<boolean> {
        return this.sendPushNotification(
            userId,
            `${badgeIcon} Nova Badge Conquistada!`,
            `Parabéns! Você conquistou a badge "${badgeName}"`,
            {
                type: 'badge_earned',
                badgeName,
            },
        );
    }

    /**
     * Send level up notification
     */
    async sendLevelUpNotification(
        userId: string,
        newLevel: number,
        levelName: string,
    ): Promise<boolean> {
        return this.sendPushNotification(
            userId,
            '🎉 Level Up!',
            `Você subiu para o nível ${newLevel}: ${levelName}!`,
            {
                type: 'level_up',
                newLevel,
                levelName,
            },
        );
    }

    /**
     * Send streak warning notification
     */
    async sendStreakWarningNotification(
        userId: string,
        currentStreak: number,
    ): Promise<boolean> {
        return this.sendPushNotification(
            userId,
            '🔥 Não perca seu streak!',
            `Você tem ${currentStreak} dias de streak. Faça um treino hoje para manter!`,
            {
                type: 'streak_warning',
                currentStreak,
            },
        );
    }

    /**
     * Send daily readiness check-in available notification
     */
    async sendDailyReadinessNotification(
        userId: string,
    ): Promise<boolean> {
        return this.sendPushNotification(
            userId,
            '☀️ Bom dia!',
            'Seu check-in diário está disponível. Como você está se sentindo hoje?',
            {
                type: 'daily_readiness',
                action: 'open_readiness_quiz',
            },
            { channelId: 'readiness' },
        );
    }

    private getWorkoutTypeName(type: string): string {
        const types: Record<string, string> = {
            'easy_run': 'Corrida Leve',
            'long_run': 'Long Run',
            'intervals': 'Treino Intervalado',
            'tempo': 'Tempo Run',
            'recovery': 'Corrida de Recuperação',
        };
        return types[type] || type;
    }

    // ==================== IN-APP NOTIFICATIONS ====================

    /**
     * Create a new in-app notification
     */
    async createNotification(
        userId: string,
        type: NotificationType,
        title: string,
        description: string,
        metadata?: Record<string, unknown>,
    ): Promise<AppNotification | null> {
        try {
            const { data, error } = await this.supabaseService
                .from('notifications')
                .insert({
                    user_id: userId,
                    type,
                    title,
                    description,
                    metadata: metadata || {},
                    is_read: false,
                })
                .select()
                .single();

            if (error) {
                this.logger.error('Failed to create notification', error);
                return null;
            }

            this.logger.log(`Created ${type} notification for user ${userId}`);
            return data as AppNotification;
        } catch (error) {
            this.logger.error('Error creating notification', error);
            return null;
        }
    }

    /**
     * Get all notifications for a user
     */
    async getUserNotifications(
        userId: string,
        limit: number = 50,
        offset: number = 0,
    ): Promise<AppNotification[]> {
        try {
            const { data, error } = await this.supabaseService
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                this.logger.error('Failed to get notifications', error);
                return [];
            }

            return (data as AppNotification[]) || [];
        } catch (error) {
            this.logger.error('Error getting notifications', error);
            return [];
        }
    }

    /**
     * Mark a notification as read
     */
    async markAsRead(notificationId: string, userId: string): Promise<boolean> {
        try {
            const { error } = await this.supabaseService
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId)
                .eq('user_id', userId);

            if (error) {
                this.logger.error('Failed to mark notification as read', error);
                return false;
            }

            return true;
        } catch (error) {
            this.logger.error('Error marking notification as read', error);
            return false;
        }
    }

    /**
     * Get unread notification count for a user
     */
    async getUnreadCount(userId: string): Promise<number> {
        try {
            const { count, error } = await this.supabaseService
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_read', false);

            if (error) {
                this.logger.error('Failed to get unread count', error);
                return 0;
            }

            return count || 0;
        } catch (error) {
            this.logger.error('Error getting unread count', error);
            return 0;
        }
    }

    /**
     * Schedule a recovery analysis notification to be created after 10 minutes
     * This creates an in-app notification with a summary of the AI analysis
     */
    scheduleRecoveryAnalysisNotification(
        userId: string,
        aiAnalysis: {
            headline: string;
            reasoning: string;
            readiness_score: number;
            status_label: string;
        },
    ): void {
        const DELAY_MS = 10 * 60 * 1000; // 10 minutes

        this.logger.log(`Scheduling recovery analysis notification for user ${userId} in 10 minutes`);

        setTimeout(async () => {
            try {
                // Create a brief summary from the AI analysis
                const description = `${aiAnalysis.headline}. Score: ${aiAnalysis.readiness_score}% - ${aiAnalysis.status_label}`;

                await this.createNotification(
                    userId,
                    'recovery_analysis',
                    'Análise de Recuperação',
                    description,
                    {
                        readiness_score: aiAnalysis.readiness_score,
                        status_label: aiAnalysis.status_label,
                        headline: aiAnalysis.headline,
                    },
                );

                // Also send push notification
                await this.sendPushNotification(
                    userId,
                    '🧠 Análise de Recuperação',
                    description,
                    { type: 'recovery_analysis' },
                    { channelId: 'insights' },
                );

                this.logger.log(`Recovery analysis notification created for user ${userId}`);
            } catch (error) {
                this.logger.error('Failed to create scheduled recovery notification', error);
            }
        }, DELAY_MS);
    }

    // ==================== NOTIFICATION PREFERENCES ====================

    /**
     * Get user's notification preferences
     */
    async getPreferences(userId: string): Promise<any> {
        try {
            const { data, error } = await this.supabaseService
                .from('notification_preferences')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) {
                // If preferences don't exist, create default ones
                if (error.code === 'PGRST116') {
                    return this.createDefaultPreferences(userId);
                }
                this.logger.error('Failed to get notification preferences', error);
                return null;
            }

            return data;
        } catch (error) {
            this.logger.error('Error getting notification preferences', error);
            return null;
        }
    }

    /**
     * Update user's notification preferences
     */
    async updatePreferences(
        userId: string,
        preferences: {
            readiness_enabled?: boolean;
            fatigue_alerts_enabled?: boolean;
            session_reminder_enabled?: boolean;
            sync_enabled?: boolean;
            squad_activities_enabled?: boolean;
        },
    ): Promise<any> {
        try {
            const { data, error } = await this.supabaseService
                .from('notification_preferences')
                .update(preferences)
                .eq('user_id', userId)
                .select()
                .single();

            if (error) {
                this.logger.error('Failed to update notification preferences', error);
                return null;
            }

            this.logger.log(`Updated notification preferences for user ${userId}`);
            return data;
        } catch (error) {
            this.logger.error('Error updating notification preferences', error);
            return null;
        }
    }

    /**
     * Create default preferences for a new user
     */
    private async createDefaultPreferences(userId: string): Promise<any> {
        try {
            const { data, error } = await this.supabaseService
                .from('notification_preferences')
                .insert({
                    user_id: userId,
                    readiness_enabled: true,
                    fatigue_alerts_enabled: false,
                    session_reminder_enabled: true,
                    sync_enabled: true,
                    squad_activities_enabled: false,
                })
                .select()
                .single();

            if (error) {
                this.logger.error('Failed to create default notification preferences', error);
                return null;
            }

            this.logger.log(`Created default notification preferences for user ${userId}`);
            return data;
        } catch (error) {
            this.logger.error('Error creating default notification preferences', error);
            return null;
        }
    }
}
