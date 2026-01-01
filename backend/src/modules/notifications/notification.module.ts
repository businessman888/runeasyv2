import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController, UserNotificationController } from './notification.controller';

@Module({
    controllers: [NotificationController, UserNotificationController],
    providers: [NotificationService],
    exports: [NotificationService],
})
export class NotificationModule { }

