/**
 * Cria subscription para quem já estava conectado, e reconcilia órfãs.
 *
 *   npm run gh:backfill-subscriptions -- --env staging
 *   npm run gh:backfill-subscriptions -- --env staging --dry-run
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * A Fase 3 entregou conexão SEM sincronização de propósito: o usuário conectava,
 * o token era guardado, e nada era ingerido. Quem conectou naquela janela tem
 * linha em `connected_devices` e `subscription_id` NULL — conectado, mas o
 * Google não avisa ninguém quando ele corre.
 *
 * O mesmo estado aparece em operação normal: a criação da subscription no
 * callback do OAuth é best-effort, porque derrubar uma conexão já consentida por
 * causa de uma chamada de subscription seria trocar um problema pequeno por um
 * grande. Toda falha de lá vira uma pendência que este script resolve.
 *
 * ── AS DUAS DIREÇÕES DE ÓRFÃ ─────────────────────────────────────────────────
 *
 * 1. LOCAL SEM GOOGLE — `subscription_id` NULL. É o caso acima: cria.
 * 2. GOOGLE SEM LOCAL — subscription existe lá e nenhuma linha nossa aponta
 *    para ela. Acontece quando a criação sucede e a escrita local falha, ou
 *    depois de um restore de banco. Ela continua mandando notificação, e o
 *    webhook não consegue mapear o usuário. O script REPORTA essas — não apaga.
 *    Apagar automaticamente uma subscription que talvez pertença a um usuário
 *    real é destrutivo demais para um script de manutenção.
 *
 * É seguro rodar duas vezes: o caminho `already_exists` reconcilia o estado
 * local em vez de falhar.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GoogleHealthSubscriptionsService } from '../src/modules/devices/providers/google-health-subscriptions.service';
import { cronsDecision } from '../src/common/config/crons-enabled';
import { printGhEnv, resolveGhEnv } from './gh-env';

/** Mensagem de erro a partir de `unknown`, sem cair na stringificação padrão de Object. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error) ?? 'erro desconhecido';
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  // O ALVO PRIMEIRO, antes de subir qualquer coisa: o SUPABASE_URL do .env
  // local aponta para PRODUÇÃO (medido). Ver `gh-env.ts`.
  const alvo = resolveGhEnv(process.argv);
  printGhEnv(alvo);

  const crons = cronsDecision();
  if (crons.enabled) {
    console.error(
      `[gh:backfill-subscriptions] RECUSADO: os crons estão LIGADOS (${crons.reason}).\n` +
        `  O .env local aponta para o Supabase de PRODUÇÃO. Rode com CRONS_ENABLED=false.`,
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(GoogleHealthSubscriptionsService);

    const pendentes = await service.findPendingUsers();
    console.log('');
    console.log('  pendentes (local sem Google): %d', pendentes.length);

    const criadas: string[] = [];
    const reconciliadas: string[] = [];
    const adiadas: string[] = [];
    const falhas: Array<{ userId: string; message: string }> = [];

    for (const userId of pendentes) {
      if (dryRun) {
        console.log('    [dry-run] criaria subscription para %s', userId);
        continue;
      }
      try {
        const outcome = await service.createSubscriptionForUser(userId);
        if (outcome.created) criadas.push(userId);
        else if (outcome.reason === 'already_exists')
          reconciliadas.push(userId);
        else adiadas.push(`${userId} (${outcome.reason})`);
      } catch (error) {
        // Uma falha não interrompe o lote: o resto dos usuários não tem culpa,
        // e rodar de novo é seguro.
        falhas.push({
          userId,
          message: describeError(error),
        });
      }
    }

    // Direção 2: existe no Google, não existe aqui.
    //
    // O `name` volta como resource name completo
    // (`projects/…/subscribers/…/subscriptions/<id>`), e o
    // `clientProvidedSubscriptionName` pode nem vir. Comparar o caminho inteiro
    // com o nosso id acusava como órfã justamente a subscription recém-criada —
    // e um alerta que grita sempre é pior que nenhum: ensina a ignorá-lo, e aí
    // a órfã de verdade passa junto.
    const remotas = await service.listSubscriptions();
    const idDe = (nome: string): string => {
      const partes = nome.split('/').filter((p) => p.length > 0);
      return partes.length > 0 ? partes[partes.length - 1] : '';
    };

    // Quem o banco JÁ conhece — não os pendentes, que por definição não têm
    // subscription nenhuma.
    const conhecidas = new Set([
      ...(await service.findKnownSubscriptionIds()),
      ...criadas,
      ...reconciliadas,
    ]);
    const orfas = remotas
      .map((s) => idDe(s.clientProvidedSubscriptionName ?? s.name ?? ''))
      .filter((id) => id.length > 0)
      .filter((id) => !conhecidas.has(id));

    console.log('');
    console.log('  criadas       : %d', criadas.length);
    console.log(
      '  reconciliadas : %d (já existiam no Google)',
      reconciliadas.length,
    );
    console.log('  adiadas       : %d', adiadas.length);
    adiadas.forEach((linha) => console.log('      %s', linha));
    console.log('  falhas        : %d', falhas.length);
    falhas.forEach((f) => console.log('      %s: %s', f.userId, f.message));
    console.log('');
    console.log('  subscriptions no Google: %d', remotas.length);
    if (orfas.length > 0) {
      console.log('');
      console.log(
        '  ⚠️  %d subscription(s) no Google sem linha local correspondente.',
        orfas.length,
      );
      console.log(
        '     Elas continuam mandando notificação que o webhook não mapeia.',
      );
      console.log('     NÃO foram apagadas — confira antes de remover à mão:');
      orfas.forEach((id) => console.log('       %s', id));
    }
    console.log('');

    if (falhas.length > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = describeError(error);
  console.error(`[gh:backfill-subscriptions] falhou: ${message}`);
  process.exit(1);
});
