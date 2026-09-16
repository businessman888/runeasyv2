import { Inject, Injectable, Logger } from '@nestjs/common';
import { KeyObject, createPublicKey, verify as cryptoVerify } from 'crypto';

/**
 * Verificação da assinatura do webhook da Google Health API.
 *
 * Receita PROVADA em execução (handoff
 * `.claude/team/handoffs/2026-09-15-fase4-google-health-webhook-assinatura.md`,
 * reproduzida aqui em 2026-09-15 contra o keyset real). Dois fatos medidos
 * governam este arquivo inteiro:
 *
 * 1. **A documentação do Google erra o encoding.** A página de webhooks diz
 *    assinatura "DER-encoded". Decodificando o protobuf `EcdsaPublicKey` do
 *    keyset real, as 5 chaves dizem `encoding = 2` = **IEEE_P1363**. O
 *    `crypto.verify` do Node usa **DER por default**: sem
 *    `dsaEncoding: 'ieee-p1363'` ele devolve `false` SEMPRE, sem exceção e sem
 *    log. O sintoma seria o pior possível — webhook no ar, handshake passando,
 *    e toda notificação real recusada com 401, indistinguível de "o Google não
 *    está mandando nada". `google-health-signature.verifier.spec.ts` trava isso
 *    com um teste que prova que o DER devolve `false` para a MESMA assinatura.
 *
 * 2. **As 5 chaves ficam `ENABLED` ao mesmo tempo** (rotação de 30 dias). A
 *    chave se seleciona pelo `keyId` que vem no header, NUNCA pelo
 *    `primaryKeyId` do keyset.
 *
 * Zero dependência nova: o keyset é JSON, o protobuf tem 3 campos e a chave EC
 * se remonta à mão com `node:crypto`.
 */

/** Nome do header, em minúsculas — é como o Node entrega `req.headers`. */
export const GOOGLE_HEALTH_SIGNATURE_HEADER = 'google-health-api-signature';

const KEYSET_URL =
  'https://www.gstatic.com/googlehealthapi/webhooks/webhooks_public_keyset.json';

/**
 * A rotação é de 30 dias; 6 h de TTL pega uma chave nova muito antes de ela ser
 * necessária. Buscar a cada requisição colocaria o gstatic no caminho crítico
 * de toda notificação — e uma rajada de backlog (o Google retém 7 dias e
 * entrega tudo de uma vez) viraria uma rajada igual de fetch.
 */
const KEYSET_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Teto de quanto tempo um keyset vencido ainda é aceito quando o fetch falha.
 * Dentro da janela, cache velho é melhor que recusar: keyset é público, e uma
 * cópia antiga só pode DEIXAR DE CONHECER uma chave nova — jamais aceitar uma
 * assinatura que o Google não fez. Passado o teto, falha fechado: uma chave
 * pode ter sido desabilitada por comprometimento, e continuar honrando-a
 * indefinidamente seria uma decisão diferente da que este código toma.
 */
const KEYSET_MAX_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * `keyId` desconhecido pode ser rotação legítima — ou assinatura forjada. Sem
 * teto, o segundo caso vira DoS de fetch contra o gstatic: basta mandar
 * requisições com `keyId` aleatório. Um refresh forçado por janela é o
 * suficiente para absorver a rotação.
 */
const FORCED_REFRESH_MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Cache negativo: intervalo mínimo entre DUAS tentativas de buscar o keyset
 * depois de uma que falhou.
 *
 * Existe por causa de uma interação sutil. No fallback para a cópia velha, o
 * `fetchedAt` NÃO é atualizado — de propósito, senão a janela de 24 h viraria
 * rolante e o keyset envelheceria para sempre. O efeito colateral é que, numa
 * queda do gstatic, toda requisição seguinte encontra o TTL vencido e dispara
 * um fetch novo; o single-flight junta as concorrentes, mas as sequenciais não,
 * e cada uma paga até `KEYSET_FETCH_TIMEOUT_MS`. Somado a uma rajada de backlog
 * do Google, isso segura uma requisição por vez por vários segundos.
 *
 * Com o cache negativo, a cópia velha é servida de imediato no intervalo, e o
 * gstatic é consultado no máximo uma vez por minuto.
 */
const FETCH_RETRY_MIN_INTERVAL_MS = 60 * 1000;

const KEYSET_FETCH_TIMEOUT_MS = 5000;

/** `0x01` de versão + `keyId` uint32 big-endian. */
const TINK_PREFIX_LENGTH = 5;
const TINK_PREFIX_VERSION = 0x01;
/** ECDSA P-256 em IEEE-P1363 é `r||s`, 32 + 32. */
const P256_SIGNATURE_LENGTH = 64;

/** Enums do protobuf do Tink, conferidos contra o keyset real. */
const HASH_TYPE_SHA256 = 3;
const CURVE_P256 = 2;
const ENCODING_IEEE_P1363 = 2;

/** Cabeçalho SPKI de uma chave pública P-256, seguido do ponto não comprimido. */
const SPKI_P256_PREFIX = Buffer.from(
  '3059301306072a8648ce3d020106082a8648ce3d030107034200',
  'hex',
);

// ─── Keyset ──────────────────────────────────────────────────────────────────

export interface TinkKeysetJson {
  primaryKeyId?: number;
  key?: TinkKeyJson[];
}

export interface TinkKeyJson {
  keyId?: number;
  status?: string;
  outputPrefixType?: string;
  keyData?: {
    typeUrl?: string;
    /** `EcdsaPublicKey` serializado, em base64. */
    value?: string;
    keyMaterialType?: string;
  };
}

/**
 * De onde o keyset vem. É injetável para que o teste use um par de chaves local
 * e NÃO dependa de rede — sem isso, a suíte de assinatura só rodaria online.
 */
export type GoogleHealthKeysetFetcher = () => Promise<TinkKeysetJson>;

export const GOOGLE_HEALTH_KEYSET_FETCHER = 'GOOGLE_HEALTH_KEYSET_FETCHER';

export const defaultGoogleHealthKeysetFetcher: GoogleHealthKeysetFetcher =
  async () => {
    const response = await fetch(KEYSET_URL, {
      signal: AbortSignal.timeout(KEYSET_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`keyset HTTP ${response.status}`);
    }
    return (await response.json()) as TinkKeysetJson;
  };

// ─── Resultado ───────────────────────────────────────────────────────────────

/**
 * Todos os motivos de recusa. O controller loga o motivo (formato, tamanho e
 * `keyId` bastam) e NUNCA a assinatura.
 */
export type SignatureRejection =
  | 'missing_raw_body'
  | 'missing_header'
  | 'malformed_header'
  | 'unsupported_prefix_version'
  | 'bad_signature_length'
  | 'keyset_unavailable'
  | 'unknown_key_id'
  | 'invalid_signature';

/**
 * Uma interface só, com `ok: boolean`, em vez de união discriminada: o
 * `tsconfig.json` do backend tem `strictNullChecks: false`, e sem ele o
 * estreitamento por `!check.ok` não vale — o compilador reclamaria de
 * `check.reason` dentro do próprio ramo de erro.
 */
export interface SignatureCheck {
  ok: boolean;
  /** Presente quando `ok` é falso. */
  reason?: SignatureRejection;
  /** `keyId` do header, quando o header pôde ser lido. */
  keyId?: number;
}

interface ParsedSignatureHeader {
  keyId?: number;
  signature?: Buffer;
  reason?: SignatureRejection;
}

@Injectable()
export class GoogleHealthSignatureVerifier {
  private readonly logger = new Logger(GoogleHealthSignatureVerifier.name);

  private cached: { keys: Map<number, KeyObject>; fetchedAt: number } | null =
    null;
  /** Single-flight: duas requisições simultâneas não disparam dois fetches. */
  private inFlight: Promise<Map<number, KeyObject>> | null = null;
  private lastForcedRefreshAt = 0;
  /** Quando o último fetch falhou. Ver `FETCH_RETRY_MIN_INTERVAL_MS`. */
  private lastFailedFetchAt = 0;

  constructor(
    @Inject(GOOGLE_HEALTH_KEYSET_FETCHER)
    private readonly fetchKeyset: GoogleHealthKeysetFetcher,
  ) {}

  /**
   * Verifica a assinatura sobre o CORPO CRU. Nunca lança: toda falha vira uma
   * recusa tipada, para que o controller responda 401 e jamais 500 — 500 faria
   * o Google retentar uma requisição que nós já sabemos que é inválida.
   */
  async verify(
    rawBody: Buffer | undefined,
    header: string | undefined,
  ): Promise<SignatureCheck> {
    if (!rawBody || rawBody.length === 0) {
      return { ok: false, reason: 'missing_raw_body' };
    }

    const parsed = this.parseHeader(header);
    if (parsed.reason) {
      return { ok: false, reason: parsed.reason };
    }
    const keyId = parsed.keyId;
    const signature = parsed.signature;

    let keys: Map<number, KeyObject>;
    try {
      keys = await this.loadKeyset(false);
    } catch (error) {
      this.logger.error(
        `Keyset do Google Health indisponível: ${describe(error)}`,
      );
      return { ok: false, reason: 'keyset_unavailable', keyId };
    }

    let key = keys.get(keyId);
    if (!key) {
      // Pode ser rotação: tenta UMA vez por janela, e só então recusa.
      const refreshed = await this.forceRefreshOnce();
      key = refreshed?.get(keyId);
    }
    if (!key) {
      this.logger.error(
        `Keyset do Google Health não contém a chave keyId=${keyId} nem após ` +
          `refresh forçado — rotação não acompanhada, não assinatura forjada`,
      );
      return { ok: false, reason: 'unknown_key_id', keyId };
    }

    let valid = false;
    try {
      // `dsaEncoding: 'ieee-p1363'` é OBRIGATÓRIO — ver o cabeçalho do arquivo.
      valid = cryptoVerify(
        'sha256',
        rawBody,
        { key, dsaEncoding: 'ieee-p1363' },
        signature,
      );
    } catch (error) {
      // Assinatura malformada a ponto de o OpenSSL reclamar é recusa, não 500.
      this.logger.warn(
        `Falha ao verificar assinatura (keyId=${keyId}): ${describe(error)}`,
      );
      return { ok: false, reason: 'invalid_signature', keyId };
    }

    return valid
      ? { ok: true, keyId }
      : { ok: false, reason: 'invalid_signature', keyId };
  }

  /**
   * `base64( 0x01 || keyId uint32 big-endian || assinatura de 64 bytes )`.
   *
   * Cada checagem é uma recusa explícita, nunca uma exceção: header truncado é
   * entrada hostil corriqueira, não bug.
   */
  private parseHeader(header: string | undefined): ParsedSignatureHeader {
    if (!header || header.trim().length === 0) {
      return { reason: 'missing_header' };
    }

    // `Buffer.from(_, 'base64')` NÃO lança: ele ignora caractere inválido e
    // devolve o que conseguiu decodificar. Quem recusa lixo, portanto, são as
    // checagens de tamanho e de versão abaixo — não um try/catch decorativo.
    const raw = Buffer.from(header.trim(), 'base64');

    if (raw.length <= TINK_PREFIX_LENGTH) {
      return { reason: 'malformed_header' };
    }
    if (raw[0] !== TINK_PREFIX_VERSION) {
      return { reason: 'unsupported_prefix_version' };
    }

    const signature = raw.subarray(TINK_PREFIX_LENGTH);
    if (signature.length !== P256_SIGNATURE_LENGTH) {
      return { reason: 'bad_signature_length' };
    }

    return { keyId: raw.readUInt32BE(1), signature };
  }

  /**
   * Keyset com TTL e single-flight. Em falha de rede, cai no cache velho dentro
   * de `KEYSET_MAX_STALE_MS` (ver o racional na constante).
   */
  private async loadKeyset(force: boolean): Promise<Map<number, KeyObject>> {
    const cached = this.cached;
    const now = Date.now();
    if (!force && cached && now - cached.fetchedAt < KEYSET_TTL_MS) {
      return cached.keys;
    }
    // Cache negativo. `force` passa direto: o refresh forçado já tem o teto
    // próprio de `FORCED_REFRESH_MIN_INTERVAL_MS`.
    if (
      !force &&
      cached &&
      now - this.lastFailedFetchAt < FETCH_RETRY_MIN_INTERVAL_MS &&
      now - cached.fetchedAt < KEYSET_MAX_STALE_MS
    ) {
      return cached.keys;
    }
    if (this.inFlight !== null) {
      return this.inFlight;
    }

    this.inFlight = this.buildKeys()
      .then((keys) => {
        this.cached = { keys, fetchedAt: Date.now() };
        return keys;
      })
      .catch((error: unknown) => {
        this.lastFailedFetchAt = Date.now();
        const stale = this.cached;
        if (stale && Date.now() - stale.fetchedAt < KEYSET_MAX_STALE_MS) {
          this.logger.warn(
            `Keyset não pôde ser atualizado (${describe(error)}) — seguindo com a cópia em cache`,
          );
          return stale.keys;
        }
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  /** Um refresh forçado por janela, no máximo. Ver `FORCED_REFRESH_MIN_INTERVAL_MS`. */
  private async forceRefreshOnce(): Promise<Map<number, KeyObject> | null> {
    const now = Date.now();
    if (now - this.lastForcedRefreshAt < FORCED_REFRESH_MIN_INTERVAL_MS) {
      return null;
    }
    // Marca ANTES do await: uma rajada de assinaturas forjadas chega
    // concorrente, e marcar depois deixaria todas passarem pelo teto.
    this.lastForcedRefreshAt = now;

    try {
      return await this.loadKeyset(true);
    } catch (error) {
      this.logger.error(`Refresh forçado do keyset falhou: ${describe(error)}`);
      return null;
    }
  }

  /** Busca o keyset e remonta cada chave utilizável, indexada por `keyId`. */
  private async buildKeys(): Promise<Map<number, KeyObject>> {
    const keyset = await this.fetchKeyset();
    const keys = new Map<number, KeyObject>();

    for (const entry of keyset?.key ?? []) {
      const keyId = entry?.keyId;
      if (typeof keyId !== 'number') continue;

      // Chave desabilitada não assina mais nada: ignorar é fail-closed.
      if (entry.status !== 'ENABLED') continue;
      if (!entry.keyData?.typeUrl?.endsWith('.EcdsaPublicKey')) continue;
      if (!entry.keyData.value) continue;

      try {
        const parsed = decodeEcdsaPublicKey(
          Buffer.from(entry.keyData.value, 'base64'),
        );
        const params = parsed.params;

        // Se o Google um dia mudar os parâmetros, isto vira log em vez de
        // recusa silenciosa de toda notificação.
        if (
          params.hashType !== HASH_TYPE_SHA256 ||
          params.curve !== CURVE_P256 ||
          params.encoding !== ENCODING_IEEE_P1363
        ) {
          this.logger.warn(
            `Chave ${keyId} do keyset com parâmetros inesperados ` +
              `(hash=${params.hashType}, curve=${params.curve}, encoding=${params.encoding}) — ignorada`,
          );
          continue;
        }

        keys.set(keyId, publicKeyFromXY(parsed.x, parsed.y));
      } catch (error) {
        this.logger.warn(
          `Chave ${keyId} do keyset não pôde ser lida: ${describe(error)}`,
        );
      }
    }

    if (keys.size === 0) {
      throw new Error('keyset sem nenhuma chave ECDSA P-256 utilizável');
    }

    return keys;
  }
}

// ─── Protobuf mínimo ─────────────────────────────────────────────────────────
//
// `google.crypto.tink.EcdsaPublicKey`:
//   1 version (varint) · 2 params (message) · 3 x (bytes) · 4 y (bytes)
// `google.crypto.tink.EcdsaParams`:
//   1 hash_type · 2 curve · 3 encoding (todos varint)
//
// Três campos, dois wire types. Uma dependência de protobuf para isto seria
// superfície de supply chain por conveniência.

interface EcdsaParams {
  hashType?: number;
  curve?: number;
  encoding?: number;
}

interface EcdsaPublicKey {
  params: EcdsaParams;
  x: Buffer;
  y: Buffer;
}

function readVarint(
  buf: Buffer,
  offset: number,
): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let pos = offset;

  while (pos < buf.length) {
    const byte = buf[pos++];
    value += (byte & 0x7f) * Math.pow(2, shift);
    if ((byte & 0x80) === 0) return { value, next: pos };
    shift += 7;
    if (shift > 35) throw new Error('varint longo demais');
  }

  throw new Error('varint truncado');
}

function decodeEcdsaParams(buf: Buffer): EcdsaParams {
  const params: EcdsaParams = {};
  let pos = 0;

  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    pos = tag.next;
    const field = tag.value >>> 3;
    const wireType = tag.value & 0x7;
    if (wireType !== 0) throw new Error(`EcdsaParams: wire type ${wireType}`);

    const read = readVarint(buf, pos);
    pos = read.next;
    if (field === 1) params.hashType = read.value;
    if (field === 2) params.curve = read.value;
    if (field === 3) params.encoding = read.value;
  }

  return params;
}

function decodeEcdsaPublicKey(buf: Buffer): EcdsaPublicKey {
  let params: EcdsaParams | null = null;
  let x: Buffer | null = null;
  let y: Buffer | null = null;
  let pos = 0;

  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    pos = tag.next;
    const field = tag.value >>> 3;
    const wireType = tag.value & 0x7;

    if (wireType === 0) {
      pos = readVarint(buf, pos).next; // version — não usamos
      continue;
    }
    if (wireType !== 2) {
      throw new Error(`EcdsaPublicKey: wire type ${wireType}`);
    }

    const length = readVarint(buf, pos);
    pos = length.next;
    const slice = buf.subarray(pos, pos + length.value);
    if (slice.length !== length.value) {
      throw new Error('EcdsaPublicKey: campo truncado');
    }
    pos += length.value;

    if (field === 2) params = decodeEcdsaParams(slice);
    if (field === 3) x = slice;
    if (field === 4) y = slice;
  }

  if (!params || !x || !y) {
    throw new Error('EcdsaPublicKey sem params/x/y');
  }
  return { params, x, y };
}

/**
 * As coordenadas vêm do protobuf com sign byte `0x00` à frente (as 10 do keyset
 * real têm 33 bytes); o ponto EC quer 32 bytes exatos, e um valor pequeno pode
 * vir com menos. Medido em 2026-09-15.
 */
function pad32(value: Buffer): Buffer {
  let bytes = value;
  while (bytes.length > 32 && bytes[0] === 0x00) bytes = bytes.subarray(1);
  if (bytes.length < 32) {
    bytes = Buffer.concat([Buffer.alloc(32 - bytes.length), bytes]);
  }
  if (bytes.length !== 32) {
    throw new Error(`coordenada fora de 32 bytes: ${bytes.length}`);
  }
  return bytes;
}

function publicKeyFromXY(x: Buffer, y: Buffer): KeyObject {
  const point = Buffer.concat([Buffer.from([0x04]), pad32(x), pad32(y)]);
  return createPublicKey({
    key: Buffer.concat([SPKI_P256_PREFIX, point]),
    format: 'der',
    type: 'spki',
  });
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  // Mesmo cuidado do `AllExceptionsFilter`: `String(unknown)` vira
  // "[object Object]" para objeto, e o lint acusa.
  return String(error as string | number | bigint | boolean | null | undefined);
}
