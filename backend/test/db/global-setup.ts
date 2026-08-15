/**
 * `globalSetup` do projeto Jest de integração.
 *
 * Monta o schema UMA vez por execução (bootstrap → dump → migrations). Entre
 * testes, `resetData()` só faz TRUNCATE — segundos viram milissegundos.
 *
 * Falhar aqui é falhar RÁPIDO e com instrução: sem o container no ar, o
 * desenvolvedor recebe o comando exato em vez de 40 testes vermelhos com
 * ECONNREFUSED.
 */

import { buildSchema, closePool, assertDisposableTarget } from './db';

export default async function globalSetup(): Promise<void> {
  assertDisposableTarget();

  try {
    await buildSchema();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ECONNREFUSED|ENOTFOUND|timeout/i.test(msg)) {
      throw new Error(
        '[test-db] não consegui conectar no Postgres de teste.\n\n' +
          '  docker compose --profile test up -d postgres-test\n\n' +
          `(erro original: ${msg})`,
      );
    }
    throw err;
  } finally {
    await closePool();
  }
}
