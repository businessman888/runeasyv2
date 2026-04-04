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
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import { ActivitySyncService } from './activity-sync.service';
import { ConnectDeviceDto } from './dto/connect-device.dto';

@Controller('devices')
export class DevicesController {
    constructor(
        private readonly devicesService: DevicesService,
        private readonly activitySyncService: ActivitySyncService,
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
}
