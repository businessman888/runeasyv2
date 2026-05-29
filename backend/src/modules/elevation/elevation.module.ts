import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ElevationService } from './elevation.service';
import { ElevationProcessor } from './elevation.processor';

/**
 * Async Mapbox Terrain-DEM elevation enrichment.
 *
 * Producer side (TrainingService) just registers the `elevation-queue` to
 * inject the Queue and add `enrich` jobs — same split as the feedback queue.
 * SupabaseService and ConfigService are global, so no extra imports needed.
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'elevation-queue' })],
  providers: [ElevationService, ElevationProcessor],
  exports: [ElevationService, BullModule],
})
export class ElevationModule {}
