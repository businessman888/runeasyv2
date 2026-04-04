import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { ActivitySyncService } from './activity-sync.service';
import { ActivitySyncProcessor } from './activity-sync.processor';

@Module({
    imports: [
        BullModule.registerQueue({ name: 'activity-sync-queue' }),
    ],
    controllers: [DevicesController],
    providers: [DevicesService, ActivitySyncService, ActivitySyncProcessor],
    exports: [DevicesService, ActivitySyncService],
})
export class DevicesModule {}
