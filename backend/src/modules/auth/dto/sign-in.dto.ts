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

  /**
   * Full name captured from the Apple credential. Apple only returns it on the
   * VERY FIRST authorization (and never puts it in the id_token / auth metadata),
   * so the client forwards it here for the backend to persist into the profile.
   */
  @IsString()
  @IsOptional()
  fullName?: string;
}

export class RefreshSessionDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
