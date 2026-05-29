import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ElevationService } from './elevation.service';

/**
 * Consumes the `elevation-queue`. Each `enrich` job runs the best-effort
 * Mapbox Terrain-DEM enrichment for one activity. ElevationService never
 * throws on data errors, so jobs don't churn.
 */
@Processor('elevation-queue')
export class ElevationProcessor extends WorkerHost {
  private readonly logger = new Logger(ElevationProcessor.name);

  constructor(private readonly elevationService: ElevationService) {
    super();
  }

  async process(
    job: Job<{ activityId: string }, unknown, string>,
  ): Promise<unknown> {
    if (job.name === 'enrich') {
      const { activityId } = job.data;
      this.logger.log(
        `Enriching elevation for activity ${activityId} (job ${job.id})`,
      );
      await this.elevationService.enrichActivity(activityId);
      return { success: true };
    }
    return { ignored: true };
  }
}
