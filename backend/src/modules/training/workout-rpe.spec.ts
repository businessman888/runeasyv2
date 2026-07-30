import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SetWorkoutRpeDto } from './dto/set-workout-rpe.dto';
import { CreateWorkoutTrackingDto } from './dto/workout-tracking.dto';

/**
 * Fase 0 — RPE reportado pelo atleta (Borg CR10, 1–10).
 *
 * Cobre as duas garantias que importam:
 *   1. a validação recusa valores fora da escala (o CHECK do banco é a segunda
 *      linha de defesa, não a primeira);
 *   2. o RPE é OPCIONAL no caminho de conclusão — sua ausência nunca pode
 *      derrubar um treino já corrido.
 */

const BASE_TRACKING = {
  route_points: [],
  total_distance_meters: 5000,
  duration_seconds: 1660,
};

async function errorsFor(cls: any, payload: Record<string, unknown>) {
  const dto = plainToInstance(cls, payload);
  return validate(dto as object);
}

describe('SetWorkoutRpeDto (PATCH /training/workouts/:id/rpe)', () => {
  it.each([1, 2, 5, 9, 10])('aceita %i (dentro da escala CR10)', async (rpe) => {
    expect(await errorsFor(SetWorkoutRpeDto, { rpe })).toHaveLength(0);
  });

  it.each([0, 11, -1, 100])('rejeita %i (fora da escala)', async (rpe) => {
    const errors = await errorsFor(SetWorkoutRpeDto, { rpe });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('rpe');
  });

  it('rejeita valor fracionário — a escala é discreta', async () => {
    const errors = await errorsFor(SetWorkoutRpeDto, { rpe: 7.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isInt');
  });

  it('rejeita ausência — quem chama este endpoint está afirmando um valor', async () => {
    const errors = await errorsFor(SetWorkoutRpeDto, {});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('rpe');
  });

  it('rejeita string não numérica', async () => {
    const errors = await errorsFor(SetWorkoutRpeDto, { rpe: 'muito forte' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('CreateWorkoutTrackingDto.rpe (opcional no payload de conclusão)', () => {
  it('valida sem rpe — a conclusão nunca depende da resposta', async () => {
    expect(await errorsFor(CreateWorkoutTrackingDto, BASE_TRACKING)).toHaveLength(
      0,
    );
  });

  it('aceita rpe dentro da escala quando a origem já o conhece', async () => {
    const errors = await errorsFor(CreateWorkoutTrackingDto, {
      ...BASE_TRACKING,
      rpe: 7,
    });
    expect(errors).toHaveLength(0);
  });

  it.each([0, 11])('rejeita rpe=%i mesmo sendo campo opcional', async (rpe) => {
    const errors = await errorsFor(CreateWorkoutTrackingDto, {
      ...BASE_TRACKING,
      rpe,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('rpe');
  });
});

/**
 * Persistência: o `.update()` de `completeWorkout` só pode carregar `rpe`
 * quando ele veio no payload. Espalhar `rpe: undefined` faria o PostgREST zerar
 * um valor já gravado por PATCH numa reentrada (retry da fila offline, re-sync
 * de relógio) — o dado subjetivo sumiria sem erro nenhum.
 */
describe('completeWorkout — montagem do update de rpe', () => {
  // Réplica do spread condicional usado em training.service.ts.
  const buildUpdate = (payload: { rpe?: number }) => ({
    status: 'completed',
    ...(payload.rpe != null ? { rpe: payload.rpe } : {}),
  });

  it('inclui rpe quando enviado', () => {
    expect(buildUpdate({ rpe: 8 })).toEqual({ status: 'completed', rpe: 8 });
  });

  it('OMITE a chave rpe quando ausente — não sobrescreve com null', () => {
    const update = buildUpdate({});
    expect(update).toEqual({ status: 'completed' });
    expect('rpe' in update).toBe(false);
  });

  it('preserva rpe=1, que é falsy-adjacente mas válido', () => {
    // Uma checagem `payload.rpe ?` (em vez de `!= null`) descartaria o 1.
    expect(buildUpdate({ rpe: 1 })).toEqual({ status: 'completed', rpe: 1 });
  });
});
