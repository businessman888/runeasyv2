import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { SupabaseService } from '../../database';
import { DevicesService } from '../devices/devices.service';
import { VALID_PROVIDERS } from '../devices/device-providers';
import { GOOGLE_HEALTH_SYNC_QUEUE } from '../devices/providers/google-health-webhook.types';
import { AccountDeletionSummary } from './account-deletion.types';

/**
 * Exclusão de conta — a função mais destrutiva do sistema.
 *
 * ── A ORDEM É O CORAÇÃO ──────────────────────────────────────────────────────
 *
 * 1. marcar `deletion_requested_at`        (visível e idempotente)
 * 2. desconectar cada provedor             ← remove subscription E revoga grant
 * 3. apagar o Storage                      (avatares)
 * 4. apagar `ai_usage_logs`                (sem FK: só explícito resolve)
 * 5. drenar os jobs do usuário no Redis
 * 6. apagar `auth.users`                   ← PONTO SEM VOLTA; cascateia tudo
 *
 * **Revogar ANTES de apagar não é preferência, é irreversibilidade.** O token
 * do usuário é a única credencial com que o RunEasy consegue derrubar o grant
 * na conta Google dele. Apagando a linha primeiro, o grant fica vivo para
 * sempre e só o próprio usuário consegue removê-lo — e ele não sabe que
 * precisa. O mesmo vale para a subscription: órfã, ela segue mandando
 * notificação que o webhook não consegue mapear, e a reconciliação da Fase 4
 * passa a acusá-la para sempre.
 *
 * ── POR QUE `auth.users` POR ÚLTIMO, E SOZINHO ───────────────────────────────
 *
 * Quase toda FK do schema é `ON DELETE CASCADE`, mas elas penduram em DOIS pais
 * diferentes: a maioria em `public.users`, e `connected_devices`,
 * `oauth_states` e `points_history` em `auth.users`. Apagar só `public.users`
 * — que era o que a implementação antiga fazia — deixava esses três de fora, e
 * com eles os tokens OAuth de saúde.
 *
 * Apagar `auth.users` cascateia `public.users`, que cascateia todo o resto.
 * Uma operação, e o banco inteiro fica consistente. É também por isso que ela é
 * a ÚLTIMA: antes dela, tudo é reversível e retomável; depois, não há mais o
 * que retomar.
 *
 * ── RETOMADA ─────────────────────────────────────────────────────────────────
 *
 * Os passos 1 a 5 são todos idempotentes. Se o job morrer no meio, o BullMQ
 * retenta e a repetição não faz mal: desconectar o que já foi desconectado,
 * apagar arquivo que já sumiu e drenar fila vazia são no-ops. O único passo que
 * não se repete é o 6, e ele é o último.
 */

/**
 * Tabelas contadas ANTES da exclusão, para a trilha de auditoria.
 *
 * Depois da exclusão a contagem é zero por definição, então o número só tem
 * valor se for colhido antes. Inclui as que somem por cascade: é justamente o
 * que prova que o cascade funcionou.
 */
const AUDITED_TABLES = [
  'activities',
  'ai_feedbacks',
  'ai_usage_logs',
  'connected_devices',
  'notifications',
  'oauth_states',
  'plan_adaptations',
  'plan_meso_insights',
  'plan_retrospectives',
  'plan_vdot_history',
  'plan_week_insights',
  'points_history',
  'readiness_history',
  'training_plan_generation_requests',
  'training_plans',
  'user_badges',
  'user_levels',
  'user_onboarding',
  'workout_briefings',
  'workouts',
] as const;

/** UUID v4 canônico. Ver `assertSingleUser`. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly devicesService: DevicesService,
    @InjectQueue('feedback-queue') private readonly feedbackQueue: Queue,
    @InjectQueue('elevation-queue') private readonly elevationQueue: Queue,
    @InjectQueue(GOOGLE_HEALTH_SYNC_QUEUE)
    private readonly googleHealthQueue: Queue,
  ) {}

  /**
   * A guarda mais importante deste arquivo.
   *
   * Um `user_id` vazio, `undefined` ou `'*'` transformaria todo `.eq()` abaixo
   * numa cláusula que casa com o banco inteiro. Validar o formato ANTES de
   * qualquer consulta é o que impede que um bug de chamador vire perda total —
   * e custa uma regex.
   */
  private assertSingleUser(userId: unknown): asserts userId is string {
    if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
      throw new Error(
        `Exclusão recusada: user_id inválido (${typeof userId}). ` +
          'Só UUID canônico é aceito — a alternativa é uma cláusula que casa com tudo.',
      );
    }
  }

  async deleteAccount(userId: string): Promise<AccountDeletionSummary> {
    this.assertSingleUser(userId);

    const summary: AccountDeletionSummary = {
      userId,
      counts: {},
      providersDisconnected: [],
      providersFailed: [],
      storageFilesRemoved: 0,
      queuedJobsRemoved: {},
      aiUsageLogsRemoved: 0,
    };

    // ── 0. Fotografia, antes de destruir a evidência ──────────────────────
    summary.counts = await this.countRows(userId);
    const activityIds = await this.collectActivityIds(userId);

    // ── 1. Provedores externos, com revogação ─────────────────────────────
    await this.disconnectProviders(userId, summary);

    // ── 2. Storage ────────────────────────────────────────────────────────
    summary.storageFilesRemoved = await this.removeAvatars(userId);

    // ── 3. `ai_usage_logs` — sem FK, cascade nenhum alcança ───────────────
    summary.aiUsageLogsRemoved = await this.removeAiUsageLogs(userId);

    // ── 4. Redis ──────────────────────────────────────────────────────────
    summary.queuedJobsRemoved = await this.drainQueues(userId, activityIds);

    // ── 5. PONTO SEM VOLTA ────────────────────────────────────────────────
    await this.deleteAuthUser(userId);

    this.logger.log(
      `[account-deletion] ${userId} excluído. ${JSON.stringify(summary)}`,
    );
    return summary;
  }

  // ─── Passos ───────────────────────────────────────────────────────────────

  private async countRows(userId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of AUDITED_TABLES) {
      const { count, error } = await this.supabaseService
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      // Contagem é trilha, não pré-condição: uma tabela que não exista neste
      // ambiente não pode impedir a exclusão de acontecer.
      counts[table] = error ? -1 : (count ?? 0);
    }
    return counts;
  }

  /**
   * Os ids das atividades, colhidos ANTES da exclusão.
   *
   * São a única chave para achar os jobs de elevação: o payload de `enrich` é
   * `{ activityId }` e não carrega usuário nenhum. Depois do cascade não há
   * mais como saber quais eram.
   */
  private async collectActivityIds(userId: string): Promise<Set<string>> {
    const { data } = await this.supabaseService
      .from('activities')
      .select('id')
      .eq('user_id', userId);
    return new Set((data ?? []).map((row: { id: string }) => row.id));
  }

  /**
   * Reusa `DevicesService.disconnectDevice`, que já faz remover-subscription →
   * revogar-grant → apagar-linha, na ordem certa e best-effort.
   *
   * Reimplementar aqui criaria uma SEGUNDA ordem de revogação no mesmo sistema,
   * e duas ordens divergem com o tempo — uma ganha correção que a outra não
   * recebe, e a diferença só aparece em produção.
   *
   * Falha de revogação **não** impede a exclusão: o usuário pediu para sair. O
   * que não foi revogado vai para o log com identificador suficiente para
   * correção manual.
   */
  private async disconnectProviders(
    userId: string,
    summary: AccountDeletionSummary,
  ): Promise<void> {
    const { data } = await this.supabaseService
      .from('connected_devices')
      .select('provider')
      .eq('user_id', userId);

    const conectados = (data ?? [])
      .map((row: { provider: string }) => row.provider)
      .filter((p): p is string =>
        (VALID_PROVIDERS as readonly string[]).includes(p),
      );

    for (const provider of conectados) {
      try {
        await this.devicesService.disconnectDevice(userId, provider);
        summary.providersDisconnected.push(provider);
      } catch (error) {
        // `NotFoundException` numa RETENTATIVA é sucesso: a linha já foi
        // apagada na tentativa anterior. Tratar como falha faria o job nunca
        // convergir.
        if (error instanceof NotFoundException) {
          summary.providersDisconnected.push(provider);
          continue;
        }
        const reason = error instanceof Error ? error.message : String(error);
        summary.providersFailed.push({ provider, reason });
        this.logger.error(
          `[account-deletion] ${userId}: ${provider} NÃO foi desconectado (${reason}). ` +
            'O grant pode seguir ativo no provedor — correção manual necessária.',
        );
      }
    }
  }

  /** `avatars/{userId}/…` — a pasta é o próprio id, então listar basta. */
  private async removeAvatars(userId: string): Promise<number> {
    try {
      const { data } = await this.supabaseService.storage
        .from('avatars')
        .list(userId);
      const paths = (data ?? []).map(
        (f: { name: string }) => `${userId}/${f.name}`,
      );
      if (paths.length === 0) return 0;
      await this.supabaseService.storage.from('avatars').remove(paths);
      return paths.length;
    } catch (error) {
      // Storage não tem FK: arquivo órfão não quebra o banco, mas também não
      // some sozinho. Loga e segue — o usuário pediu para sair.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[account-deletion] ${userId}: avatares NÃO removidos (${reason}) — ficam órfãos no Storage`,
      );
      return 0;
    }
  }

  /**
   * `ai_usage_logs` não tem FK NENHUMA — nem para `users`, nem para
   * `auth.users`. Nenhum cascade a alcança, então ou é apagada explicitamente
   * ou fica para sempre.
   */
  private async removeAiUsageLogs(userId: string): Promise<number> {
    const { data, error } = await this.supabaseService
      .from('ai_usage_logs')
      .delete()
      .eq('user_id', userId)
      .select('id');

    if (error) {
      this.logger.error(
        `[account-deletion] ${userId}: ai_usage_logs não apagados (${error.message})`,
      );
      return 0;
    }
    return (data ?? []).length;
  }

  /**
   * Remove da fila o que ainda não rodou.
   *
   * Jobs ATIVOS ficam de fora de propósito: remover um job em execução deixa o
   * worker escrevendo num usuário que já não existe, o que é pior que o job
   * terminar sozinho e falhar sem achar a linha.
   */
  private async drainQueues(
    userId: string,
    activityIds: Set<string>,
  ): Promise<Record<string, number>> {
    const removidos: Record<string, number> = {};

    removidos['feedback-queue'] = await this.removeMatching(
      this.feedbackQueue,
      (data) => data?.userId === userId,
    );

    // `enrich` carrega só `{ activityId }` — sem usuário. Daí a fotografia.
    removidos['elevation-queue'] = await this.removeMatching(
      this.elevationQueue,
      (data) =>
        typeof data?.activityId === 'string' &&
        activityIds.has(data.activityId),
    );

    // O `clientProvidedSubscriptionName` É o `user_id` do RunEasy (Fase 4).
    removidos[GOOGLE_HEALTH_SYNC_QUEUE] = await this.removeMatching(
      this.googleHealthQueue,
      (data) => {
        const n = data?.notification as
          | { clientProvidedSubscriptionName?: string }
          | undefined;
        return n?.clientProvidedSubscriptionName === userId;
      },
    );

    return removidos;
  }

  private async removeMatching(
    queue: Queue,
    matches: (data: Record<string, unknown> | undefined) => boolean,
  ): Promise<number> {
    try {
      const jobs = (await queue.getJobs([
        'waiting',
        'delayed',
        'failed',
        'paused',
      ])) as Array<Job<Record<string, unknown>>>;

      let n = 0;
      for (const job of jobs) {
        if (!matches(job.data)) continue;
        await job.remove();
        n += 1;
      }
      return n;
    } catch (error) {
      // Redis fora do ar não pode impedir a exclusão de dados pessoais. O que
      // sobra na fila falha sozinho quando rodar, sem achar a linha.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[account-deletion] fila ${queue.name} não drenada (${reason})`,
      );
      return 0;
    }
  }

  /**
   * O passo final. Cascateia `public.users` e, por ele, todo o resto — mais
   * `connected_devices`, `oauth_states` e `points_history`, que penduram
   * diretamente aqui e eram justamente os que sobreviviam antes.
   */
  private async deleteAuthUser(userId: string): Promise<void> {
    const { error } = await this.supabaseService.auth.admin.deleteUser(userId);
    if (error) {
      throw new Error(
        `Falha ao remover o usuário do Auth: ${error.message}. ` +
          'Os passos anteriores são idempotentes — reprocessar é seguro.',
      );
    }
  }
}
