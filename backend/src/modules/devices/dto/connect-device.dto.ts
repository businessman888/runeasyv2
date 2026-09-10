import { IsString, IsOptional, IsNotEmpty, IsIn } from 'class-validator';
import { VALID_PROVIDERS, DeviceProvider } from '../device-providers';

export class ConnectDeviceDto {
  // `@IsIn` sobre a MESMA constante que o service usa: a lista de provedores
  // válidos existe num lugar só (`device-providers.ts`), então a borda e a
  // guarda de profundidade não têm como divergir. O `ValidationPipe` global
  // rejeita com 400 antes de chegar ao service.
  @IsString()
  @IsNotEmpty()
  @IsIn(VALID_PROVIDERS)
  provider: DeviceProvider;

  // Optional: apple_health has no access token (local iOS permission only).
  @IsString()
  @IsOptional()
  access_token?: string;

  @IsString()
  @IsOptional()
  refresh_token?: string;

  @IsString()
  @IsOptional()
  expires_at?: string; // ISO timestamp

  @IsString()
  @IsOptional()
  scope?: string;

  @IsString()
  @IsOptional()
  provider_user_id?: string;

  @IsString()
  @IsOptional()
  device_name?: string;
}
