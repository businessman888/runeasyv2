import {
    Controller,
    Post,
    Get,
    Patch,
    Body,
    Headers,
    Param,
    Query,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    /**
     * Get all notifications for the authenticated user
     */
    @Get()
    async getNotifications(
        @Headers('x-user-id') userId: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const notifications = await this.notificationService.getUserNotifications(
            userId,
            limit ? parseInt(limit) : 50,
            offset ? parseInt(offset) : 0,
        );

        return { notifications };
    }

    /**
     * Get unread notification count
     */
    @Get('unread-count')
    async getUnreadCount(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const count = await this.notificationService.getUnreadCount(userId);
        return { count };
    }

    /**
     * Mark a notification as read
     */
    @Patch(':id/read')
    async markAsRead(
        @Headers('x-user-id') userId: string,
        @Param('id') notificationId: string,
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        if (!notificationId) {
            throw new HttpException('Notification ID required', HttpStatus.BAD_REQUEST);
        }

        const success = await this.notificationService.markAsRead(notificationId, userId);
        return { success };
    }

    /**
     * Get user's notification preferences
     */
    @Get('preferences')
    async getPreferences(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const preferences = await this.notificationService.getPreferences(userId);
        return { preferences };
    }

    /**
     * Update user's notification preferences
     */
    @Patch('preferences')
    async updatePreferences(
        @Headers('x-user-id') userId: string,
        @Body() preferences: {
            readiness_enabled?: boolean;
            fatigue_alerts_enabled?: boolean;
            session_reminder_enabled?: boolean;
            sync_enabled?: boolean;
            squad_activities_enabled?: boolean;
        },
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const updated = await this.notificationService.updatePreferences(userId, preferences);
        return { preferences: updated };
    }
}

// Keep legacy endpoints on /users path
@Controller('users')
export class UserNotificationController {
    constructor(private readonly notificationService: NotificationService) { }

    /**
     * Save user's push token
     */
    @Post('push-token')
    async savePushToken(
        @Headers('x-user-id') userId: string,
        @Body() dto: { push_token: string },
    ) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        if (!dto.push_token) {
            throw new HttpException('Push token required', HttpStatus.BAD_REQUEST);
        }

        await this.notificationService.savePushToken(userId, dto.push_token);

        return { success: true };
    }

    /**
     * Test push notification (for development)
     */
    @Post('test-notification')
    async testNotification(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
        }

        const sent = await this.notificationService.sendPushNotification(
            userId,
            '🧪 Notificação de Teste',
            'Se você está vendo isso, as notificações estão funcionando!',
            { type: 'test' },
        );

        return { success: sent };
    }
}

