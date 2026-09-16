/**
 * Registra o subscriber do projeto na Google Health API. Uma vez por ambiente.
 *
 *   npm run gh:register-subscriber
 *
 * ── O QUE ACONTECE QUANDO VOCÊ RODA ──────────────────────────────────────────
 *
 * Nós contamos ao Google duas coisas: qual é a URL do nosso webhook, e qual
 * segredo ele deve mandar de volta no header `Authorization` de toda
 * notificação. Esse segredo é o `GOOGLE_HEALTH_WEBHOOK_SECRET` — o MESMO que o
 * backend deployado compara. Se o valor daqui divergir do que está no Railway,
 * o Google vai mandar um segredo que o webhook não reconhece e tudo será
 * recusado com 401.
 *
 * Em seguida o Google faz o handshake de dois passos CONTRA O ENDPOINT
 * DEPLOYADO, na hora:
 *   1. POST com a credencial  → tem que responder 200 ou 201
 *   2. POST sem credencial    → tem que responder 401 ou 403
 * Ele recusa registrar endpoint que aceite requisição não autenticada. Se algum
 * passo falhar, o erro chega como `FAILED_PRECONDITION` e a causa está no log
 * do staging.
 *
 * ── POR QUE SCRIPT, E NÃO UMA ROTA ───────────────────────────────────────────
 *
 * É operação de infraestrutura que acontece uma vez por ambiente. Uma rota
 * administrativa seria superfície nova e permanente num módulo que acabou de
 * ser endurecido; um efeito colateral no boot seria pior ainda, porque o
 * Railway recicla contêiner com frequência e a falha seria silenciosa.
 *
 * É idempotente: rodar de novo devolve "já existia" e não é erro.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GoogleHealthSubscriptionsService } from '../src/modules/devices/providers/google-health-subscriptions.service';
import { cronsDecision } from '../src/common/config/crons-enabled';

/** Mensagem de erro a partir de `unknown`, sem cair na stringificação padrão de Object. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error) ?? 'erro desconhecido';
}

async function main(): Promise<void> {
  // O `.env` local aponta para o Supabase de STAGING. Subir o contexto do Nest
  // com os `@Cron` ligados faria este script disparar IA paga e push real.
  const crons = cronsDecision();
  if (crons.enabled) {
    console.error(
      `[gh:register-subscriber] RECUSADO: os crons estão LIGADOS (${crons.reason}).\n` +
        `  Este script sobe o contexto da aplicação, e o .env local aponta para o\n` +
        `  Supabase de staging — os crons das 00:00, 04:00 e 07:00 escreveriam de\n` +
        `  verdade. Rode com CRONS_ENABLED=false.`,
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(GoogleHealthSubscriptionsService);
    const result = await service.registerSubscriber();

    console.log('');
    console.log('  subscriberId : %s', result.subscriberId);
    console.log('  endpointUri  : %s', result.endpointUri);
    console.log(
      '  resultado    : %s',
      result.created ? 'REGISTRADO agora' : 'já existia (idempotente)',
    );
    console.log('');
    console.log(
      '  O handshake de dois passos passou — o Google recusaria o registro se o',
    );
    console.log(
      '  endpoint respondesse a requisição sem credencial. Próximo passo:',
    );
    console.log('  npm run gh:backfill-subscriptions');
    console.log('');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = describeError(error);
  console.error(`[gh:register-subscriber] falhou: ${message}`);
  process.exit(1);
});
