import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SupabaseService } from '../../database/supabase.service';
import { DeviceProvider } from './device-providers';

/** Quanto tempo um fluxo de autorização pode ficar em aberto. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** 32 bytes = 256 bits de entropia. O `Map` do Fitbit usa 16. */
const STATE_BYTES = 32;

export interface ConsumedOAuthState {
  userId: string;
  codeVerifier: string | null;
}

/**
 * O `state` do OAuth, persistido em `oauth_states` em vez de um `Map` na
 * memória do processo.
 *
 * ── POR QUE ISTO EXISTE (Mina 6) ─────────────────────────────────────────────
 *
 * O callback do provedor chega SEM sessão: é o navegador voltando
 * redirecionado pelo Google. O `state` é a única coisa que liga essa resposta
 * ao `user_id` — sem ele, não há como saber de quem é o token. No `Map`, um
 * deploy ou uma segunda réplica no Railway dentro do TTL perdia o `state` e o
 * callback falhava para um usuário que tinha autorizado corretamente.
 *
 * ── POR QUE TABELA E NÃO REDIS ───────────────────────────────────────────────
 *
 * Redis só existe aqui como transporte do BullMQ — não há cliente injetável, e
 * usá-lo seria infra nova. Localmente ele nem sobe. A tabela dá o uso único
 * atômico de graça (ver `consume`) e deixa o estado inspecionável, que é o que
 * se precisa para provar que ele sobrevive a um restart.
 *
 * Hoje só o Google Health usa. Fitbit e Polar continuam no `Map` deles.
 */
@Injectable()
export class OAuthStateStore {
  private readonly logger = new Logger(OAuthStateStore.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Abre um fluxo de autorização e devolve o `state` a mandar ao provedor.
   */
  async create(
    userId: string,
    provider: DeviceProvider,
    codeVerifier: string | null,
  ): Promise<string> {
    await this.collectExpired();

    const state = randomBytes(STATE_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();

    const { error } = await this.supabaseService.from('oauth_states').insert({
      state,
      user_id: userId,
      provider,
      code_verifier: codeVerifier,
      expires_at: expiresAt,
    });

    if (error) {
      this.logger.error(`Failed to persist OAuth state: ${error.message}`);
      throw new ServiceUnavailableException(
        'Não foi possível iniciar a autorização. Tente novamente.',
      );
    }

    return state;
  }

  /**
   * Consome um `state`: devolve o dono e o verificador PKCE, e o apaga no mesmo
   * comando.
   *
   * ── USO ÚNICO, SEM CORRIDA ──────────────────────────────────────────────────
   *
   * É um `DELETE … RETURNING` só, com o filtro de validade dentro dele. Duas
   * requisições concorrentes com o mesmo `state`: apenas uma recebe a linha.
   * Uma leitura seguida de um delete deixaria as duas lerem "ainda válido".
   *
   * `null` cobre tudo o que torna um `state` inaceitável — nunca emitido, já
   * consumido, vencido, ou emitido para outro provedor — sem distinguir, de
   * propósito: quem chama só precisa saber que não pode seguir.
   *
   * Falha do BANCO é outra coisa, e lança. Tratá-la como `state` inválido
   * mandaria o usuário recomeçar por causa de uma indisponibilidade nossa.
   */
  async consume(
    state: string,
    provider: DeviceProvider,
  ): Promise<ConsumedOAuthState | null> {
    if (!state) return null;

    const { data, error } = await this.supabaseService
      .from('oauth_states')
      .delete()
      .eq('state', state)
      .eq('provider', provider)
      .gt('expires_at', new Date().toISOString())
      .select('user_id, code_verifier')
      .maybeSingle<{ user_id: string; code_verifier: string | null }>();

    if (error) {
      this.logger.error(`Failed to consume OAuth state: ${error.message}`);
      throw new ServiceUnavailableException(
        'Não foi possível concluir a autorização. Tente novamente.',
      );
    }

    if (!data) return null;

    return { userId: data.user_id, codeVerifier: data.code_verifier };
  }

  /**
   * Coleta preguiçosa das linhas vencidas — faz as vezes do TTL nativo que o
   * Redis daria. Um `state` que ninguém consumiu (usuário abandonou o fluxo)
   * vence e fica para trás; é recolhido na próxima autorização.
   *
   * Falhar aqui não pode impedir uma autorização nova: só loga.
   */
  private async collectExpired(): Promise<void> {
    const { error } = await this.supabaseService
      .from('oauth_states')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      this.logger.warn(
        `Failed to collect expired OAuth states: ${error.message}`,
      );
    }
  }
}
