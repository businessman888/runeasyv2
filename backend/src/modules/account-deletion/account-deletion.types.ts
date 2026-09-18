/**
 * Contrato da exclusão de conta. Mora fora do service para que o PRODUTOR
 * (`UsersService`, no `UsersModule`) possa enfileirar sem importar o módulo
 * consumidor — que importa o `DevicesModule`, que importa o `TrainingModule`,
 * que importa o `UsersModule` de volta.
 *
 * É o mesmo desenho de `feedback-queue` e `elevation-queue`: o consumidor
 * registra a fila, o produtor registra a MESMA fila só para injetar o `Queue`.
 */

export const ACCOUNT_DELETION_QUEUE = 'account-deletion-queue';

export const ACCOUNT_DELETION_JOB = 'delete-account';

export interface AccountDeletionJobData {
  /** `user_id` do RunEasy, que é também o `id` em `auth.users`. */
  userId: string;
  /** Quando o usuário pediu. Só para trilha — o relógio de verdade é a coluna. */
  requestedAt: string;
}

/**
 * Tentativas próprias, generosas de propósito.
 *
 * O default global (`app.module.ts`) é 3 tentativas com backoff exponencial de
 * 5 s — 35 segundos no total. Aqui isso é pouco: o job fala com o Google, com o
 * Storage e com o Auth, e uma indisponibilidade de qualquer um deles dura mais
 * que isso. Desistir cedo deixaria a conta em exclusão pela metade, que é
 * exatamente o estado que esta implementação existe para evitar.
 *
 * Retentar é seguro: todo passo antes do `DELETE` final é idempotente.
 */
export const ACCOUNT_DELETION_JOB_OPTIONS = {
  attempts: 8,
  backoff: { type: 'exponential' as const, delay: 30_000 },
} as const;

/** O que foi apagado, por tabela. Vira log estruturado e trilha de auditoria. */
export interface AccountDeletionSummary {
  userId: string;
  /** Contagens ANTES da exclusão — depois, por definição, é tudo zero. */
  counts: Record<string, number>;
  providersDisconnected: string[];
  providersFailed: Array<{ provider: string; reason: string }>;
  storageFilesRemoved: number;
  queuedJobsRemoved: Record<string, number>;
  aiUsageLogsRemoved: number;
}
