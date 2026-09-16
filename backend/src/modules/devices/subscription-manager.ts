/**
 * Contrato de quem sabe remover a subscription de um provedor.
 *
 * Mora fora do service que o implementa pelo mesmo motivo de
 * `token-refresher.ts` e `token-revoker.ts`: o `DevicesService` injeta o
 * provedor, e o provedor precisaria importar o `DevicesService` de volta se o
 * contrato morasse lá. O ciclo de import quebra o `emitDecoratorMetadata` do
 * Nest de um jeito que só aparece em runtime, como dependência `undefined`.
 */
export interface SubscriptionManager {
  /**
   * Remove a subscription do usuário no provedor e zera o estado local.
   *
   * Chamado no disconnect, **antes** da revogação do grant: revogar primeiro
   * tiraria a credencial que a remoção pode precisar. É best-effort — falha
   * vira log e nunca bloqueia o disconnect local, pela mesma razão que a
   * revogação é best-effort: o usuário pediu para desconectar.
   */
  removeSubscriptionForUser(userId: string): Promise<void>;
}
