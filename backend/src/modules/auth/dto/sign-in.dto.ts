import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class GoogleSignInDto {
    @IsString()
    @IsNotEmpty()
    idToken: string;
}

export class AppleSignInDto {
    @IsString()
    @IsNotEmpty()
    idToken: string;

    @IsString()
    @IsOptional()
    nonce?: string;
}

export class RefreshSessionDto {
    @IsString()
    @IsNotEmpty()
    refreshToken: string;
}
