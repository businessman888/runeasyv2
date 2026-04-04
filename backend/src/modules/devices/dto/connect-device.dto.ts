import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class ConnectDeviceDto {
    @IsString()
    @IsNotEmpty()
    provider: string; // 'garmin' | 'fitbit' | 'polar' | 'apple_watch'

    @IsString()
    @IsNotEmpty()
    access_token: string;

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
