import { Global, Module } from '@nestjs/common';
import { VolumePlannerService } from './volume-planner.service';

@Global()
@Module({
  providers: [VolumePlannerService],
  exports: [VolumePlannerService],
})
export class VolumePlannerModule {}
