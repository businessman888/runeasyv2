import {
  Controller,
  Get,
  Post,
  Param,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SharingService } from './sharing.service';

@Controller('sharing')
export class SharingController {
  private readonly logger = new Logger(SharingController.name);

  constructor(private readonly sharingService: SharingService) {}

  @Get('workout/:workoutId/card-data')
  async getCardData(
    @Headers('x-user-id') userId: string,
    @Param('workoutId') workoutId: string,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const data = await this.sharingService.getCardData(userId, workoutId);
      return { success: true, data };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to get card data', error);
      throw new HttpException(
        'Failed to get card data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Phase 2 stub — server-side card rendering */
  @Post('render')
  async renderCard() {
    throw new HttpException(
      'Server-side rendering not yet implemented',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
