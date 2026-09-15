/**
 * O contrato de renovação de token — separado do `TokenRefreshService` para que
 * os provedores possam implementá-lo sem importar o service.
 *
 * ── POR QUE UM ARQUIVO PRÓPRIO ───────────────────────────────────────────────
 *
 * O `TokenRefreshService` injeta os provedores (`GoogleHealthOAuthService`), e o
 * provedor do Google lança `RefreshTokenInvalidError`. Se a classe morasse no
 * service, os dois arquivos se importariam mutuamente — e, com o
 * `emitDecoratorMetadata` do Nest, o tipo do parâmetro injetado seria lido como
 * `undefined` no carregamento do módulo, quebrando a injeção. Este arquivo não
 * importa nada, então não há ciclo.
 */

/** O que uma renovação devolve. */
export interface RefreshedTokens {
  access_token: string;
  /**
   * Só vem de quem ROTACIONA o refresh token a cada uso (Fitbit). O Google não
   * rotaciona e não manda — o refresh token antigo continua valendo.
   */
  refresh_token?: string;
  /** Validade do access token, em segundos. */
  expires_in: number;
  /** Validade do refresh token, em segundos — quando o provedor informa. */
  refresh_token_expires_in?: number;
}

/**
 * O que um provedor OAuth em nuvem precisa oferecer para participar da
 * renovação automática de token. Quem implementa não precisa saber que existe
 * cron, criptografia ou banco: troca um refresh token por tokens novos.
 */
export interface TokenRefresher {
  refreshAccessToken(refreshToken: string): Promise<RefreshedTokens>;
}

/**
 * O provedor recusou o refresh token de forma DEFINITIVA (`invalid_grant`):
 * revogado pelo usuário, vencido (7 dias em modo Teste) ou invalidado por troca
 * de senha. Tentar de novo não adianta — o usuário precisa reconectar.
 *
 * Só quem sabe distinguir esse caso lança esta classe; qualquer outro erro é
 * tratado como transitório (loga, e o cron tenta de novo no ciclo seguinte).
 * Hoje só o Google Health a lança. O Fitbit segue lançando `Error` genérico e
 * por isso fica fora do caminho de estado degradado — o comportamento dele não
 * muda.
 */
export class RefreshTokenInvalidError extends Error {
  /**
   * Código e descrição devolvidos pelo provedor — é o que vai para
   * `last_refresh_error`. Nunca contém token.
   */
  readonly reason: string;

  constructor(reason: string) {
    super(`Refresh token rejected: ${reason}`);
    this.name = 'RefreshTokenInvalidError';
    this.reason = reason;
  }
}
