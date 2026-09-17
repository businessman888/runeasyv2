import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../../database';
import { TrainingService } from '../../training/training.service';
import { SubscriptionService } from '../../subscription/subscription.service';
import { normalizePoints } from '../../../common/effort-replay';
import {
  ActivitySyncService,
  DeviceLocalActivity,
} from '../activity-sync.service';
import { GoogleHealthTcxParser } from './google-health-tcx.parser';

/**
 * A fixture é um TCX REAL, colhido da Google Health em 2026-09-17 de uma
 * sessão de MobileTrack (GPS do celular), com as **coordenadas deslocadas**
 * por um offset fixo.
 *
 * Deslocar em vez de sintetizar preserva o que importa — 65 trackpoints, a
 * mediana de ~6 s entre pontos, um buraco real de 72 s onde o GPS perdeu sinal,
 * o `<Time>` com offset `-03:00` em vez de `Z`, e a forma exata do XML que o
 * Google emite — sem publicar onde o usuário correu.
 *
 * Isto NÃO é uma fixture escrita a partir da documentação: ela testa a
 * implementação contra o que a API realmente devolve, e não contra a nossa
 * suposição sobre ela.
 */
const TCX_REAL = fs.readFileSync(
  path.join(__dirname, '__fixtures__', 'google-health-run.tcx'),
  'utf8',
);

/** TCX mínimo, para exercitar a ambiguidade de forma do XML. */
function tcx(trackpoints: string, { multiLap = false } = {}): string {
  const track = `<Track>${trackpoints}</Track>`;
  const laps = multiLap
    ? `<Lap><Track>${trackpoints}</Track></Lap><Lap>${track}</Lap>`
    : `<Lap>${track}</Lap>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase><Activities><Activity Sport="Running">${laps}</Activity></Activities></TrainingCenterDatabase>`;
}

function ponto(time: string, lat?: string, lng?: string, alt?: string): string {
  const position =
    lat !== undefined && lng !== undefined
      ? `<Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>${lng}</LongitudeDegrees></Position>`
      : '';
  const altitude =
    alt === undefined ? '' : `<AltitudeMeters>${alt}</AltitudeMeters>`;
  return `<Trackpoint><Time>${time}</Time>${position}${altitude}</Trackpoint>`;
}

describe('GoogleHealthTcxParser', () => {
  let parser: GoogleHealthTcxParser;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    parser = new GoogleHealthTcxParser();
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── O TCX real ───────────────────────────────────────────────────────────

  it('parseia o TCX real: 65 pontos, todos utilizáveis', () => {
    const points = parser.parse(TCX_REAL);
    expect(points).toHaveLength(65);
  });

  it('todo timestamp é NUMÉRICO e positivo — o elo que silencia a rota inteira', () => {
    // `normalizePoints` faz `Number(p.timestamp)` e descarta `!isFinite || <= 0`.
    // Entregar a string ISO daria NaN e TODOS os pontos sumiriam, sem exceção
    // e sem log: a atividade entraria normal e a rota simplesmente não existiria.
    const points = parser.parse(TCX_REAL);
    for (const p of points) {
      expect(typeof p.timestamp).toBe('number');
      expect(Number.isFinite(p.timestamp)).toBe(true);
      expect(p.timestamp).toBeGreaterThan(0);
    }
  });

  it('usa `lat`/`lng`, que é o nome que `gps_route` espera', () => {
    // A ponte para `{latitude,longitude}` é feita a jusante, em
    // `toTrackingPayload`. Emitir o nome final aqui quebraria a ponte.
    const [first] = parser.parse(TCX_REAL);
    expect(Object.keys(first).sort()).toEqual(
      ['altitude', 'lat', 'lng', 'timestamp'].sort(),
    );
  });

  it('lê `<Time>` com OFFSET, não só com Z', () => {
    // Medido: o Google emite `2026-09-17T16:31:20.949-03:00`. A suposição de
    // que viria em `Z` estava errada.
    const points = parser.parse(TCX_REAL);
    expect(points[0].timestamp).toBe(
      Date.parse('2026-09-17T16:31:20.949-03:00'),
    );
  });

  it('devolve os pontos ordenados no tempo', () => {
    const points = parser.parse(TCX_REAL);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].timestamp).toBeGreaterThanOrEqual(
        points[i - 1].timestamp,
      );
    }
  });

  it('preserva o buraco de 72 s — GPS que perde sinal não invalida a rota', () => {
    const points = parser.parse(TCX_REAL);
    const gaps = points
      .slice(1)
      .map((p, i) => (p.timestamp - points[i].timestamp) / 1000);
    expect(Math.max(...gaps)).toBeCloseTo(72, 0);
  });

  // ─── Ambiguidade de forma do XML ──────────────────────────────────────────

  it('aceita UM Trackpoint (objeto) e VÁRIOS (array)', () => {
    // Todo parser de XML sem schema faz isso: um vira objeto, vários viram
    // array. Tratar só o caso do teste é garantir que o outro quebre em produção.
    const um = parser.parse(tcx(ponto('2026-09-17T10:00:00Z', '-10', '-20')));
    expect(um).toHaveLength(1);

    const varios = parser.parse(
      tcx(
        ponto('2026-09-17T10:00:00Z', '-10', '-20') +
          ponto('2026-09-17T10:00:05Z', '-10.001', '-20.001'),
      ),
    );
    expect(varios).toHaveLength(2);
  });

  it('percorre TODAS as Laps quando a corrida tem várias voltas', () => {
    const points = parser.parse(
      tcx(ponto('2026-09-17T10:00:00Z', '-10', '-20'), { multiLap: true }),
    );
    expect(points).toHaveLength(2);
  });

  // ─── Degradação ───────────────────────────────────────────────────────────

  it('descarta Trackpoint sem Position, e mantém os demais', () => {
    const points = parser.parse(
      tcx(
        ponto('2026-09-17T10:00:00Z', '-10', '-20') +
          ponto('2026-09-17T10:00:05Z') +
          ponto('2026-09-17T10:00:10Z', '-10.002', '-20.002'),
      ),
    );
    expect(points).toHaveLength(2);
  });

  it('descarta Trackpoint com tempo ilegível', () => {
    const points = parser.parse(
      tcx(
        ponto('ontem de manhã', '-10', '-20') +
          ponto('2026-09-17T10:00:05Z', '-10.001', '-20.001'),
      ),
    );
    expect(points).toHaveLength(1);
  });

  it('XML malformado vira rota vazia, NUNCA exceção', () => {
    // Rota ausente é corrida sem mapa; exceção seria corrida perdida.
    expect(parser.parse('<TrainingCenter')).toEqual([]);
    expect(parser.parse('')).toEqual([]);
    expect(parser.parse('{"nao":"e xml"}')).toEqual([]);
  });

  it('TCX sem Trackpoint nenhum vira rota vazia', () => {
    expect(parser.parse(tcx(''))).toEqual([]);
  });

  it('altitude é opcional', () => {
    const [p] = parser.parse(tcx(ponto('2026-09-17T10:00:00Z', '-10', '-20')));
    expect(p.altitude).toBeUndefined();
  });
});

/**
 * O teste que o roadmap exige: **ponta a ponta, não por elo**.
 *
 * Um teste por elo passa com a cadeia inteira quebrada. Este vai do XML cru até
 * o `normalizePoints` — o consumidor real, o mesmo que o replay de esforço e o
 * VDOT usam — passando pela ponte `{lat,lng}` → `{latitude,longitude}` que vive
 * dentro do `ActivitySyncService`.
 */
describe('TCX → gps_route → completeWorkout → normalizePoints (cadeia inteira)', () => {
  let service: ActivitySyncService;
  let completeFreeWorkout: jest.Mock<
    Promise<{ id: string } | null>,
    [string, { route_points?: unknown[] }]
  >;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Cadeia permissiva: todo método devolve a si mesma e aguardar resolve
    // `{ data: null }`. O que este teste exercita é a PONTE de `gps_route` até
    // `route_points`, não o SQL — e um mock que espelha cada `.eq()` do serviço
    // quebra a cada refactor sem nunca ter testado nada de útil.
    const vazio = { data: null, error: null };
    const chain: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (value: unknown) => void) => resolve(vazio);
          }
          return () => chain;
        },
      },
    );
    const from = jest.fn(() => chain);

    completeFreeWorkout = jest.fn<
      Promise<{ id: string } | null>,
      [string, { route_points?: unknown[] }]
    >(() => Promise.resolve({ id: 'workout-livre' }));

    const module = await Test.createTestingModule({
      providers: [
        ActivitySyncService,
        { provide: SupabaseService, useValue: { from } },
        {
          provide: TrainingService,
          useValue: { completeWorkout: jest.fn(), completeFreeWorkout },
        },
        {
          provide: SubscriptionService,
          useValue: { isProUser: jest.fn(() => Promise.resolve(false)) },
        },
      ],
    }).compile();

    service = module.get(ActivitySyncService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('os 65 pontos do TCX real chegam ao normalizePoints — nenhum se perde', async () => {
    const pontos = new GoogleHealthTcxParser().parse(TCX_REAL);
    expect(pontos.length).toBe(65);

    const activity: DeviceLocalActivity = {
      external_id: 'gh_2810671859335624360',
      source: 'google_health',
      user_id: 'a3f1c0de-0000-4000-8000-000000000001',
      name: 'Corrida',
      type: 'Run',
      start_date: '2026-09-17T19:31:20.949Z',
      distance: 1088,
      moving_time: 495,
      environment: 'outdoor',
      gps_route: pontos,
    };

    await service.processDeviceLocalActivity(activity, 'google_health');

    expect(completeFreeWorkout).toHaveBeenCalledTimes(1);
    const payload = completeFreeWorkout.mock.calls[0][1];
    const routePoints = payload.route_points as Array<Record<string, unknown>>;

    // A ponte: `gps_route` usa `lat`/`lng`, tudo a jusante espera
    // `latitude`/`longitude`. Errar aqui deixa a rota silenciosamente vazia.
    expect(routePoints).toHaveLength(65);
    expect(routePoints[0]).toHaveProperty('latitude');
    expect(routePoints[0]).toHaveProperty('longitude');

    // O CONSUMIDOR REAL. Se qualquer elo da cadeia estiver errado, isto devolve
    // menos pontos — ou zero — e nada mais no sistema reclama.
    const replay = normalizePoints(routePoints);
    expect(replay).toHaveLength(65);
    expect(replay.length).toBeGreaterThanOrEqual(2);

    // E os valores sobreviveram à viagem inteira.
    expect(replay[0].latitude).toBeCloseTo(pontos[0].lat, 6);
    expect(replay[0].longitude).toBeCloseTo(pontos[0].lng, 6);
    expect(replay[0].timestamp).toBe(pontos[0].timestamp);
  });
});
