import { IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class ValidateCodeDto {
  @IsString()
  @Length(2, 30)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code may only contain letters, numbers, dashes and underscores',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  code!: string;
}
