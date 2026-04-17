import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleSignInDto, AppleSignInDto } from './dto/sign-in.dto';

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
        return this.authService.signInWithApple(dto.idToken, dto.nonce);
    }
}
