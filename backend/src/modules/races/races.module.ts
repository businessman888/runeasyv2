import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { RacesController } from './races.controller';
import { RacesService } from './races.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RacesController],
  providers: [RacesService],
  exports: [RacesService],
})
export class RacesModule {}
