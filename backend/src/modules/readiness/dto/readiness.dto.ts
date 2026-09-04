import {
  IsString,
  IsNumber,
  Min,
  Max,
  ValidateNested,
  IsOptional,
  IsDefined,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReadinessAnswersDto {
  @IsNumber()
  @Min(1, { message: 'sleep must be at least 1' })
  @Max(5, { message: 'sleep must be at most 5' })
  sleep: number;

  @IsNumber()
  @Min(1, { message: 'legs must be at least 1' })
  @Max(5, { message: 'legs must be at most 5' })
  legs: number;

  @IsNumber()
  @Min(1, { message: 'mood must be at least 1' })
  @Max(5, { message: 'mood must be at most 5' })
  mood: number;

  @IsNumber()
  @Min(1, { message: 'stress must be at least 1' })
  @Max(5, { message: 'stress must be at most 5' })
  stress: number;

  @IsNumber()
  @Min(1, { message: 'motivation must be at least 1' })
  @Max(5, { message: 'motivation must be at most 5' })
  motivation: number;
}

export class ReadinessCheckInDto {
  /**
   * ⚠️ COMPAT ≤1.0.9 — ACEITO E IGNORADO. Nunca leia este campo.
   *
   * A identidade do corredor vem de `@User('id')`, derivado do Bearer token
   * validado pelo SupabaseAuthGuard. Ler daqui era um IDOR: qualquer usuário
   * autenticado gravava check-in (e queimava orçamento de IA) no id de outro.
   *
   * O campo CONTINUA declarado só porque o app 1.0.9, que está em produção,
   * envia `userId` no body — e o ValidationPipe global roda com
   * `forbidNonWhitelisted: true` (main.ts:85-89), então removê-lo daria 400
   * em todo install existente. Remover quando o mobile parar de enviar.
   */
  @IsOptional()
  @IsString()
  userId?: string;

  /**
   * `@IsDefined` é obrigatório aqui: `@ValidateNested` PULA a validação quando
   * o valor é `undefined`. Sem ele, um body `{ setNumber: 1 }` atravessa o
   * pipe e estoura mais adiante em `answers.sleep` — 500 no lugar de 400.
   */
  @IsDefined({ message: 'answers object is required' })
  @ValidateNested()
  @Type(() => ReadinessAnswersDto)
  answers: ReadinessAnswersDto;

  @IsOptional()
  @IsNumber()
  setNumber?: number;
}
