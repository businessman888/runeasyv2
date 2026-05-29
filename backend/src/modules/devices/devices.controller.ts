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
import { HealthConnectSyncDto } from './dto/health-connect-sync.dto';
import { AppleHealthNormalizer } from './providers/apple-health.normalizer';
import { HealthConnectNormalizer } from './providers/health-connect.normalizer';

@Controller('devices')
export class DevicesController {
  private readonly logger = new Logger(DevicesController.name);

  constructor(
    private readonly devicesService: DevicesService,
    private readonly activitySyncService: ActivitySyncService,
    private readonly appleHealthNormalizer: AppleHealthNormalizer,
    private readonly healthConnectNormalizer: HealthConnectNormalizer,
  ) {}

  /**
   * List all connected devices for the authenticated user.
   * GET /api/devices
   */
  @Get()
  async listDevices(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new HttpException(
        'x-user-id header required',
        HttpStatus.UNAUTHORIZED,
      );
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
      throw new HttpException(
        'x-user-id header required',
        HttpStatus.UNAUTHORIZED,
      );
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
      throw new HttpException(
        'x-user-id header required',
        HttpStatus.UNAUTHORIZED,
      );
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
      throw new HttpException(
        'x-user-id header required',
        HttpStatus.UNAUTHORIZED,
      );
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
      throw new HttpException(
        'x-user-id header required',
        HttpStatus.UNAUTHORIZED,
      );
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
      throw new HttpException(
        'x-user-id header required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const results = [];
    for (const activity of dto.activities) {
      try {
        const normalized = this.appleHealthNormalizer.normalize(
          activity,
          userId,
        );
        // Apple Health runs always have GPS (or null for manual entries);
        // we treat them as outdoor since HealthKit doesn't expose a
        // treadmill/outdoor distinction the same way Health Connect does.
        const deviceLocalActivity = {
          ...normalized,
          environment: 'outdoor' as const,
        };
        const result =
          await this.activitySyncService.processDeviceLocalActivity(
            deviceLocalActivity,
            'apple_health',
          );
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

  /**
   * Ingest a batch of running workouts extracted from Google Health Connect
   * on Android. Mobile reads ExerciseSessionRecord locally (filtering to
   * RUNNING and RUNNING_TREADMILL), normalizes the shape, and POSTs here.
   * Dedup, plan reconciliation, gamification, and feedback enqueue all
   * happen inside ActivitySyncService.processDeviceLocalActivity.
   *
   * POST /api/devices/health-connect/sync
   */
  @Post('health-connect/sync')
  async syncHealthConnect(
    @Headers('x-user-id') userId: string,
    @Body() dto: HealthConnectSyncDto,
  ) {
    if (!userId) {
      throw new HttpException(
        'x-user-id header required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const results = [];
    for (const activity of dto.activities) {
      try {
        const normalized = this.healthConnectNormalizer.normalize(
          activity,
          userId,
        );
        if (!normalized) {
          // exercise_type wasn't a running variant — silently skip rather
          // than 4xx, so a noisy device doesn't break the whole batch.
          results.push({
            external_id: activity.external_id,
            action: 'skipped_non_running',
          });
          continue;
        }
        const result =
          await this.activitySyncService.processDeviceLocalActivity(
            normalized,
            'health_connect',
          );
        results.push({ external_id: activity.external_id, ...result });
      } catch (err) {
        this.logger.error(
          `Failed to process Health Connect activity ${activity.external_id}: ${err.message}`,
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
      (r) =>
        r.action === 'skipped' ||
        r.action === 'skipped_crossprovider' ||
        r.action === 'skipped_non_running',
    ).length;
    const errors = results.filter((r) => r.action === 'error').length;

    this.logger.log(
      `Health Connect sync for user ${userId}: ${inserted} inserted, ${skipped} skipped, ${errors} errors`,
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
