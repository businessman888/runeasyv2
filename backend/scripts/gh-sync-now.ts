/**
 * Sincroniza as corridas de um usuário AGORA, sem esperar notificação.
 *
 *   npm run gh:sync-now -- --env staging --user <uuid> [--days 7]
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * O caminho normal é o Google avisar, e ele funciona. Mas a notificação é
 * uma coisa que **não se pede**: ela chega quando a atividade muda. Isso deixa
 * dois buracos operacionais reais:
 *
 *  - uma corrida já ingerida não volta. A idempotência por `external_id` —
 *    que é o que impede duplicata — também impede reprocessar. Se o código
 *    mudou depois da ingestão (foi exatamente o caso da rota TCX), a activity
 *    antiga fica com o dado velho e nenhuma reentrega a conserta;
 *  - validar uma mudança exige um humano mexendo no celular, o que não é
 *    ferramenta, é torcida.
 *
 * Este script chama o MESMO processor que o worker chama, com um job de
 * `backfill` montado à mão. O único trecho que ele não exercita é o pulo
 * webhook → fila, e esse é justamente o que a assinatura do Google já prova
 * sozinha a cada entrega.
 *
 * ── POR QUE NÃO ENFILEIRA ────────────────────────────────────────────────────
 *
 * `REDIS_URL` aponta para `redis.railway.internal`, que só resolve DENTRO da
 * rede do Railway. Enfileirar daqui seria escrever num Redis inalcançável.
 * Rodar o processor em processo entrega o mesmo trabalho — e de quebra mostra
 * o resultado na tela em vez de escondê-lo num log remoto.
 */

import { NestFactory } from '@nestjs/core';
import { Job } from 'bullmq';
import { AppModule } from '../src/app.module';
import { GoogleHealthSyncProcessor } from '../src/modules/devices/google-health-sync.processor';
import { GOOGLE_HEALTH_JOB_BACKFILL } from '../src/modules/devices/providers/google-health-webhook.types';
import { cronsDecision } from '../src/common/config/crons-enabled';
import { printGhEnv, resolveGhEnv } from './gh-env';

/** Mensagem de erro a partir de `unknown`, sem stringificação padrão de Object. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error) ?? 'erro desconhecido';
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const alvo = resolveGhEnv(process.argv);
  printGhEnv(alvo);

  const crons = cronsDecision();
  if (crons.enabled) {
    console.error(
      `[gh:sync-now] RECUSADO: os crons estão LIGADOS (${crons.reason}).\n` +
        `  Rode com CRONS_ENABLED=false.`,
    );
    process.exit(1);
  }

  const userId = flag('user');
  if (!userId) {
    console.error('[gh:sync-now] falta --user <uuid>');
    process.exit(1);
  }

  const days = Number(flag('days') ?? 7);
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  console.log('  usuário  : %s', userId);
  console.log(
    '  janela   : %s → %s  (%d dia(s))',
    start.toISOString(),
    end.toISOString(),
    days,
  );
  console.log('');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const processor = app.get(GoogleHealthSyncProcessor);

    // O processor só lê `name` e `data`. Montar o mínimo evita depender da
    // forma interna do `Job` do BullMQ, que muda entre versões.
    const job = {
      name: GOOGLE_HEALTH_JOB_BACKFILL,
      data: {
        userId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      opts: {},
      attemptsMade: 0,
    } as unknown as Job;

    const result = await processor.process(job);
    console.log('');
    console.log('  resultado:', JSON.stringify(result));
    console.log('');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`[gh:sync-now] falhou: ${describeError(error)}`);
  process.exit(1);
});
