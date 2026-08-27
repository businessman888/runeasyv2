import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Troca de Dias T.1 — o corpo das rotas de preview e apply.
 *
 * ── DOIS MODOS, UM DTO ───────────────────────────────────────────────────────
 *
 * `mode` discrimina, e os campos de cada modo são opcionais no nível do
 * `class-validator`. A validação cruzada ("Modo 1 exige `new_days`") vive no
 * SERVIÇO, e não em decorator: ela precisa devolver a mesma recusa estruturada
 * que o resto da Fase 6 (`{ available: false, reason }`), e um
 * `BadRequestException` de pipe viraria 400 — quebrando o contrato de "recusa é
 * resultado, nunca exceção" que o cliente da 6.2/6.3 já assume.
 */

export const DAY_SWAP_MODES = ['structural', 'single'] as const;
export type DaySwapMode = (typeof DAY_SWAP_MODES)[number];

/** `YYYY-MM-DD`, o mesmo formato que a fronteira compara lexicograficamente. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class DaySwapPreviewDto {
  @IsIn(DAY_SWAP_MODES)
  mode: DaySwapMode;

  /**
   * Modo 1 — o conjunto novo, `0=Dom … 6=Sáb`. O MESMO vocabulário de
   * `user_onboarding.available_days`, para não haver tradução no meio.
   *
   * O teto de 7 é estrutural; a regra real é "mesma quantidade dos dias atuais",
   * e ela depende do calendário — logo é do serviço, não do DTO.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  new_days?: number[];

  /** Modo 2 — qual treino move. */
  @IsOptional()
  @IsString()
  workout_id?: string;

  /** Modo 2 — para qual dia. Só datas que a preview ofereceu. */
  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'target_date precisa ser YYYY-MM-DD' })
  target_date?: string;
}

export class ApplyDaySwapDto extends DaySwapPreviewDto {
  /**
   * O digest da preview que o corredor VIU — nunca um recém-buscado, ou a
   * concorrência otimista deixa de existir.
   */
  @IsString()
  expected_digest: string;
}
