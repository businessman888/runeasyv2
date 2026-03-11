import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class ReadinessScheduler {
    private readonly logger = new Logger(ReadinessScheduler.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly notificationService: NotificationService,
    ) { }

    /**
     * Unlock daily readiness check-in at 3:00 AM every day
     */
    @Cron('0 3 * * *', {
        name: 'unlock-daily-readiness',
        timeZone: 'America/Sao_Paulo', // UTC-3 (Brasília time)
    })
    async unlockDailyReadiness() {
        this.logger.log('Starting daily readiness unlock job...');

        try {
            const supabase = this.supabaseService.getClient();
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

            // Get yesterday's date
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

            // 1. Find all users who completed a workout YESTERDAY
            const { data: usersWithWorkouts } = await supabase
                .from('activities')
                .select('user_id')
                .eq('type', 'Run')
                .gte('start_date', `${yesterdayStr}T00:00:00Z`)
                .lte('start_date', `${yesterdayStr}T23:59:59Z`);

            if (!usersWithWorkouts || usersWithWorkouts.length === 0) {
                this.logger.log('No users trained yesterday - no check-ins to unlock');
                return;
            }

            // Get unique user IDs
            const uniqueUserIds: string[] = [...new Set(usersWithWorkouts.map((a: any) => a.user_id as string))];
            this.logger.log(`Found ${uniqueUserIds.length} users eligible for check-in`);

            let unlockedCount = 0;
            let notificationsSent = 0;

            // 2. For each user, create/update their check-in availability
            for (const userId of uniqueUserIds) {
                try {
                    // Upsert check-in record for today
                    const { error: upsertError } = await supabase
                        .from('readiness_checkins')
                        .upsert({
                            user_id: userId,
                            checkin_date: today,
                            is_available: true,
                            updated_at: new Date().toISOString(),
                        }, {
                            onConflict: 'user_id,checkin_date',
                            ignoreDuplicates: false,
                        });

                    if (upsertError) {
                        this.logger.error(`Failed to unlock check-in for user ${userId}`, upsertError);
                        continue;
                    }

                    unlockedCount++;

                    // 3. Create persistent notification in database
                    await this.notificationService.createNotification(
                        userId,
                        'system',
                        '☀️ Bom dia!',
                        'Seu check-in diário está disponível. Como você está se sentindo hoje?',
                        {
                            screen: 'Evolution', // Navigation target
                            type: 'daily_readiness',
                        },
                    );

                    // 4. Send push notification
                    const notificationSent = await this.notificationService.sendDailyReadinessNotification(userId);
                    if (notificationSent) {
                        notificationsSent++;
                    }
                } catch (error) {
                    this.logger.error(`Error processing user ${userId}`, error);
                }
            }

            this.logger.log(
                `Daily readiness unlock completed: ${unlockedCount} unlocked, ${notificationsSent} notifications sent`
            );
        } catch (error) {
            this.logger.error('Failed to unlock daily readiness', error);
        }
    }

    /**
     * Manual trigger for testing (can be called via admin endpoint)
     */
    async triggerUnlock() {
        this.logger.log('Manually triggering daily readiness unlock...');
        await this.unlockDailyReadiness();
    }
}
