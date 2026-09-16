import { Logger } from '@nestjs/common';
import { GoogleHealthNormalizer } from './google-health.normalizer';
import { GoogleHealthDataPoint } from './google-health-api.client';

/**
 * Um teste por linha da tabela de conversões — porque cada uma delas falha em
 * SILÊNCIO a jusante, e o log apareceria no lugar errado.
 *
 * ⚠️ FIXTURE NÃO VALIDADA CONTRA PAYLOAD REAL DE CORRIDA.
 *
 * Os nomes e formatos vêm da documentação oficial (que publica
 * `steps: "6200"`, `averageHeartRateBeatsPerMinute: "148"` como STRING e
 * `distanceMillimeters: 5000000.0` como número) e do levantamento da Fase 0.
 * O único payload real que este projeto já viu foi de CAMINHADA MANUAL, sem
 * sensor. Duas coisas seguem NÃO VALIDADAS e estão marcadas nos testes:
 *   • existe campo de FC MÁXIMA no `metricsSummary`? A lista publicada não o
 *     menciona.
 *   • qual é o valor de `exerciseType` para esteira?
 * O MobileTrack do João é quem fecha as duas.
 */

const DATA_POINT_ID = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
const NAME = `users/abcd1234/dataTypes/exercise/dataPoints/${DATA_POINT_ID}`;
const USER_ID = 'user-1';

type Metrics = Record<string, number | string | undefined>;

function dataPoint(overrides: {
  name?: string | undefined;
  exerciseType?: string | undefined;
  activeDuration?: string | undefined;
  interval?: Record<string, string | undefined>;
  metricsSummary?: Metrics;
  hasGps?: boolean;
}): GoogleHealthDataPoint {
  return {
    name: 'name' in overrides ? overrides.name : NAME,
    exercise: {
      exerciseType:
        'exerciseType' in overrides ? overrides.exerciseType : 'RUNNING',
      activeDuration:
        'activeDuration' in overrides ? overrides.activeDuration : '1800s',
      interval: overrides.interval ?? {
        startTime: '2026-09-15T10:30:00Z',
        endTime: '2026-09-15T11:00:00Z',
        startUtcOffset: '-10800s',
        civilStartTime: '2026-09-15T07:30:00',
      },
      metricsSummary: overrides.metricsSummary ?? {
        caloriesKcal: 380,
        distanceMillimeters: 5000000,
        steps: '6200',
        averageSpeedMillimetersPerSecond: 2777.78,
        averagePaceSecondsPerMeter: 360,
        averageHeartRateBeatsPerMinute: '148',
        elevationGainMillimeters: 120000000,
      },
      exerciseMetadata: { hasGps: overrides.hasGps ?? true },
    },
  };
}

describe('GoogleHealthNormalizer', () => {
  let normalizer: GoogleHealthNormalizer;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    normalizer = new GoogleHealthNormalizer();
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── distância ───────────────────────────────────────────────────────────

  describe('distância', () => {
    it('converte distanceMillimeters em METROS — 5.000.000 mm = 5 km = 5.000 m', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect(activity?.distance).toBe(5000);
    });

    it('não deixa o valor cru passar: 1 km cru viraria 1.000 km e explodiria badge e reconciliação', () => {
      const activity = normalizer.normalize(
        dataPoint({ metricsSummary: { distanceMillimeters: 1000000 } }),
        USER_ID,
      );
      expect(activity?.distance).toBe(1000);
      expect(activity?.distance).not.toBe(1000000);
    });

    it('aceita distância como string, que é como protobuf serializa int64', () => {
      const activity = normalizer.normalize(
        dataPoint({ metricsSummary: { distanceMillimeters: '7500000' } }),
        USER_ID,
      );
      expect(activity?.distance).toBe(7500);
    });
  });

  // ─── duração ─────────────────────────────────────────────────────────────

  describe('duração', () => {
    it('faz PARSE da string com sufixo — "900s" vira 900, nunca aritmética direta', () => {
      const activity = normalizer.normalize(
        dataPoint({ activeDuration: '900s' }),
        USER_ID,
      );
      expect(activity?.moving_time).toBe(900);
      expect(activity?.elapsed_time).toBe(900);
    });

    it('nunca produz NaN — NaN num integer do Postgres falha como erro de INSERT, não de parsing', () => {
      const activity = normalizer.normalize(
        dataPoint({ activeDuration: '1800s' }),
        USER_ID,
      );
      expect(Number.isNaN(activity?.moving_time)).toBe(false);
      // A conta ingênua que o normalizer antigo fazia:
      expect(Number('1800s') / 1000).toBeNaN();
    });

    it('descarta o dataPoint quando a duração não é parseável', () => {
      expect(
        normalizer.normalize(dataPoint({ activeDuration: '1800' }), USER_ID),
      ).toBeNull();
      expect(
        normalizer.normalize(dataPoint({ activeDuration: undefined }), USER_ID),
      ).toBeNull();
    });
  });

  // ─── passos ──────────────────────────────────────────────────────────────

  describe('passos', () => {
    it('converte a string "6200" em número', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect(activity?.steps).toBe(6200);
    });

    it('aceita número quando o Google mandar número', () => {
      const activity = normalizer.normalize(
        dataPoint({ metricsSummary: { steps: 1284 } }),
        USER_ID,
      );
      expect(activity?.steps).toBe(1284);
    });
  });

  // ─── pace (Mina 1) ───────────────────────────────────────────────────────

  describe('pace', () => {
    it('sai de averageSpeedMillimetersPerSecond: 1e6 / mm/s → segundos/km INTEIRO', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      // 2777,78 mm/s ≈ 10 km/h → 360 s/km = 6:00/km
      expect(activity?.average_pace).toBe(360);
      expect(Number.isInteger(activity?.average_pace)).toBe(true);
    });

    it('ignora averagePaceSecondsPerMeter, que chega arredondado a uma casa', () => {
      const activity = normalizer.normalize(
        dataPoint({
          metricsSummary: {
            distanceMillimeters: 5000000,
            averageSpeedMillimetersPerSecond: 3000,
            averagePaceSecondsPerMeter: 999,
          },
        }),
        USER_ID,
      );
      expect(activity?.average_pace).toBe(333);
    });

    it('cai para distância/tempo quando não há velocidade — na MESMA unidade', () => {
      const activity = normalizer.normalize(
        dataPoint({
          activeDuration: '1800s',
          metricsSummary: { distanceMillimeters: 5000000 },
        }),
        USER_ID,
      );
      expect(activity?.average_pace).toBe(360);
    });

    it('NUNCA entrega valor abaixo de 20, que pace-format.ts multiplicaria por 60 em silêncio', () => {
      // 1e6 / 100000 mm/s = 10 s/km — fisicamente impossível, e exatamente o
      // valor que a heurística legada transformaria em 600.
      const activity = normalizer.normalize(
        dataPoint({
          metricsSummary: {
            distanceMillimeters: 5000000,
            averageSpeedMillimetersPerSecond: 100000,
          },
        }),
        USER_ID,
      );
      expect(activity?.average_pace).toBeUndefined();
    });
  });

  // ─── elevação ────────────────────────────────────────────────────────────

  describe('elevação', () => {
    it('converte elevationGainMillimeters em METROS — 120.000.000 mm = 120 m', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect(activity?.elevation_gain).toBe(120);
    });

    it('fica indefinida quando o campo não vem, em vez de virar 0 inventado', () => {
      const activity = normalizer.normalize(
        dataPoint({ metricsSummary: { distanceMillimeters: 5000000 } }),
        USER_ID,
      );
      expect(activity?.elevation_gain).toBeUndefined();
    });
  });

  // ─── data/hora ───────────────────────────────────────────────────────────

  describe('data/hora', () => {
    it('usa o CIVIL da fonte + startUtcOffset, sem reconverter do UTC', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect(activity?.start_date).toBe('2026-09-15T07:30:00-03:00');
    });

    it('preserva o instante: o civil com offset aponta para o mesmo UTC do startTime', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect(new Date(activity?.start_date ?? '').toISOString()).toBe(
        '2026-09-15T10:30:00.000Z',
      );
    });

    it('formata offset zero como +00:00', () => {
      const activity = normalizer.normalize(
        dataPoint({
          interval: {
            startTime: '2026-04-20T08:00:00Z',
            startUtcOffset: '0s',
            civilStartTime: '2026-04-20T08:00:00',
          },
        }),
        USER_ID,
      );
      expect(activity?.start_date).toBe('2026-04-20T08:00:00+00:00');
    });

    it('cai para o startTime físico quando não há civil — e registra que é fallback', () => {
      const activity = normalizer.normalize(
        dataPoint({ interval: { startTime: '2026-09-15T10:30:00Z' } }),
        USER_ID,
      );
      expect(activity?.start_date).toBe('2026-09-15T10:30:00Z');
    });

    it('descarta quando não há hora nenhuma utilizável', () => {
      expect(
        normalizer.normalize(dataPoint({ interval: {} }), USER_ID),
      ).toBeNull();
    });
  });

  // ─── external_id ─────────────────────────────────────────────────────────

  describe('external_id', () => {
    it('usa o ÚLTIMO segmento do name com prefixo gh_', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect(activity?.external_id).toBe(`gh_${DATA_POINT_ID}`);
      expect(activity?.data_point_id).toBe(DATA_POINT_ID);
    });

    it('não usa o name inteiro — ele vazaria o healthUserId para dentro da coluna', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect(activity?.external_id).not.toContain('abcd1234');
      expect(activity?.external_id).not.toContain('users/');
    });

    it('cabe no @MaxLength(120) do DTO', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect((activity?.external_id ?? '').length).toBeLessThanOrEqual(120);
    });

    it('descarta quando o id passaria de 120 chars', () => {
      const huge = 'x'.repeat(200);
      expect(
        normalizer.normalize(
          dataPoint({
            name: `users/abcd1234/dataTypes/exercise/dataPoints/${huge}`,
          }),
          USER_ID,
        ),
      ).toBeNull();
    });

    it('descarta dataPoint sem name — sem chave de idempotência, reentrega duplicaria', () => {
      expect(
        normalizer.normalize(dataPoint({ name: undefined }), USER_ID),
      ).toBeNull();
    });
  });

  // ─── frequência cardíaca ─────────────────────────────────────────────────

  describe('frequência cardíaca', () => {
    it('lê a FC média de averageHeartRateBeatsPerMinute, que vem como STRING', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect(activity?.average_heartrate).toBe(148);
    });

    it('⚠️ NÃO VALIDADA — FC MÁXIMA não consta na lista publicada do metricsSummary; leitura defensiva', () => {
      const semMaxima = normalizer.normalize(dataPoint({}), USER_ID);
      expect(semMaxima?.max_heartrate).toBeUndefined();

      const comMaxima = normalizer.normalize(
        dataPoint({
          metricsSummary: {
            distanceMillimeters: 5000000,
            maxHeartRateBeatsPerMinute: '176',
          },
        }),
        USER_ID,
      );
      expect(comMaxima?.max_heartrate).toBe(176);
    });

    it('não inventa máxima a partir da média', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect(activity?.max_heartrate).not.toBe(activity?.average_heartrate);
    });
  });

  // ─── filtro de tipo ──────────────────────────────────────────────────────

  describe('filtro de tipo', () => {
    it('rejeita WALKING devolvendo null', () => {
      expect(
        normalizer.normalize(dataPoint({ exerciseType: 'WALKING' }), USER_ID),
      ).toBeNull();
    });

    it('rejeita qualquer tipo que não seja corrida', () => {
      for (const type of ['BIKING', 'AEROBIC_WORKOUT', 'SWIMMING', 'HIKING']) {
        expect(
          normalizer.normalize(dataPoint({ exerciseType: type }), USER_ID),
        ).toBeNull();
      }
    });

    it('rejeita tipo AUSENTE — a fresta do HealthConnectNormalizer NÃO é copiada', () => {
      // Lá, `exercise_type === undefined` vira 'outdoor', porque o mobile já
      // filtrou antes. Aqui o dado vem direto da nuvem, sem filtro nenhum.
      expect(
        normalizer.normalize(dataPoint({ exerciseType: undefined }), USER_ID),
      ).toBeNull();
    });

    it('aceita RUNNING como outdoor', () => {
      const activity = normalizer.normalize(dataPoint({}), USER_ID);
      expect(activity?.environment).toBe('outdoor');
      expect(activity?.type).toBe('Run');
      expect(activity?.source).toBe('google_health');
      expect(activity?.user_id).toBe(USER_ID);
    });

    it('⚠️ NÃO VALIDADO — a grafia de esteira não está publicada; as duas plausíveis mapeiam para treadmill', () => {
      for (const type of ['RUNNING_TREADMILL', 'TREADMILL_RUNNING']) {
        expect(
          normalizer.normalize(dataPoint({ exerciseType: type }), USER_ID)
            ?.environment,
        ).toBe('treadmill');
      }
    });
  });

  // ─── rota (Commit E) ─────────────────────────────────────────────────────

  it('expõe hasGps sem buscar rota nenhuma — o TCX é o Commit E', () => {
    expect(normalizer.normalize(dataPoint({}), USER_ID)?.has_gps).toBe(true);
    expect(
      normalizer.normalize(dataPoint({ hasGps: false }), USER_ID)?.has_gps,
    ).toBe(false);
    expect(
      normalizer.normalize(dataPoint({}), USER_ID)?.gps_route,
    ).toBeUndefined();
  });
});
