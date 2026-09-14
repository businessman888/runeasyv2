import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { OAuthStateStore, OAUTH_STATE_TTL_MS } from './oauth-state.store';
import { SupabaseService } from '../../database';

/**
 * Cadeia do query builder do Supabase. Filtros devolvem a própria cadeia; cada
 * chamada TERMINAL devolve a Promise do resultado — `maybeSingle` no consumo,
 * `insert` na gravação e `lt` na coleta dos vencidos.
 */
interface Chain {
  select: jest.Mock<Chain, [string]>;
  delete: jest.Mock<Chain, []>;
  eq: jest.Mock<Chain, [string, string]>;
  gt: jest.Mock<Chain, [string, string]>;
  lt: jest.Mock<Promise<unknown>, [string, string]>;
  insert: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  maybeSingle: jest.Mock<Promise<unknown>, []>;
}

function makeChain(result: unknown): Chain {
  const chain = {} as Chain;
  chain.select = jest.fn<Chain, [string]>(() => chain);
  chain.delete = jest.fn<Chain, []>(() => chain);
  chain.eq = jest.fn<Chain, [string, string]>(() => chain);
  chain.gt = jest.fn<Chain, [string, string]>(() => chain);
  chain.lt = jest.fn<Promise<unknown>, [string, string]>(() =>
    Promise.resolve(result),
  );
  chain.insert = jest.fn<Promise<unknown>, [Record<string, unknown>]>(() =>
    Promise.resolve(result),
  );
  chain.maybeSingle = jest.fn<Promise<unknown>, []>(() =>
    Promise.resolve(result),
  );
  return chain;
}

const STATE_FORMAT = /^[A-Za-z0-9_-]{43}$/;

describe('OAuthStateStore', () => {
  let store: OAuthStateStore;
  let mockSupabase: { from: jest.Mock<Chain, [string]> };

  beforeEach(async () => {
    mockSupabase = { from: jest.fn<Chain, [string]>() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthStateStore,
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    }).compile();

    store = module.get(OAuthStateStore);
  });

  // ─── consume ─────────────────────────────────────────────────────────────
  //
  // A correção do uso único, do TTL e do escopo por provedor mora INTEIRA nos
  // filtros deste DELETE. Uma regressão que derrubasse o `.gt('expires_at')`
  // aceitaria `state` vencido sem erro nenhum — por isso eles são travados.

  describe('consume', () => {
    it('apaga filtrando por state, provider e validade, num único comando', async () => {
      const chain = makeChain({
        data: { user_id: 'user-1', code_verifier: 'verifier-1' },
        error: null,
      });
      mockSupabase.from.mockReturnValue(chain);

      const before = Date.now();
      const result = await store.consume('state-abc', 'google_health');

      expect(mockSupabase.from).toHaveBeenCalledWith('oauth_states');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('state', 'state-abc');
      expect(chain.eq).toHaveBeenCalledWith('provider', 'google_health');
      expect(chain.select).toHaveBeenCalledWith('user_id, code_verifier');

      const [column, cutoffIso] = chain.gt.mock.calls[0];
      expect(column).toBe('expires_at');
      expect(new Date(cutoffIso).getTime()).toBeGreaterThanOrEqual(
        before - 1000,
      );

      expect(result).toEqual({ userId: 'user-1', codeVerifier: 'verifier-1' });
    });

    it('devolve null quando nenhuma linha casa (usado, vencido ou de outro provedor)', async () => {
      mockSupabase.from.mockReturnValue(makeChain({ data: null, error: null }));

      await expect(
        store.consume('state-abc', 'google_health'),
      ).resolves.toBeNull();
    });

    it('devolve null para state vazio, sem ir ao banco', async () => {
      await expect(store.consume('', 'google_health')).resolves.toBeNull();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('falha de banco lança — não é confundida com state inválido', async () => {
      mockSupabase.from.mockReturnValue(
        makeChain({ data: null, error: { message: 'connection reset' } }),
      );

      await expect(
        store.consume('state-abc', 'google_health'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('recolhe os vencidos e grava o state com dono, verificador e TTL de 10 min', async () => {
      const gcChain = makeChain({ error: null });
      const insertChain = makeChain({ error: null });
      mockSupabase.from
        .mockReturnValueOnce(gcChain)
        .mockReturnValueOnce(insertChain);

      const before = Date.now();
      const state = await store.create('user-1', 'google_health', 'verifier-1');

      expect(gcChain.delete).toHaveBeenCalled();
      expect(gcChain.lt).toHaveBeenCalledWith('expires_at', expect.any(String));

      const [row] = insertChain.insert.mock.calls[0];
      expect(row).toEqual(
        expect.objectContaining({
          state,
          user_id: 'user-1',
          provider: 'google_health',
          code_verifier: 'verifier-1',
        }),
      );
      const ttl = new Date(row.expires_at as string).getTime() - before;
      expect(ttl).toBeGreaterThanOrEqual(OAUTH_STATE_TTL_MS - 1000);
      expect(ttl).toBeLessThanOrEqual(OAUTH_STATE_TTL_MS + 1000);
    });

    it('emite 256 bits em base64url, diferentes a cada chamada', async () => {
      mockSupabase.from.mockImplementation(() => makeChain({ error: null }));

      const a = await store.create('user-1', 'google_health', null);
      const b = await store.create('user-1', 'google_health', null);

      expect(a).toMatch(STATE_FORMAT);
      expect(b).not.toBe(a);
    });

    it('falha ao gravar lança 503 em vez de devolver um state que não existe', async () => {
      mockSupabase.from
        .mockReturnValueOnce(makeChain({ error: null }))
        .mockReturnValueOnce(
          makeChain({ error: { message: 'relation does not exist' } }),
        );

      await expect(
        store.create('user-1', 'google_health', null),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('falha na coleta dos vencidos não impede a autorização', async () => {
      mockSupabase.from
        .mockReturnValueOnce(makeChain({ error: { message: 'timeout' } }))
        .mockReturnValueOnce(makeChain({ error: null }));

      await expect(
        store.create('user-1', 'google_health', null),
      ).resolves.toMatch(STATE_FORMAT);
    });
  });
});
