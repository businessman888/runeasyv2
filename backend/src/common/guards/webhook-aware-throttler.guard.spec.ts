import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WebhookAwareThrottlerGuard } from './webhook-aware-throttler.guard';
import { GOOGLE_HEALTH_WEBHOOK_PATH } from '../../modules/devices/providers/google-health-webhook-auth';

/**
 * O que este spec trava.
 *
 * O teto de 100 req/min é a ÚNICA defesa restante contra força bruta no
 * segredo do webhook, porque o handshake é um oráculo binário que não dá para
 * fechar (200 com o segredo certo, 401 com o errado — é o contrato de registro
 * do subscriber). A primeira versão usava `@SkipThrottle()` na rota, o que
 * removia o teto para todo mundo.
 *
 * A regra certa é: escapa do teto a CREDENCIAL, não a rota. Se alguém trocar
 * isso de volta por um skip incondicional, estes testes caem.
 */

const SECRET = 'Bearer s3gr3d0-longo-do-subscriber';

function httpContext(
  path: string,
  headers: Record<string, string | string[] | undefined> = {},
): ExecutionContext {
  const req = { originalUrl: path, headers };
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

/** `shouldSkip` é `protected`; o teste precisa alcançá-la. */
type Skippable = { shouldSkip(context: ExecutionContext): Promise<boolean> };

function buildGuard(): Skippable {
  const guard = new WebhookAwareThrottlerGuard(
    [{ ttl: 60000, limit: 100 }] as never,
    {} as never,
    new Reflector(),
  );
  return guard as unknown as Skippable;
}

describe('WebhookAwareThrottlerGuard', () => {
  const original = process.env.GOOGLE_HEALTH_WEBHOOK_SECRET;
  let guard: Skippable;

  beforeEach(() => {
    process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = SECRET;
    guard = buildGuard();
  });

  afterAll(() => {
    if (original === undefined) delete process.env.GOOGLE_HEALTH_WEBHOOK_SECRET;
    else process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = original;
  });

  it('pula o teto para o webhook COM a credencial correta', async () => {
    const skip = await guard.shouldSkip(
      httpContext(GOOGLE_HEALTH_WEBHOOK_PATH, { authorization: SECRET }),
    );
    expect(skip).toBe(true);
  });

  it('NÃO pula o teto para o webhook sem credencial', async () => {
    const skip = await guard.shouldSkip(
      httpContext(GOOGLE_HEALTH_WEBHOOK_PATH),
    );
    expect(skip).toBe(false);
  });

  it('NÃO pula o teto para o webhook com credencial errada', async () => {
    const skip = await guard.shouldSkip(
      httpContext(GOOGLE_HEALTH_WEBHOOK_PATH, {
        authorization: 'Bearer chute-do-atacante',
      }),
    );
    expect(skip).toBe(false);
  });

  it('ignora a query string ao casar o caminho', async () => {
    const skip = await guard.shouldSkip(
      httpContext(`${GOOGLE_HEALTH_WEBHOOK_PATH}?x=1`, {
        authorization: SECRET,
      }),
    );
    expect(skip).toBe(true);
  });

  it('não pula o teto de OUTRA rota, mesmo com a credencial do webhook', async () => {
    // Senão o segredo do webhook viraria um passe livre para a API inteira.
    const skip = await guard.shouldSkip(
      httpContext('/api/training/plans', { authorization: SECRET }),
    );
    expect(skip).toBe(false);
  });

  it('não pula o teto quando o caminho é prefixo do webhook, mas não ele', async () => {
    const skip = await guard.shouldSkip(
      httpContext(`${GOOGLE_HEALTH_WEBHOOK_PATH}/extra`, {
        authorization: SECRET,
      }),
    );
    expect(skip).toBe(false);
  });

  it('sem segredo no ambiente, o teto VALE (fail-closed)', async () => {
    delete process.env.GOOGLE_HEALTH_WEBHOOK_SECRET;
    const skip = await guard.shouldSkip(
      httpContext(GOOGLE_HEALTH_WEBHOOK_PATH, { authorization: SECRET }),
    );
    expect(skip).toBe(false);
  });

  it('com o placeholder do .env.example, o teto VALE', async () => {
    process.env.GOOGLE_HEALTH_WEBHOOK_SECRET =
      'Bearer troque-por-um-aleatorio-longo';
    const skip = await guard.shouldSkip(
      httpContext(GOOGLE_HEALTH_WEBHOOK_PATH, {
        authorization: 'Bearer troque-por-um-aleatorio-longo',
      }),
    );
    expect(skip).toBe(false);
  });

  it('header `authorization` como array não derruba a comparação', async () => {
    const skip = await guard.shouldSkip(
      httpContext(GOOGLE_HEALTH_WEBHOOK_PATH, {
        authorization: [SECRET, SECRET],
      }),
    );
    expect(skip).toBe(false);
  });
});
