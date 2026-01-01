import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../../database/supabase.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class TrainingSchedulerService {
    private readonly logger = new Logger(TrainingSchedulerService.name);
    private sentReminders = new Set<string>(); // Track sent reminders to avoid duplicates

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly notificationService: NotificationService,
    ) { }

    /**
     * Check for upcoming workouts and send reminders 1 hour before
     * Runs every hour
     */
    @Cron('0 * * * *', {
        name: 'workout-reminders',
        timeZone: 'America/Sao_Paulo', // UTC-3 (Brasília time)
    })
    async sendWorkoutReminders() {
        this.logger.log('Starting workout reminder job...');

        try {
            const supabase = this.supabaseService.getClient();
            const now = new Date();

            // Get current date and time
            const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
            const currentHour = now.getHours();

            // Workouts are scheduled for 05:00 by default
            // We want to send reminder at 04:00 (1 hour before)
            const WORKOUT_HOUR = 5;
            const REMINDER_HOUR = 4;

            // Only run at the reminder hour (04:00)
            if (currentHour !== REMINDER_HOUR) {
                this.logger.debug(`Not reminder time yet (current: ${currentHour}:00, target: ${REMINDER_HOUR}:00)`);
                return;
            }

            // Find all pending workouts scheduled for today
            const { data: workouts, error } = await supabase
                .from('workouts')
                .select('id, user_id, type, distance_km, objective, scheduled_date')
                .eq('scheduled_date', currentDate)
                .eq('status', 'pending');

            if (error) {
                this.logger.error('Failed to fetch workouts', error);
                return;
            }

            if (!workouts || workouts.length === 0) {
                this.logger.log('No workouts scheduled for today');
                return;
            }

            this.logger.log(`Found ${workouts.length} workouts scheduled for today`);

            let remindersSent = 0;

            for (const workout of workouts) {
                try {
                    // Check if we already sent reminder for this workout
                    const reminderKey = `${workout.id}-${currentDate}`;
                    if (this.sentReminders.has(reminderKey)) {
                        this.logger.debug(`Reminder already sent for workout ${workout.id}`);
                        continue;
                    }

                    // Create notification in database
                    const workoutTypeName = this.getWorkoutTypeName(workout.type);
                    const title = '🏃 Hora do Treino!';
                    const description = `Você tem um ${workoutTypeName} agendado para hoje às ${WORKOUT_HOUR}:00. Vamos lá!`;

                    await this.notificationService.createNotification(
                        workout.user_id,
                        'reminder',
                        title,
                        description,
                        {
                            workout_id: workout.id,
                            workout_type: workout.type,
                            distance_km: workout.distance_km,
                            scheduled_time: `${WORKOUT_HOUR}:00`,
                            screen: 'Home', // For navigation
                        },
                    );

                    // Send push notification
                    const pushSent = await this.notificationService.sendPushNotification(
                        workout.user_id,
                        title,
                        description,
                        {
                            type: 'workout_reminder',
                            workout_id: workout.id,
                            screen: 'Home', // Deep link target
                        },
                        { channelId: 'training' },
                    );

                    if (pushSent) {
                        remindersSent++;
                        this.sentReminders.add(reminderKey);
                        this.logger.log(`Sent reminder for workout ${workout.id} to user ${workout.user_id}`);
                    }
                } catch (error) {
                    this.logger.error(`Failed to send reminder for workout ${workout.id}`, error);
                }
            }

            this.logger.log(`Workout reminder job completed: ${remindersSent} reminders sent`);

            // Clean up old reminder keys (older than 7 days)
            this.cleanupOldReminders();
        } catch (error) {
            this.logger.error('Failed to send workout reminders', error);
        }
    }

    /**
     * Helper to get Portuguese workout type name
     */
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

    /**
     * Clean up old reminder tracking to prevent memory leak
     */
    private cleanupOldReminders() {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

        // Remove all keys older than cutoff
        this.sentReminders.forEach(key => {
            const [, date] = key.split('-');
            if (date < cutoffDate) {
                this.sentReminders.delete(key);
            }
        });
    }

    /**
     * Manual trigger for testing
     */
    async triggerReminders() {
        this.logger.log('Manually triggering workout reminders...');
        await this.sendWorkoutReminders();
    }
}
