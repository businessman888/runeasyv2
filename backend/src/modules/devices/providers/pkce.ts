import { createHash, randomBytes } from 'crypto';

/**
 * PKCE (RFC 7636), método S256.
 *
 * Mesmo desenho do `FitbitOAuthService`, que o fazia certo. As cópias privadas
 * de lá ficam intocadas de propósito — o Fitbit não é alterado nesta fase — e
 * somem com a remoção dele na Fase 5.
 */

/** 32 bytes → 43 caracteres base64url, dentro do intervalo 43–128 da RFC. */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
