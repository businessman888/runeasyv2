import { Controller, Get, Param, Query } from '@nestjs/common';
import { RaceQueryDto } from './dto/race-query.dto';
import { RacesService } from './races.service';
import { Public, User } from '../../common/decorators';

@Controller('races')
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  // GET /api/races?search=rio&state=RJ&distance=10&level=intermediate
  // Public: non-sensitive listing of active races.
  @Public()
  @Get()
  findAll(@Query() query: RaceQueryDto) {
    return this.racesService.findActive(query);
  }

  // GET /api/races/suggested — based on the user's onboarding goal
  @Get('suggested')
  getSuggested(@User('id') userId: string) {
    return this.racesService.getSuggestedRaces(userId);
  }

  // GET /api/races/:idOrSlug
  // Public: non-sensitive single race lookup.
  @Public()
  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.racesService.findOne(idOrSlug);
  }
}
