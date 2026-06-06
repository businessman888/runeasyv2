import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { RaceQueryDto } from './dto/race-query.dto';
import { RacesService } from './races.service';

// Matches the app's convention (see TrainingController): identification is via
// the `x-user-id` header; no Bearer guard. Race data is non-sensitive listings.
@Controller('races')
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  // GET /api/races?search=rio&state=RJ&distance=10&level=intermediate
  @Get()
  findAll(@Query() query: RaceQueryDto) {
    return this.racesService.findActive(query);
  }

  // GET /api/races/suggested — based on the user's onboarding goal
  @Get('suggested')
  getSuggested(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }
    return this.racesService.getSuggestedRaces(userId);
  }

  // GET /api/races/:idOrSlug
  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.racesService.findOne(idOrSlug);
  }
}
