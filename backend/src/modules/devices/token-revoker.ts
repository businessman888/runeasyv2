/**
 * O contrato de revogação de grant — o que um provedor OAuth oferece para que
 * desconectar apague o acesso também do lado dele, e não só a linha no nosso
 * banco (Mina 22).
 *
 * Mora fora do `DevicesService` pelo mesmo motivo do `token-refresher.ts`: os
 * provedores o implementam sem importar o service, e não se fecha ciclo de
 * import com quem os injeta.
 */
export interface TokenRevoker {
  /**
   * Revoga o grant a que o token pertence. Lança se o provedor recusar — quem
   * chama decide se isso bloqueia alguma coisa. Em `disconnectDevice`, não
   * bloqueia: o usuário pediu para desconectar.
   */
  revokeToken(token: string): Promise<void>;
}
