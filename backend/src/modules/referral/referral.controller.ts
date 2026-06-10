import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ReferralService } from './referral.service';
import { ValidateCodeDto } from './dto/validate-code.dto';
import { ApplyCodeDto } from './dto/apply-code.dto';
import { UserIdThrottlerGuard } from './user-id-throttler.guard';
import { User } from '../../common/decorators';

@Controller('referral')
@UseGuards(UserIdThrottlerGuard)
@SkipThrottle()
export class ReferralController {
  private readonly logger = new Logger(ReferralController.name);

  constructor(private readonly referralService: ReferralService) {}

  @Post('validate')
  @HttpCode(200)
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  async validate(
    @User('id') userId: string,
    @Body() dto: ValidateCodeDto,
  ) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }
    return this.referralService.validate(dto.code);
  }

  @Post('apply')
  @HttpCode(200)
  async apply(@User('id') userId: string, @Body() dto: ApplyCodeDto) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }
    return this.referralService.apply(userId, dto.code);
  }

  @Get('status')
  async status(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException('User ID required', HttpStatus.UNAUTHORIZED);
    }
    return this.referralService.getStatus(userId);
  }
}
