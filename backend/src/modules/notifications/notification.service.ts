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

        return this.sendPushNotification(
            userId,
            '📊 Feedback Pronto!',
            `Sua análise do ${workoutTypeName} está disponível. Veja como você se saiu!`,
            {
                type: 'feedback_ready',
                feedbackId,
                workoutType,
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
}
