import { BODY_SIZE_LIMIT, BODY_SIZE_LIMIT_BYTES } from './body-limit';

/**
 * O teto do corpo da requisição não é preferência de configuração — é uma
 * consequência aritmética de quantos pontos de GPS uma corrida gera.
 *
 * Estes testes prendem a regressão que motivou o limite: até 2026-08-07 valia o
 * default de 100 KB do body-parser, e toda corrida ao ar livre acima de ~6,5 km
 * falhava com `PayloadTooLargeError` → HTTP 500. O treino simplesmente não era
 * concluído, e o erro não dizia nada sobre distância.
 */

/**
 * Um ponto no formato REAL que o `locationTask` grava — precisão dupla em todos
 * os campos numéricos, que é o que o `expo-location` entrega.
 */
const realPoint = (i: number) => ({
  latitude: -23.550519943237305 + i * 1e-7,
  longitude: -46.63330943584442 + i * 1e-7,
  altitude: 760.4000244140625,
  timestamp: 1754600000000 + i * 4000,
  speed: 2.7799999713897705,
  accuracy: 4.900000095367432,
});

/**
 * Pontos de uma corrida de `km` quilômetros.
 *
 * ~1 ponto a cada 11 m: o `locationTask` exige ≥10 m entre pontos
 * (MIN_DISTANCE_METERS) e o `expo-location` emite a cada 2 s
 * (timeInterval: 2000), o que a um pace de corrida dá pouco mais que o piso.
 */
const runPayloadBytes = (km: number): number => {
  const n = Math.round((km * 1000) / 11);
  return Buffer.byteLength(
    JSON.stringify({
      route_points: Array.from({ length: n }, (_, i) => realPoint(i)),
      total_distance_meters: km * 1000,
      duration_seconds: Math.round(km * 330),
      started_at: '2026-08-07T07:00:00-03:00',
      external_id: 'plan_00000000-0000-0000-0000-000000000000',
      source: 'phone',
      environment: 'outdoor',
    }),
  );
};

describe('BODY_SIZE_LIMIT', () => {
  it('o default de 100 KB REJEITAVA corridas comuns — o bug que isto corrige', () => {
    const DEFAULT_BODY_PARSER_LIMIT = 100 * 1024;

    expect(runPayloadBytes(5)).toBeLessThan(DEFAULT_BODY_PARSER_LIMIT);
    // A partir daqui o usuário terminava a corrida e levava um 500.
    expect(runPayloadBytes(8)).toBeGreaterThan(DEFAULT_BODY_PARSER_LIMIT);
    expect(runPayloadBytes(10)).toBeGreaterThan(DEFAULT_BODY_PARSER_LIMIT);
    expect(runPayloadBytes(21.1)).toBeGreaterThan(DEFAULT_BODY_PARSER_LIMIT);
  });

  it('cabe uma maratona, com folga', () => {
    const maratona = runPayloadBytes(42.2);
    expect(maratona).toBeLessThan(BODY_SIZE_LIMIT_BYTES);
    // Folga de pelo menos 2×: rota mais densa (GPS melhor, pace mais lento) não
    // pode voltar a estourar o teto.
    expect(maratona * 2).toBeLessThan(BODY_SIZE_LIMIT_BYTES);
  });

  it('a string e o número descrevem o MESMO limite', () => {
    // O Express lê a string; os testes leem o número. Divergir faria este
    // arquivo atestar um limite que o servidor não aplica.
    expect(BODY_SIZE_LIMIT).toBe('2mb');
    expect(BODY_SIZE_LIMIT_BYTES).toBe(2 * 1024 * 1024);
  });

  it('não é grande a ponto de virar vetor de abuso', () => {
    // Um teto alto demais deixa qualquer cliente ocupar memória do processo à
    // vontade. 2 MB cobre a maratona e para bem antes disso.
    expect(BODY_SIZE_LIMIT_BYTES).toBeLessThanOrEqual(5 * 1024 * 1024);
  });
});
