import { Logger } from '@nestjs/common';
import {
  KeyObject,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'crypto';
import {
  GOOGLE_HEALTH_KEYSET_FETCHER,
  GoogleHealthKeysetFetcher,
  GoogleHealthSignatureVerifier,
  TinkKeyJson,
  TinkKeysetJson,
} from './google-health-signature.verifier';
import { Test } from '@nestjs/testing';

// ─── Ferramentas do teste ────────────────────────────────────────────────────
//
// O keyset do Google é um JSON com o `EcdsaPublicKey` serializado em protobuf
// dentro. Para testar sem rede é preciso PRODUZIR esse formato a partir de um
// par de chaves local — é o que as funções abaixo fazem. Elas são o inverso
// exato do que o verificador lê.

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

interface EcdsaParamValues {
  hashType: number;
  curve: number;
  encoding: number;
}

/** SHA256 / P-256 / IEEE_P1363 — o que as 5 chaves reais dizem. */
const REAL_PARAMS: EcdsaParamValues = { hashType: 3, curve: 2, encoding: 2 };

function encodeEcdsaPublicKey(
  x: Buffer,
  y: Buffer,
  params: EcdsaParamValues = REAL_PARAMS,
): string {
  const encodedParams = Buffer.concat([
    varintField(1, params.hashType),
    varintField(2, params.curve),
    varintField(3, params.encoding),
  ]);
  return Buffer.concat([
    bytesField(2, encodedParams),
    bytesField(3, x),
    bytesField(4, y),
  ]).toString('base64');
}

function coordinates(publicKey: KeyObject): { x: Buffer; y: Buffer } {
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    x: Buffer.from(String(jwk.x), 'base64url'),
    y: Buffer.from(String(jwk.y), 'base64url'),
  };
}

interface EntryOptions {
  status?: string;
  params?: EcdsaParamValues;
  x?: Buffer;
  y?: Buffer;
}

function keysetEntry(
  keyId: number,
  publicKey: KeyObject,
  options: EntryOptions = {},
): TinkKeyJson {
  const point = coordinates(publicKey);
  return {
    keyId,
    status: options.status ?? 'ENABLED',
    outputPrefixType: 'TINK',
    keyData: {
      typeUrl: 'type.googleapis.com/google.crypto.tink.EcdsaPublicKey',
      value: encodeEcdsaPublicKey(
        options.x ?? point.x,
        options.y ?? point.y,
        options.params,
      ),
      keyMaterialType: 'ASYMMETRIC_PUBLIC',
    },
  };
}

function keyset(...keys: TinkKeyJson[]): TinkKeysetJson {
  return { primaryKeyId: keys[0]?.keyId, key: keys };
}

/** `base64( versão || keyId uint32 BE || assinatura )`. */
function header(keyId: number, signature: Buffer, version = 0x01): string {
  const prefix = Buffer.alloc(5);
  prefix[0] = version;
  prefix.writeUInt32BE(keyId, 1);
  return Buffer.concat([prefix, signature]).toString('base64');
}

function sign(privateKey: KeyObject, body: Buffer): Buffer {
  return cryptoSign('sha256', body, {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
}

async function buildVerifier(fetcher: GoogleHealthKeysetFetcher) {
  const module = await Test.createTestingModule({
    providers: [
      GoogleHealthSignatureVerifier,
      { provide: GOOGLE_HEALTH_KEYSET_FETCHER, useValue: fetcher },
    ],
  }).compile();
  return module.get(GoogleHealthSignatureVerifier);
}

const KEY_ID = 257403691;
const BODY = Buffer.from(
  JSON.stringify({
    data: {
      operation: 'UPSERT',
      dataType: 'exercise',
      clientProvidedSubscriptionName: 'user-1',
    },
  }),
);

describe('GoogleHealthSignatureVerifier', () => {
  let privateKey: KeyObject;
  let publicKey: KeyObject;
  let fetcher: jest.Mock<Promise<TinkKeysetJson>, []>;
  let verifier: GoogleHealthSignatureVerifier;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;

    fetcher = jest.fn<Promise<TinkKeysetJson>, []>(() =>
      Promise.resolve(keyset(keysetEntry(KEY_ID, publicKey))),
    );
    verifier = await buildVerifier(fetcher);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Caminho feliz e a armadilha do encoding ───────────────────────────────

  it('aceita assinatura válida selecionando a chave pelo keyId do header', async () => {
    const result = await verifier.verify(
      BODY,
      header(KEY_ID, sign(privateKey, BODY)),
    );

    expect(result).toEqual({ ok: true, keyId: KEY_ID });
  });

  it('seleciona pelo keyId do header, NÃO pelo primaryKeyId do keyset', async () => {
    // Duas chaves ENABLED ao mesmo tempo, como no keyset real. A primária é a
    // outra; a assinatura é da segunda.
    const outra = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    fetcher.mockResolvedValue(
      keyset(keysetEntry(111, outra.publicKey), keysetEntry(KEY_ID, publicKey)),
    );

    const result = await verifier.verify(
      BODY,
      header(KEY_ID, sign(privateKey, BODY)),
    );

    expect(result.ok).toBe(true);
    expect(result.keyId).toBe(KEY_ID);
  });

  it('TRAVA: a MESMA assinatura devolve false com o default DER do Node', () => {
    // A doc do Google diz "DER" e ERRA: o keyset diz `encoding=2`
    // (IEEE_P1363). Sem `dsaEncoding: 'ieee-p1363'`, `verify` devolve `false`
    // SEMPRE — sem exceção e sem log. Se alguém apagar a opção no verificador,
    // este teste é o que acusa.
    const signature = sign(privateKey, BODY);

    expect(
      cryptoVerify(
        'sha256',
        BODY,
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        signature,
      ),
    ).toBe(true);
    expect(cryptoVerify('sha256', BODY, publicKey, signature)).toBe(false);
  });

  // ─── Recusas ───────────────────────────────────────────────────────────────

  it('recusa assinatura forjada por outra chave com o mesmo keyId', async () => {
    const impostor = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

    const result = await verifier.verify(
      BODY,
      header(KEY_ID, sign(impostor.privateKey, BODY)),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_signature',
      keyId: KEY_ID,
    });
  });

  it('recusa corpo adulterado depois de assinado', async () => {
    const signature = sign(privateKey, BODY);
    const adulterado = Buffer.from(
      JSON.stringify({ data: { operation: 'DELETE' } }),
    );

    const result = await verifier.verify(adulterado, header(KEY_ID, signature));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('recusa header ausente e header vazio', async () => {
    expect((await verifier.verify(BODY, undefined)).reason).toBe(
      'missing_header',
    );
    expect((await verifier.verify(BODY, '   ')).reason).toBe('missing_header');
  });

  it('recusa prefixo Tink truncado', async () => {
    const truncado = Buffer.from([0x01, 0x00, 0x00, 0x00]).toString('base64');

    const result = await verifier.verify(BODY, truncado);

    expect(result).toEqual({ ok: false, reason: 'malformed_header' });
  });

  it('recusa versão de prefixo diferente de 0x01', async () => {
    const result = await verifier.verify(
      BODY,
      header(KEY_ID, sign(privateKey, BODY), 0x02),
    );

    expect(result).toEqual({ ok: false, reason: 'unsupported_prefix_version' });
  });

  it('recusa assinatura de 63 e de 65 bytes sem lançar', async () => {
    const signature = sign(privateKey, BODY);

    const curta = await verifier.verify(
      BODY,
      header(KEY_ID, signature.subarray(0, 63)),
    );
    const longa = await verifier.verify(
      BODY,
      header(KEY_ID, Buffer.concat([signature, Buffer.from([0x00])])),
    );

    expect(curta).toEqual({ ok: false, reason: 'bad_signature_length' });
    expect(longa).toEqual({ ok: false, reason: 'bad_signature_length' });
  });

  it('recusa corpo cru ausente ou vazio', async () => {
    expect((await verifier.verify(undefined, 'qualquer')).reason).toBe(
      'missing_raw_body',
    );
    expect((await verifier.verify(Buffer.alloc(0), 'qualquer')).reason).toBe(
      'missing_raw_body',
    );
  });

  it('recusa keyId que não está no keyset', async () => {
    const result = await verifier.verify(
      BODY,
      header(999999, sign(privateKey, BODY)),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'unknown_key_id',
      keyId: 999999,
    });
  });

  it('ignora chave que não está ENABLED sem derrubar as demais', async () => {
    const desabilitada = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    fetcher.mockResolvedValue(
      keyset(
        keysetEntry(KEY_ID, publicKey),
        keysetEntry(555, desabilitada.publicKey, { status: 'DISABLED' }),
      ),
    );

    const recusada = await verifier.verify(
      BODY,
      header(555, sign(desabilitada.privateKey, BODY)),
    );
    const aceita = await verifier.verify(
      BODY,
      header(KEY_ID, sign(privateKey, BODY)),
    );

    expect(recusada.reason).toBe('unknown_key_id');
    expect(aceita.ok).toBe(true);
  });

  it('ignora chave cujo encoding no protobuf não é IEEE_P1363', async () => {
    // Se o Google um dia publicar uma chave DER, ela é descartada com log —
    // em vez de virar recusa silenciosa de toda notificação.
    const der = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    fetcher.mockResolvedValue(
      keyset(
        keysetEntry(KEY_ID, publicKey),
        keysetEntry(556, der.publicKey, {
          params: { hashType: 3, curve: 2, encoding: 1 },
        }),
      ),
    );

    const recusada = await verifier.verify(
      BODY,
      header(556, sign(der.privateKey, BODY)),
    );
    const aceita = await verifier.verify(
      BODY,
      header(KEY_ID, sign(privateKey, BODY)),
    );

    expect(recusada.reason).toBe('unknown_key_id');
    expect(aceita.ok).toBe(true);
  });

  it('recusa quando o keyset inteiro é inutilizável', async () => {
    // Nenhuma chave aproveitável não vira mapa vazio em cache por 6 h: é falha
    // de carregamento, alta e ruidosa.
    fetcher.mockResolvedValue(
      keyset(keysetEntry(KEY_ID, publicKey, { status: 'DESTROYED' })),
    );

    const result = await verifier.verify(
      BODY,
      header(KEY_ID, sign(privateKey, BODY)),
    );

    expect(result.reason).toBe('keyset_unavailable');
  });

  it('recusa quando o keyset não pode ser obtido e não há cache', async () => {
    fetcher.mockRejectedValue(new Error('gstatic fora do ar'));

    const result = await verifier.verify(
      BODY,
      header(KEY_ID, sign(privateKey, BODY)),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'keyset_unavailable',
      keyId: KEY_ID,
    });
  });

  // ─── `pad32` — as coordenadas do protobuf ──────────────────────────────────

  it('aceita coordenada de 33 bytes com sign byte 0x00 (é o caso real)', async () => {
    const point = coordinates(publicKey);
    fetcher.mockResolvedValue(
      keyset(
        keysetEntry(KEY_ID, publicKey, {
          x: Buffer.concat([Buffer.alloc(1), point.x]),
          y: Buffer.concat([Buffer.alloc(1), point.y]),
        }),
      ),
    );

    const result = await verifier.verify(
      BODY,
      header(KEY_ID, sign(privateKey, BODY)),
    );

    expect(result.ok).toBe(true);
  });

  it('aceita coordenada de 31 bytes, completando à esquerda', async () => {
    // Um `x` que começa em 0x00 pode chegar sem o byte; `pad32` precisa
    // recolocá-lo À ESQUERDA, senão o ponto EC fica errado e nada verifica.
    let pequena: { privateKey: KeyObject; publicKey: KeyObject } | null = null;
    for (let tentativa = 0; tentativa < 20000; tentativa++) {
      const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      if (coordinates(pair.publicKey).x[0] === 0x00) {
        pequena = pair;
        break;
      }
    }
    expect(pequena).not.toBeNull();

    const point = coordinates(pequena.publicKey);
    fetcher.mockResolvedValue(
      keyset(
        keysetEntry(KEY_ID, pequena.publicKey, { x: point.x.subarray(1) }),
      ),
    );

    const result = await verifier.verify(
      BODY,
      header(KEY_ID, sign(pequena.privateKey, BODY)),
    );

    expect(result.ok).toBe(true);
  });

  // ─── Enquadramento do header ──────────────────────────────────────────────

  it('aceita header REPETIDO, que o Express junta com vírgula', async () => {
    // A primeira notificação real do Google foi recusada com
    // `bad_signature_length` sobre 1163 bytes de corpo. As cinco chaves do
    // keyset dizem IEEE-P1363 (64 bytes), então o problema não era a chave: era
    // o enquadramento. Header repetido decodifica como um fluxo só, de tamanho
    // inesperado, e o primeiro byte continua sendo 0x01 — que é exatamente por
    // que a checagem de versão passava antes de falhar no tamanho.
    const assinatura = header(KEY_ID, sign(privateKey, BODY));

    await expect(
      verifier.verify(BODY, `${assinatura}, ${assinatura}`),
    ).resolves.toEqual({ ok: true, keyId: KEY_ID });
  });

  it('aceita quando só o SEGUNDO valor do header repetido é o válido', async () => {
    const outra = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const forjada = header(KEY_ID, sign(outra.privateKey, BODY));
    const boa = header(KEY_ID, sign(privateKey, BODY));

    await expect(verifier.verify(BODY, `${forjada}, ${boa}`)).resolves.toEqual({
      ok: true,
      keyId: KEY_ID,
    });
  });

  it('aceita assinatura em DER, e não só IEEE-P1363', async () => {
    // O keyset diz IEEE-P1363, mas aceitar os dois enquadramentos não
    // enfraquece nada: a chave certa sobre o corpo cru continua exigida. O que
    // muda é só como r e s vêm embalados.
    const der = cryptoSign('sha256', BODY, { key: privateKey });
    expect(der.length).toBeGreaterThanOrEqual(68);

    await expect(verifier.verify(BODY, header(KEY_ID, der))).resolves.toEqual({
      ok: true,
      keyId: KEY_ID,
    });
  });

  it('corpo adulterado continua recusado, com header repetido', async () => {
    const assinatura = header(KEY_ID, sign(privateKey, BODY));
    const outro = Buffer.from('{"data":{"operation":"DELETE"}}');

    await expect(
      verifier.verify(outro, `${assinatura}, ${assinatura}`),
    ).resolves.toMatchObject({ ok: false, reason: 'invalid_signature' });
  });

  // ─── Cache, single-flight e teto de refresh ────────────────────────────────

  it('não refaz fetch do keyset dentro do TTL', async () => {
    const assinatura = header(KEY_ID, sign(privateKey, BODY));

    await verifier.verify(BODY, assinatura);
    await verifier.verify(BODY, assinatura);
    await verifier.verify(BODY, assinatura);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('busca de novo depois do TTL de 6 h', async () => {
    const inicio = Date.UTC(2026, 8, 15, 10, 0, 0);
    const agora = jest.spyOn(Date, 'now').mockReturnValue(inicio);
    const assinatura = header(KEY_ID, sign(privateKey, BODY));

    await verifier.verify(BODY, assinatura);
    agora.mockReturnValue(inicio + 7 * 60 * 60 * 1000);
    await verifier.verify(BODY, assinatura);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('single-flight: duas verificações simultâneas disparam UM fetch', async () => {
    let liberar: ((keyset: TinkKeysetJson) => void) | null = null;
    const pronto = keyset(keysetEntry(KEY_ID, publicKey));
    fetcher.mockImplementation(
      () =>
        new Promise<TinkKeysetJson>((resolve) => {
          liberar = resolve;
        }),
    );
    const assinatura = header(KEY_ID, sign(privateKey, BODY));

    const primeira = verifier.verify(BODY, assinatura);
    const segunda = verifier.verify(BODY, assinatura);
    expect(liberar).not.toBeNull();
    liberar(pronto);

    expect((await primeira).ok).toBe(true);
    expect((await segunda).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keyId desconhecido em rajada não vira DoS de fetch no gstatic', async () => {
    const assinatura = sign(privateKey, BODY);

    for (let i = 0; i < 25; i++) {
      const result = await verifier.verify(
        BODY,
        header(700000 + i, assinatura),
      );
      expect(result.reason).toBe('unknown_key_id');
    }

    // 1 fetch inicial + no máximo 1 refresh forçado por janela.
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('o refresh forçado enxerga a chave nova depois de uma rotação', async () => {
    const rotacionada = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const assinatura = header(424242, sign(rotacionada.privateKey, BODY));

    // Primeiro fetch: keyset antigo, sem a chave nova.
    await verifier.verify(BODY, header(KEY_ID, sign(privateKey, BODY)));
    fetcher.mockResolvedValue(
      keyset(
        keysetEntry(KEY_ID, publicKey),
        keysetEntry(424242, rotacionada.publicKey),
      ),
    );

    const result = await verifier.verify(BODY, assinatura);

    expect(result).toEqual({ ok: true, keyId: 424242 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('segue com o cache quando o fetch falha depois de já ter funcionado', async () => {
    const assinatura = header(KEY_ID, sign(privateKey, BODY));
    const inicio = Date.UTC(2026, 8, 15, 10, 0, 0);
    const agora = jest.spyOn(Date, 'now').mockReturnValue(inicio);

    await verifier.verify(BODY, assinatura);
    fetcher.mockRejectedValue(new Error('gstatic fora do ar'));
    agora.mockReturnValue(inicio + 7 * 60 * 60 * 1000);

    // Cache velho é melhor que recusar: keyset é público, e cópia antiga só
    // pode DEIXAR DE CONHECER uma chave — nunca aceitar o que o Google não
    // assinou.
    expect((await verifier.verify(BODY, assinatura)).ok).toBe(true);

    // Passado o teto de 24 h, falha fechado.
    agora.mockReturnValue(inicio + 25 * 60 * 60 * 1000);
    expect((await verifier.verify(BODY, assinatura)).reason).toBe(
      'keyset_unavailable',
    );
  });

  it('cache negativo: durante uma queda do gstatic, tenta no máximo 1×/min', async () => {
    // No fallback para a cópia velha, `fetchedAt` NÃO é atualizado — senão a
    // janela de 24 h viraria rolante. O efeito colateral é que toda requisição
    // seguinte acha o TTL vencido e dispara fetch novo, cada uma segurando até
    // o timeout. Somado a uma rajada de backlog do Google, isso trava o
    // endpoint. O cache negativo serve a cópia velha de imediato no intervalo.
    const assinatura = header(KEY_ID, sign(privateKey, BODY));
    const inicio = Date.UTC(2026, 8, 15, 10, 0, 0);
    const agora = jest.spyOn(Date, 'now').mockReturnValue(inicio);

    await verifier.verify(BODY, assinatura);
    expect(fetcher).toHaveBeenCalledTimes(1);

    fetcher.mockRejectedValue(new Error('gstatic fora do ar'));
    agora.mockReturnValue(inicio + 7 * 60 * 60 * 1000); // TTL vencido
    await verifier.verify(BODY, assinatura); // 2º fetch: falha, cai no cache

    // Dez notificações no minuto seguinte: nenhuma toca o gstatic de novo.
    for (let i = 1; i <= 10; i += 1) {
      agora.mockReturnValue(inicio + 7 * 60 * 60 * 1000 + i * 1000);
      expect((await verifier.verify(BODY, assinatura)).ok).toBe(true);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Passado o minuto, tenta de novo — uma vez.
    agora.mockReturnValue(inicio + 7 * 60 * 60 * 1000 + 61 * 1000);
    await verifier.verify(BODY, assinatura);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
