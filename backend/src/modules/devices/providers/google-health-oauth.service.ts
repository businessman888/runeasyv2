import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthStateStore } from '../oauth-state.store';
import {
  RefreshTokenInvalidError,
  RefreshedTokens,
  TokenRefresher,
} from '../token-refresher';
import { generateCodeChallenge, generateCodeVerifier } from './pkce';

/**
 * Caminho do callback abaixo do controller `devices`. A rota é declarada com
 * esta constante e a asserção de boot compara contra ela — as duas não têm como
 * divergir sem que o boot acuse.
 */
export const GOOGLE_HEALTH_CALLBACK_PATH = 'google-health/callback';

/**
 * O caminho que o Nest de fato serve: prefixo global `api` (main.ts) +
 * controller `devices` + a rota. É nisto que o `GOOGLE_HEALTH_REDIRECT_URI`
 * cadastrado no console precisa terminar.
 */
const EXPECTED_CALLBACK_PATHNAME = `/api/devices/${GOOGLE_HEALTH_CALLBACK_PATH}`;

const AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';

/** Os três escopos concedidos no console — e os únicos pedidos. */
export const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.location.readonly',
] as const;

/**
 * Resposta do endpoint de token. `refresh_token_expires_in` só vem quando o
 * acesso é time-based — com a tela de consentimento em modo Teste, 7 dias.
 */
interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
}

/** Erro OAuth do endpoint de token: o código e a descrição curta. */
interface OAuthErrorDetail {
  code: string;
  description?: string;
}

export interface GoogleHealthTokens {
  accessToken: string;
  refreshToken: string;
  /** Validade do ACCESS token (ISO). */
  expiresAt: string;
  /** Validade do REFRESH token (ISO), ou null quando o Google não informa. */
  refreshTokenExpiresAt: string | null;
  /** Escopos CONCEDIDOS, separados por espaço — não os pedidos. */
  scope: string;
}

/**
 * OAuth do Google Health API — autorizar, trocar o code por token e renovar.
 *
 * Fase 3 entrega conexão SEM sincronização: nada aqui busca dado de saúde. O
 * fetch e a ingestão dependem do webhook, que é da Fase 4.
 */
@Injectable()
export class GoogleHealthOAuthService implements TokenRefresher {
  private readonly logger = new Logger(GoogleHealthOAuthService.name);

  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly redirectUri: string | undefined;

  /** Por que a integração está desligada — ou null, se está configurada. */
  private readonly misconfiguration: string | null;

  constructor(
    configService: ConfigService,
    private readonly stateStore: OAuthStateStore,
  ) {
    // Sem fallback hardcoded, de propósito. O Fitbit tinha `|| '23VCWS'`, e o
    // fallback escondia exatamente a configuração que faltava (Mina 23).
    this.clientId = configService.get<string>('GOOGLE_HEALTH_CLIENT_ID');
    this.clientSecret = configService.get<string>(
      'GOOGLE_HEALTH_CLIENT_SECRET',
    );
    this.redirectUri = configService.get<string>('GOOGLE_HEALTH_REDIRECT_URI');
    this.misconfiguration = this.checkConfiguration();
  }

  /**
   * Abre o fluxo e devolve a URL de autorização. O `state` e o verificador PKCE
   * ficam persistidos em `oauth_states`, amarrados ao usuário.
   */
  async generateAuthUrl(userId: string): Promise<string> {
    this.assertConfigured();

    const codeVerifier = generateCodeVerifier();
    const state = await this.stateStore.create(
      userId,
      'google_health',
      codeVerifier,
    );

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: GOOGLE_HEALTH_SCOPES.join(' '),
      // Sem `offline` o refresh token não vem — e só se descobre uma hora
      // depois, quando o access token vence.
      access_type: 'offline',
      // Garante o refresh token também numa reautorização.
      prompt: 'consent',
      state,
      code_challenge: generateCodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });

    return `${AUTH_URI}?${params.toString()}`;
  }

  /**
   * Consome o `state` e troca o code por tokens.
   *
   * O `state` é consumido ANTES da troca e não volta: se a troca falhar, o
   * usuário recomeça o fluxo — o code do Google também é de uso único.
   */
  async exchangeCode(
    code: string,
    state: string,
  ): Promise<{ userId: string; tokens: GoogleHealthTokens }> {
    this.assertConfigured();

    const consumed = await this.stateStore.consume(state, 'google_health');
    if (!consumed) {
      throw new BadRequestException('Invalid or expired state parameter');
    }
    if (!consumed.codeVerifier) {
      throw new BadRequestException('missing_code_verifier');
    }

    const response = await fetch(TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        code_verifier: consumed.codeVerifier,
        grant_type: 'authorization_code',
        // O Google reconfere que é o MESMO redirect_uri da autorização.
        redirect_uri: this.redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      const oauthError = await this.readOAuthError(response);
      this.logger.error(
        `Google Health token exchange failed: ${response.status} ${oauthError.code}`,
      );
      // Status e código OAuth vão na mensagem: `401 invalid_client` é a
      // credencial do app, `400 invalid_grant` é o code. Coisas diferentes.
      throw new Error(
        `Google Health token exchange failed: ${response.status} ${oauthError.code}`,
      );
    }

    const raw = (await response.json()) as GoogleTokenResponse;

    if (!raw.refresh_token) {
      // Sem refresh token a conexão morre quando o access token vencer, em uma
      // hora. Melhor falhar agora, com o motivo, do que gravar algo condenado.
      throw new Error('missing_refresh_token');
    }

    // Evidência do payload real — escopo e prazos, NUNCA tokens.
    this.logger.log(
      `Google Health tokens obtained for user ${consumed.userId} — ` +
        `granted scope: "${raw.scope ?? ''}", ` +
        `expires_in: ${raw.expires_in}s, ` +
        `refresh_token_expires_in: ${raw.refresh_token_expires_in ?? 'absent'}`,
    );

    return {
      userId: consumed.userId,
      tokens: this.toTokens(raw, raw.refresh_token),
    };
  }

  /**
   * Renova o access token — é o `TokenRefresher` que o `TokenRefreshService`
   * despacha para `google_health`.
   *
   * O Google NÃO devolve `refresh_token` na renovação (não rotaciona): o antigo
   * segue valendo, e o service mantém o que está gravado.
   *
   * `invalid_grant` é recusa DEFINITIVA — refresh token revogado pelo usuário,
   * vencido (7 dias em modo Teste) ou invalidado por troca de senha — e vira
   * `RefreshTokenInvalidError`, que marca a conexão como degradada. Qualquer
   * outra falha (rede, 5xx, `invalid_client` por credencial do app) é
   * transitória: o cron tenta de novo no próximo ciclo, e consertar a
   * configuração recupera a conexão sem o usuário precisar fazer nada.
   */
  async refreshAccessToken(refreshToken: string): Promise<RefreshedTokens> {
    this.assertConfigured();

    const response = await fetch(TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const oauthError = await this.readOAuthError(response);
      if (oauthError.code === 'invalid_grant') {
        throw new RefreshTokenInvalidError(
          oauthError.description
            ? `invalid_grant: ${oauthError.description}`
            : 'invalid_grant',
        );
      }
      throw new Error(
        `Google Health token refresh failed: ${response.status} ${oauthError.code}`,
      );
    }

    const raw = (await response.json()) as GoogleTokenResponse;

    return {
      access_token: raw.access_token,
      expires_in: raw.expires_in,
      refresh_token: raw.refresh_token,
      refresh_token_expires_in: raw.refresh_token_expires_in,
    };
  }

  /**
   * Descarta um `state` sem trocar nada — usado quando o usuário nega o
   * consentimento, para que ele não fique reutilizável até o TTL vencer.
   *
   * Best-effort: falhar aqui não pode transformar uma recusa normal em erro.
   */
  async discardState(state: string): Promise<void> {
    try {
      await this.stateStore.consume(state, 'google_health');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to discard Google Health state: ${message}`);
    }
  }

  // ---- Private helpers ----

  /**
   * ── "DERIVE O CAMINHO DA VARIÁVEL" ─────────────────────────────────────────
   *
   * `GOOGLE_HEALTH_REDIRECT_URI` é a fonte da verdade: o Google reconfere,
   * caractere a caractere, que o `redirect_uri` da troca é o cadastrado no
   * console. A rota, porém, não pode ser lida dela — decorators do Nest são
   * avaliados na importação, antes do ConfigModule carregar o `.env`. Então a
   * rota é uma constante, e aqui se confere que a variável termina exatamente
   * nela. Divergência é o `redirect_uri_mismatch` que o usuário veria na cara,
   * antes mesmo da tela de consentimento.
   *
   * ── POR QUE NÃO DERRUBAR O BOOT ────────────────────────────────────────────
   *
   * Ambiente sem estas variáveis (PROD, hoje) sobe normalmente com um WARN, e a
   * rota responde 503 com o motivo no primeiro uso. Lançar aqui tiraria do ar o
   * app inteiro por causa de uma integração que ainda nem tem entrada na UI.
   */
  private checkConfiguration(): string | null {
    const missing = (
      [
        ['GOOGLE_HEALTH_CLIENT_ID', this.clientId],
        ['GOOGLE_HEALTH_CLIENT_SECRET', this.clientSecret],
        ['GOOGLE_HEALTH_REDIRECT_URI', this.redirectUri],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      const reason = `variáveis ausentes: ${missing.join(', ')}`;
      this.logger.warn(`Google Health desligado — ${reason}`);
      return reason;
    }

    let pathname: string;
    try {
      pathname = new URL(this.redirectUri).pathname;
    } catch {
      const reason = 'GOOGLE_HEALTH_REDIRECT_URI não é uma URL válida';
      this.logger.error(`Google Health desligado — ${reason}`);
      return reason;
    }

    if (pathname !== EXPECTED_CALLBACK_PATHNAME) {
      const reason =
        `GOOGLE_HEALTH_REDIRECT_URI termina em "${pathname}", ` +
        `mas a rota servida é "${EXPECTED_CALLBACK_PATHNAME}"`;
      this.logger.error(`Google Health desligado — ${reason}`);
      return reason;
    }

    return null;
  }

  private assertConfigured(): void {
    if (this.misconfiguration) {
      throw new ServiceUnavailableException(
        `Google Health não está configurado: ${this.misconfiguration}`,
      );
    }
  }

  /**
   * Só o código OAuth do erro (`invalid_grant`, `invalid_client`…) e a
   * descrição curta que o acompanha — nunca o corpo inteiro, que pode ecoar
   * parâmetros da requisição.
   */
  private async readOAuthError(response: Response): Promise<OAuthErrorDetail> {
    try {
      const body = (await response.json()) as {
        error?: unknown;
        error_description?: unknown;
      };
      return {
        code: typeof body.error === 'string' ? body.error : 'unknown_error',
        description:
          typeof body.error_description === 'string'
            ? body.error_description
            : undefined,
      };
    } catch {
      return { code: 'unknown_error' };
    }
  }

  private toTokens(
    raw: GoogleTokenResponse,
    refreshToken: string,
  ): GoogleHealthTokens {
    const now = Date.now();
    return {
      accessToken: raw.access_token,
      refreshToken,
      expiresAt: new Date(now + raw.expires_in * 1000).toISOString(),
      refreshTokenExpiresAt:
        typeof raw.refresh_token_expires_in === 'number'
          ? new Date(now + raw.refresh_token_expires_in * 1000).toISOString()
          : null,
      scope: raw.scope ?? '',
    };
  }
}
