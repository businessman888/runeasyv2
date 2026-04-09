import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Headers,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import { ActivitySyncService } from './activity-sync.service';
import { ConnectDeviceDto } from './dto/connect-device.dto';
import { AppleHealthSyncDto } from './dto/apple-health-sync.dto';
import { AppleHealthNormalizer } from './providers/apple-health.normalizer';

@Controller('devices')
export class DevicesController {
    private readonly logger = new Logger(DevicesController.name);

    constructor(
        private readonly devicesService: DevicesService,
        private readonly activitySyncService: ActivitySyncService,
        private readonly appleHealthNormalizer: AppleHealthNormalizer,
    ) {}

    /**
     * List all connected devices for the authenticated user.
     * GET /api/devices
     */
    @Get()
    async listDevices(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('x-user-id header required', HttpStatus.UNAUTHORIZED);
        }

        const devices = await this.devicesService.listDevices(userId);
        return { devices };
    }

    /**
     * Connect a new wearable device.
     * POST /api/devices/connect
     */
    @Post('connect')
    async connectDevice(
        @Headers('x-user-id') userId: string,
        @Body() dto: ConnectDeviceDto,
    ) {
        if (!userId) {
            throw new HttpException('x-user-id header required', HttpStatus.UNAUTHORIZED);
        }

        const device = await this.devicesService.connectDevice(userId, dto);
        return { device };
    }

    /**
     * Disconnect (remove) a wearable device.
     * DELETE /api/devices/:provider
     */
    @Delete(':provider')
    async disconnectDevice(
        @Headers('x-user-id') userId: string,
        @Param('provider') provider: string,
    ) {
        if (!userId) {
            throw new HttpException('x-user-id header required', HttpStatus.UNAUTHORIZED);
        }

        const result = await this.devicesService.disconnectDevice(userId, provider);
        return result;
    }

    /**
     * Check connection status for a specific provider.
     * GET /api/devices/status/:provider
     */
    @Get('status/:provider')
    async checkStatus(
        @Headers('x-user-id') userId: string,
        @Param('provider') provider: string,
    ) {
        if (!userId) {
            throw new HttpException('x-user-id header required', HttpStatus.UNAUTHORIZED);
        }

        const connected = await this.devicesService.isConnected(userId, provider);
        return { provider, connected };
    }

    /**
     * Get sync status for the authenticated user.
     * Returns connected providers and last synced activity.
     * GET /api/devices/sync-status
     */
    @Get('sync-status')
    async getSyncStatus(@Headers('x-user-id') userId: string) {
        if (!userId) {
            throw new HttpException('x-user-id header required', HttpStatus.UNAUTHORIZED);
        }

        const status = await this.activitySyncService.getSyncStatus(userId);
        return status;
    }

    /**
     * Ingest a batch of running workouts extracted from Apple HealthKit on iOS.
     * The mobile app is the source of truth — it reads HKWorkouts locally,
     * normalizes the shape, and POSTs here. Dedup is handled per-activity.
     *
     * POST /api/devices/apple-health/sync
     */
    @Post('apple-health/sync')
    async syncAppleHealth(
        @Headers('x-user-id') userId: string,
        @Body() dto: AppleHealthSyncDto,
    ) {
        if (!userId) {
            throw new HttpException('x-user-id header required', HttpStatus.UNAUTHORIZED);
        }

        const results = [];
        for (const activity of dto.activities) {
            try {
                const normalized = this.appleHealthNormalizer.normalize(activity, userId);
                const result = await this.activitySyncService.processAppleHealthActivity(normalized);
                results.push({ external_id: activity.external_id, ...result });
            } catch (err) {
                this.logger.error(
                    `Failed to process Apple Health activity ${activity.external_id}: ${err.message}`,
                    err,
                );
                results.push({
                    external_id: activity.external_id,
                    action: 'error',
                    error: err.message,
                });
            }
        }

        const inserted = results.filter((r) => r.action === 'inserted').length;
        const skipped = results.filter(
            (r) => r.action === 'skipped' || r.action === 'skipped_crossprovider',
        ).length;
        const errors = results.filter((r) => r.action === 'error').length;

        this.logger.log(
            `Apple Health sync for user ${userId}: ${inserted} inserted, ${skipped} skipped, ${errors} errors`,
        );

        return {
            success: true,
            inserted,
            skipped,
            errors,
            results,
        };
    }
}
