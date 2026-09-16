import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import {
  HttpStatus,
  Logger,
  RawBodyRequest,
  ServiceUnavailableException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { BODY_SIZE_LIMIT } from '../../common/config/body-limit';
import type { Request, Response } from 'express';
import request from 'supertest';
import { KeyObject, generateKeyPairSync, sign as cryptoSign } from 'crypto';
import {
  GoogleHealthWebhookController,
  googleHealthJobId,
} from './google-health-webhook.controller';
import {
  GOOGLE_HEALTH_KEYSET_FETCHER,
  GoogleHealthSignatureVerifier,
  TinkKeysetJson,
} from './providers/google-health-signature.verifier';
import {
  GOOGLE_HEALTH_SYNC_QUEUE,
  GoogleHealthNotification,
  GoogleHealthSyncJobData,
  GoogleHealthWebhookBody,
} from './providers/google-health-webhook.types';

// ─── Ferramentas do teste ────────────────────────────────────────────────────
//
// O verificador aqui é o REAL, não um mock: o que este spec precisa provar é
// que o controller recusa ANTES de enfileirar, e um verificador mockado
// provaria só que o mock foi chamado. O que fica falso é apenas o keyset, com
// um par de chaves local — daí o fetcher injetável.

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest > 0) byte |= 0x80;
    bytes.push(byte);
  } while (rest > 0);
  return Buffer.from(bytes);
}

function varintField(field: number, value: number): Buffer {
  return Buffer.concat([varint(field << 3), varint(value)]);
}

function bytesField(field: number, payload: Buffer): Buffer {
  return Buffer.concat([
    varint((field << 3) | 2),
    varint(payload.length),
    payload,
  ]);
}

/** Keyset Tink com uma chave ENABLED: SHA256 / P-256 / IEEE_P1363. */
function keysetWith(keyId: number, publicKey: KeyObject): TinkKeysetJson {
  const jwk = publicKey.export({ format: 'jwk' });
  const params = Buffer.concat([
    varintField(1, 3),
    varintField(2, 2),
    varintField(3, 2),
  ]);
  const value = Buffer.concat([
    bytesField(2, params),
    bytesField(3, Buffer.from(String(jwk.x), 'base64url')),
    bytesField(4, Buffer.from(String(jwk.y), 'base64url')),
  ]).toString('base64');

  return {
    primaryKeyId: keyId,
    key: [
      {
        keyId,
        status: 'ENABLED',
        outputPrefixType: 'TINK',
        keyData: {
          typeUrl: 'type.googleapis.com/google.crypto.tink.EcdsaPublicKey',
          value,
          keyMaterialType: 'ASYMMETRIC_PUBLIC',
        },
      },
    ],
  };
}

function signatureHeader(
  keyId: number,
  privateKey: KeyObject,
  rawBody: Buffer,
): string {
  const signature = cryptoSign('sha256', rawBody, {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  const prefix = Buffer.alloc(5);
  prefix[0] = 0x01;
  prefix.writeUInt32BE(keyId, 1);
  return Buffer.concat([prefix, signature]).toString('base64');
}

const KEY_ID = 257403691;
const SECRET = 'Bearer s3gr3d0-longo-do-subscriber';

interface JobSpec {
  name: string;
  data: unknown;
  opts: Record<string, unknown>;
}

interface QueueMock {
  addBulk: jest.Mock<Promise<unknown>, [JobSpec[]]>;
}

/** Retenção por IDADE — o payload carrega identificador de dado de saúde. */
const RETENCAO = {
  removeOnComplete: { age: 60 * 60 },
  removeOnFail: { age: 24 * 60 * 60 },
};

interface ResponseMock {
  status: jest.Mock<ResponseMock, [number]>;
}

function responseMock(): ResponseMock {
  const res = {} as ResponseMock;
  res.status = jest.fn<ResponseMock, [number]>(() => res);
  return res;
}

/** `secret: null` = variável ausente do ambiente (passar `undefined` cairia no default). */
async function buildController(
  publicKey: KeyObject,
  secret: string | null = SECRET,
) {
  const queue: QueueMock = {
    addBulk: jest.fn<Promise<unknown>, [JobSpec[]]>(() => Promise.resolve({})),
  };

  const module = await Test.createTestingModule({
    controllers: [GoogleHealthWebhookController],
    providers: [
      GoogleHealthSignatureVerifier,
      {
        provide: GOOGLE_HEALTH_KEYSET_FETCHER,
        useValue: () => Promise.resolve(keysetWith(KEY_ID, publicKey)),
      },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) =>
            key === 'GOOGLE_HEALTH_WEBHOOK_SECRET'
              ? (secret ?? undefined)
              : undefined,
        },
      },
      { provide: getQueueToken(GOOGLE_HEALTH_SYNC_QUEUE), useValue: queue },
    ],
  }).compile();

  return {
    controller: module.get(GoogleHealthWebhookController),
    queue,
  };
}

interface CallOptions {
  authorization?: string;
  signature?: string;
  /** Bytes exatos do fio. `body` sai daqui, como o express faria. */
  rawBody?: Buffer;
  /** Sobrepõe o corpo parseado, para simular divergência com o `rawBody`. */
  body?: unknown;
}

async function call(
  controller: GoogleHealthWebhookController,
  options: CallOptions,
): Promise<ResponseMock> {
  const res = responseMock();
  const rawBody = options.rawBody;
  const body =
    'body' in options
      ? options.body
      : rawBody
        ? (JSON.parse(rawBody.toString('utf8')) as unknown)
        : undefined;

  await controller.handle(
    options.authorization,
    options.signature,
    body as GoogleHealthWebhookBody,
    { rawBody } as RawBodyRequest<Request>,
    res as unknown as Response,
  );

  return res;
}

const NOTIFICATION: GoogleHealthNotification = {
  version: '1',
  clientProvidedSubscriptionName: 'a3f1c0de-0000-4000-8000-000000000001',
  healthUserId: 'health-user-9',
  operation: 'UPSERT',
  dataType: 'exercise',
  intervals: [
    {
      physicalTimeInterval: {
        startTime: '2026-09-15T10:00:00Z',
        endTime: '2026-09-15T10:45:00Z',
      },
      civilIso8601TimeInterval: {
        startTime: '2026-09-15T07:00:00-03:00',
        endTime: '2026-09-15T07:45:00-03:00',
      },
    },
  ],
};

function rawOf(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload));
}

describe('GoogleHealthWebhookController', () => {
  let privateKey: KeyObject;
  let publicKey: KeyObject;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── 1. Segredo ────────────────────────────────────────────────────────────

  it('recusa com 401 quando o segredo não está configurado', async () => {
    const { controller, queue } = await buildController(publicKey, null);
    const raw = rawOf({ data: NOTIFICATION });

    await expect(
      call(controller, {
        authorization: SECRET,
        signature: signatureHeader(KEY_ID, privateKey, raw),
        rawBody: raw,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('trata segredo vazio como ausente — nunca compara dois undefined', async () => {
    const { controller, queue } = await buildController(publicKey, '   ');

    await expect(
      call(controller, { body: { type: 'verification' } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  // ─── 2. Authorization ──────────────────────────────────────────────────────

  it('recusa com 401 sem header Authorization (passo 2 do handshake)', async () => {
    const { controller, queue } = await buildController(publicKey);

    await expect(
      call(controller, { body: { type: 'verification' } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('recusa com 401 quando o Authorization não bate', async () => {
    const { controller, queue } = await buildController(publicKey);
    const raw = rawOf({ data: NOTIFICATION });

    await expect(
      call(controller, {
        authorization: 'Bearer errado',
        signature: signatureHeader(KEY_ID, privateKey, raw),
        rawBody: raw,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('não lança RangeError com Authorization de tamanho diferente (Mina 5)', async () => {
    const { controller } = await buildController(publicKey);

    // Comprimento absurdo dos dois lados: o sha256 iguala em 32 bytes, então o
    // `timingSafeEqual` não tem como estourar.
    await expect(
      call(controller, {
        authorization: 'x'.repeat(5000),
        body: { type: 'verification' },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      call(controller, { authorization: 'x', body: { type: 'verification' } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // ─── 3. Handshake ──────────────────────────────────────────────────────────

  it('responde 200 ao passo 1 do handshake, SEM exigir assinatura', async () => {
    const { controller, queue } = await buildController(publicKey);

    const res = await call(controller, {
      authorization: SECRET,
      body: { type: 'verification' },
    });

    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('loga que passou pelo caminho de verificação', async () => {
    const { controller } = await buildController(publicKey);
    const log = jest.spyOn(Logger.prototype, 'log');

    await call(controller, {
      authorization: SECRET,
      body: { type: 'verification' },
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('handshake de verificação'),
    );
  });

  // ─── 4. Assinatura ─────────────────────────────────────────────────────────

  it.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['prefixo truncado', Buffer.from([0x01, 0x00, 0x00]).toString('base64')],
  ])(
    'recusa com 401 e não enfileira: assinatura %s',
    async (_caso, assinatura) => {
      const { controller, queue } = await buildController(publicKey);
      const raw = rawOf({ data: NOTIFICATION });

      await expect(
        call(controller, {
          authorization: SECRET,
          signature: assinatura,
          rawBody: raw,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(queue.addBulk).not.toHaveBeenCalled();
    },
  );

  it('recusa com 401 assinatura com versão de prefixo errada', async () => {
    const { controller, queue } = await buildController(publicKey);
    const raw = rawOf({ data: NOTIFICATION });
    const valido = Buffer.from(
      signatureHeader(KEY_ID, privateKey, raw),
      'base64',
    );
    valido[0] = 0x02;

    await expect(
      call(controller, {
        authorization: SECRET,
        signature: valido.toString('base64'),
        rawBody: raw,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('recusa com 401 assinatura de 63 e de 65 bytes', async () => {
    const { controller, queue } = await buildController(publicKey);
    const raw = rawOf({ data: NOTIFICATION });
    const valido = Buffer.from(
      signatureHeader(KEY_ID, privateKey, raw),
      'base64',
    );

    for (const adulterado of [
      valido.subarray(0, valido.length - 1),
      Buffer.concat([valido, Buffer.from([0x00])]),
    ]) {
      await expect(
        call(controller, {
          authorization: SECRET,
          signature: adulterado.toString('base64'),
          rawBody: raw,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('recusa com 401 assinatura de keyId desconhecido', async () => {
    const { controller, queue } = await buildController(publicKey);
    const raw = rawOf({ data: NOTIFICATION });

    await expect(
      call(controller, {
        authorization: SECRET,
        signature: signatureHeader(4242, privateKey, raw),
        rawBody: raw,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('recusa com 401 assinatura forjada por outra chave', async () => {
    const { controller, queue } = await buildController(publicKey);
    const impostor = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const raw = rawOf({ data: NOTIFICATION });

    await expect(
      call(controller, {
        authorization: SECRET,
        signature: signatureHeader(KEY_ID, impostor.privateKey, raw),
        rawBody: raw,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('recusa com 401 corpo adulterado depois de assinado', async () => {
    const { controller, queue } = await buildController(publicKey);
    const assinado = rawOf({ data: NOTIFICATION });
    const entregue = rawOf({
      data: { ...NOTIFICATION, clientProvidedSubscriptionName: 'outro-user' },
    });

    await expect(
      call(controller, {
        authorization: SECRET,
        signature: signatureHeader(KEY_ID, privateKey, assinado),
        rawBody: entregue,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  // ─── 5. Enfileiramento ─────────────────────────────────────────────────────

  it('enfileira sync-window com assinatura válida e responde 204', async () => {
    const { controller, queue } = await buildController(publicKey);
    const raw = rawOf({ data: NOTIFICATION });

    const res = await call(controller, {
      authorization: SECRET,
      signature: signatureHeader(KEY_ID, privateKey, raw),
      rawBody: raw,
    });

    // O 204 vem do `@HttpCode` — nada de `res.status()` neste caminho.
    expect(res.status).not.toHaveBeenCalled();
    expect(queue.addBulk).toHaveBeenCalledTimes(1);

    const jobs = queue.addBulk.mock.calls[0][0];
    expect(jobs).toHaveLength(1);
    const job = jobs[0].data as GoogleHealthSyncJobData;
    expect(jobs[0].name).toBe('sync-window');
    expect(job.notification).toEqual(NOTIFICATION);
    expect(Number.isNaN(Date.parse(job.receivedAt))).toBe(false);
    // Sem attempts/backoff: o default global de `app.module.ts:59-64` já cobre.
    // A retenção, essa sim, é sobreposta — por idade, não por contagem.
    expect(jobs[0].opts).toEqual({
      jobId: googleHealthJobId(NOTIFICATION),
      ...RETENCAO,
    });
  });

  it('enfileira job `delete` quando a operação é DELETE', async () => {
    const { controller, queue } = await buildController(publicKey);
    const raw = rawOf({
      data: { ...NOTIFICATION, operation: 'DELETE', recordId: 'rec-1' },
    });

    await call(controller, {
      authorization: SECRET,
      signature: signatureHeader(KEY_ID, privateKey, raw),
      rawBody: raw,
    });

    expect(queue.addBulk.mock.calls[0][0][0].name).toBe('delete');
  });

  it('aceita lote em ARRAY e enfileira um job por notificação', async () => {
    const { controller, queue } = await buildController(publicKey);
    const segunda = { ...NOTIFICATION, dataType: 'steps' };
    const raw = rawOf([{ data: NOTIFICATION }, { data: segunda }]);

    await call(controller, {
      authorization: SECRET,
      signature: signatureHeader(KEY_ID, privateKey, raw),
      rawBody: raw,
    });

    // UMA viagem ao Redis, dois jobs dentro dela.
    expect(queue.addBulk).toHaveBeenCalledTimes(1);
    const lote = queue.addBulk.mock.calls[0][0];
    expect(lote).toHaveLength(2);
    expect(lote[0].opts).toEqual({
      jobId: googleHealthJobId(NOTIFICATION),
      ...RETENCAO,
    });
    expect(lote[1].opts).toEqual({
      jobId: googleHealthJobId(segunda),
      ...RETENCAO,
    });
  });

  it('reentrega da MESMA notificação reusa o jobId (idempotência)', async () => {
    const { controller, queue } = await buildController(publicKey);
    const raw = rawOf({ data: NOTIFICATION });
    const assinatura = signatureHeader(KEY_ID, privateKey, raw);

    await call(controller, {
      authorization: SECRET,
      signature: assinatura,
      rawBody: raw,
    });
    await call(controller, {
      authorization: SECRET,
      signature: assinatura,
      rawBody: raw,
    });

    expect(queue.addBulk).toHaveBeenCalledTimes(2);
    expect(queue.addBulk.mock.calls[0][0][0].opts).toEqual(
      queue.addBulk.mock.calls[1][0][0].opts,
    );
  });

  it('jobId muda quando a janela do dado muda', () => {
    const outraJanela = {
      ...NOTIFICATION,
      intervals: [
        {
          physicalTimeInterval: {
            startTime: '2026-09-16T10:00:00Z',
            endTime: '2026-09-16T10:45:00Z',
          },
        },
      ],
    };

    expect(googleHealthJobId(outraJanela)).not.toBe(
      googleHealthJobId(NOTIFICATION),
    );
  });

  it('responde 503 quando o enfileiramento falha — nunca 204', async () => {
    const { controller, queue } = await buildController(publicKey);
    queue.addBulk.mockRejectedValue(new Error('redis fora do ar'));
    const raw = rawOf({ data: NOTIFICATION });

    await expect(
      call(controller, {
        authorization: SECRET,
        signature: signatureHeader(KEY_ID, privateKey, raw),
        rawBody: raw,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('responde 204 sem enfileirar quando o corpo assinado não traz `data`', async () => {
    const { controller, queue } = await buildController(publicKey);
    const raw = rawOf({ algo: 'que não conhecemos' });

    const res = await call(controller, {
      authorization: SECRET,
      signature: signatureHeader(KEY_ID, privateKey, raw),
      rawBody: raw,
    });

    expect(res.status).not.toHaveBeenCalled();
    expect(queue.addBulk).not.toHaveBeenCalled();
  });
});

// ─── Pela pilha HTTP de verdade ──────────────────────────────────────────────
//
// Os testes acima chamam o método do controller direto, e por isso NÃO provam
// o status que sai no fio. Três coisas só aparecem com a pilha montada, e as
// três valem o gate ao vivo:
//
//   1. `@HttpCode(204)` + `res.status(200)` no handshake — se o Nest
//      sobrescrevesse o status depois do handler, o passo 1 responderia 204, o
//      Google recusaria o registro do subscriber e o Commit C não existiria.
//   2. `forbidNonWhitelisted: true` (global em `main.ts:88`) NÃO devolve 400
//      para campo que o Google mande e nós não declaremos — é o motivo de o
//      corpo ser interface, e sem este teste a afirmação fica no comentário.
//   3. Não existe rota `GET`: 404, e não o `undefined === undefined` que o
//      `GET /webhooks/fitbit` fazia.
describe('GoogleHealthWebhookController — correções da revisão de segurança', () => {
  let privateKey: KeyObject;
  let publicKey: KeyObject;

  beforeAll(() => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  it('notificação sem NENHUM identificador não é enfileirada (204)', async () => {
    // `jobId` é digest do conteúdo. Sem `clientProvidedSubscriptionName` e sem
    // `healthUserId`, a impressão digital fica idêntica para TODAS elas: duas
    // notificações mínimas de usuários diferentes colidiriam e o BullMQ
    // descartaria a segunda em silêncio — perda de corrida de usuário real.
    const { controller, queue } = await buildController(publicKey);
    const raw = rawOf({ data: { operation: 'UPSERT', dataType: 'exercise' } });

    const res = await call(controller, {
      authorization: SECRET,
      signature: signatureHeader(KEY_ID, privateKey, raw),
      rawBody: raw,
    });

    expect(queue.addBulk).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled(); // 204 pelo @HttpCode
  });

  it('basta UM dos dois identificadores para ser endereçável', async () => {
    const { controller, queue } = await buildController(publicKey);
    const raw = rawOf({
      data: { healthUserId: 'health-user-9', dataType: 'exercise' },
    });

    await call(controller, {
      authorization: SECRET,
      signature: signatureHeader(KEY_ID, privateKey, raw),
      rawBody: raw,
    });

    expect(queue.addBulk).toHaveBeenCalledTimes(1);
  });

  it('lote acima do teto de sanidade responde 503 e não enfileira nada', async () => {
    // Um corpo de 2 MB cabe milhares de envelopes mínimos. Aceitar seria fazer
    // o Redis crescer sem despejo — a forma do incidente das 8,2M linhas.
    const { controller, queue } = await buildController(publicKey);
    const lote = Array.from({ length: 501 }, (_, i) => ({
      data: { ...NOTIFICATION, healthUserId: `health-user-${i}` },
    }));
    const raw = rawOf(lote);

    await expect(
      call(controller, {
        authorization: SECRET,
        signature: signatureHeader(KEY_ID, privateKey, raw),
        rawBody: raw,
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('o placeholder do .env.example é tratado como segredo ausente', async () => {
    const { controller, queue } = await buildController(
      publicKey,
      'Bearer troque-por-um-aleatorio-longo',
    );
    const raw = rawOf({ data: NOTIFICATION });

    await expect(
      call(controller, {
        authorization: 'Bearer troque-por-um-aleatorio-longo',
        signature: signatureHeader(KEY_ID, privateKey, raw),
        rawBody: raw,
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(queue.addBulk).not.toHaveBeenCalled();
  });

  it('os três caminhos de 401 devolvem a MESMA mensagem ao cliente', async () => {
    // O filtro global devolve a mensagem da HttpException ao cliente inclusive
    // em produção. Mensagens distintas contariam o estado do deploy a um
    // anônimo: "sem segredo" × "credencial errada" × "assinatura ruim".
    const raw = rawOf({ data: NOTIFICATION });
    const mensagens: string[] = [];

    const semSegredo = await buildController(publicKey, null);
    const comSegredo = await buildController(publicKey);

    const casos: Array<[GoogleHealthWebhookController, CallOptions]> = [
      [semSegredo.controller, { authorization: SECRET, rawBody: raw }],
      [comSegredo.controller, { authorization: 'Bearer errado', rawBody: raw }],
      [
        comSegredo.controller,
        { authorization: SECRET, signature: 'lixo', rawBody: raw },
      ],
    ];

    for (const [controller, options] of casos) {
      try {
        await call(controller, options);
        throw new Error('deveria ter recusado');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        mensagens.push((error as UnauthorizedException).message);
      }
    }

    expect(mensagens).toHaveLength(3);
    expect(new Set(mensagens).size).toBe(1);
  });
});

describe('GoogleHealthWebhookController pela pilha HTTP', () => {
  let app: NestExpressApplication;
  let privateKey: KeyObject;
  const addBulk = jest.fn<Promise<unknown>, [JobSpec[]]>(() =>
    Promise.resolve({}),
  );

  const ROTA = '/api/devices/webhooks/google-health';

  beforeAll(async () => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    privateKey = pair.privateKey;

    const module = await Test.createTestingModule({
      controllers: [GoogleHealthWebhookController],
      providers: [
        GoogleHealthSignatureVerifier,
        {
          provide: GOOGLE_HEALTH_KEYSET_FETCHER,
          useValue: () => Promise.resolve(keysetWith(KEY_ID, pair.publicKey)),
        },
        {
          provide: ConfigService,
          useValue: { get: () => SECRET },
        },
        {
          provide: getQueueToken(GOOGLE_HEALTH_SYNC_QUEUE),
          useValue: { addBulk },
        },
      ],
    }).compile();

    // Mesma configuração de `main.ts`, e as três partes importam:
    //
    //  - `rawBody: true` é o que popula `req.rawBody`;
    //  - os DOIS `useBodyParser` reaplicam o parser com o teto de 2 MB, e é
    //    esta a combinação que roda em produção. Sem replicá-los aqui, o teste
    //    exercitaria um parser diferente do real, e uma edição futura no
    //    `main.ts` que quebrasse o `rawBody` passaria pelo CI. O sintoma seria
    //    handshake passando e TODA notificação real em 401 `missing_raw_body`;
    //  - o `ValidationPipe` global é quem provaria um 400 se o corpo fosse
    //    DTO-classe em vez de interface.
    //
    // Este webhook é o primeiro consumidor real de `req.rawBody` no app.
    app = module.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    app.useBodyParser('json', { limit: BODY_SIZE_LIMIT });
    app.useBodyParser('urlencoded', { limit: BODY_SIZE_LIMIT, extended: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    addBulk.mockClear();
  });

  it('passo 2 do handshake, sem credencial, responde 401', async () => {
    await request(app.getHttpServer())
      .post(ROTA)
      .send({ type: 'verification' })
      .expect(401);

    expect(addBulk).not.toHaveBeenCalled();
  });

  it('passo 1 do handshake, com credencial, responde 200 (e não 204)', async () => {
    await request(app.getHttpServer())
      .post(ROTA)
      .set('Authorization', SECRET)
      .send({ type: 'verification' })
      .expect(200);

    expect(addBulk).not.toHaveBeenCalled();
  });

  it('notificação assinada com campo NÃO declarado responde 204 e enfileira', async () => {
    const raw = rawOf({
      data: {
        ...NOTIFICATION,
        campoQueOGoogleAdicionouDepois: 'e que nós não declaramos',
      },
    });

    await request(app.getHttpServer())
      .post(ROTA)
      .set('Authorization', SECRET)
      .set('Content-Type', 'application/json')
      .set(
        'GOOGLE-HEALTH-API-SIGNATURE',
        signatureHeader(KEY_ID, privateKey, raw),
      )
      .send(raw.toString('utf8'))
      .expect(204);

    expect(addBulk).toHaveBeenCalledTimes(1);
  });

  it('assinatura forjada responde 401 sem enfileirar', async () => {
    const impostor = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const raw = rawOf({ data: NOTIFICATION });

    await request(app.getHttpServer())
      .post(ROTA)
      .set('Authorization', SECRET)
      .set('Content-Type', 'application/json')
      .set(
        'GOOGLE-HEALTH-API-SIGNATURE',
        signatureHeader(KEY_ID, impostor.privateKey, raw),
      )
      .send(raw.toString('utf8'))
      .expect(401);

    expect(addBulk).not.toHaveBeenCalled();
  });

  it('não existe rota GET — 404', async () => {
    await request(app.getHttpServer())
      .get(ROTA)
      .set('Authorization', SECRET)
      .expect(404);
  });
});
