import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators';
import {
  GoogleSignInDto,
  AppleSignInDto,
  RefreshSessionDto,
} from './dto/sign-in.dto';

// Public: these establish a session, so they run before any token exists.
// Stricter throttle than the global default to blunt credential/token abuse.
@Public()
@Throttle({ default: { limit: 20, ttl: 60000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  @HttpCode(200)
  signInWithGoogle(@Body() dto: GoogleSignInDto) {
    return this.authService.signInWithGoogle(dto.idToken);
  }

  @Post('apple')
  @HttpCode(200)
  signInWithApple(@Body() dto: AppleSignInDto) {
    return this.authService.signInWithApple(dto.idToken, dto.nonce, dto.fullName);
  }

  @Post('refresh')
  @HttpCode(200)
  refreshSession(@Body() dto: RefreshSessionDto) {
    return this.authService.refreshSession(dto.refreshToken);
  }
}
