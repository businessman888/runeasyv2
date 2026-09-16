/**
 * Kill-switch dos `@Cron` do app.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * Até aqui não havia trava nenhuma: os cinco `@Cron` do app subiam em qualquer
 * processo que carregasse o `AppModule`. Como o `.env` local aponta para o
 * Supabase de STAGING, um backend rodando na máquina de desenvolvimento não era
 * um ensaio — era o cron de verdade, escrevendo no banco de staging:
 *
 *   00:00 (São Paulo)  retrospectiva + insight semanal → chamada de IA paga e
 *                      notificação push real no aparelho do usuário
 *   04:00              lembrete de treino → push real
 *   07:00              desbloqueio de readiness → escrita em banco
 *   a cada 10 min      refresh de token de dispositivo
 *
 * A regra que se usava no lugar disto era humana ("não suba o backend nos 20
 * min antes desses horários"), o que só funciona enquanto alguém lembra. Esta
 * flag transforma a regra em código.
 *
 * ── A DECISÃO ────────────────────────────────────────────────────────────────
 *
 * 1. `CRONS_ENABLED` definida manda, sempre. `'true'` ou `'1'` liga; qualquer
 *    outro valor desliga.
 * 2. Sem ela, liga APENAS quando `NODE_ENV === 'production'`.
 *
 * O default por `NODE_ENV` funciona porque o Railway seta
 * `NODE_ENV=production` nos DOIS ambientes (medido no painel) — staging e
 * produção continuam com cron, e só o desenvolvimento local fica sem. Um
 * ambiente novo que esqueça de setar `NODE_ENV` nasce SEM cron, que é o lado
 * seguro do erro: lembrete que não sai é visível, lembrete duplicado em
 * produção custou 4.038 pushes/dia por três meses.
 *
 * Valor setado mas ilegível (`CRONS_ENABLED=`, `CRONS_ENABLED=sim`) DESLIGA em
 * vez de cair no default. É um kill-switch: "setado e não claramente ligado"
 * significa desligado, e o log de boot imprime o motivo para o engano não ficar
 * invisível.
 *
 * ── POR QUE `process.env` E NÃO `ConfigService` ──────────────────────────────
 *
 * Quem consome isto é o array de `imports` do `AppModule`, avaliado na
 * importação do módulo — muito antes de existir um injetor de onde tirar o
 * `ConfigService`. `ConfigModule.forRoot()` está no MESMO array, e é ele que
 * carrega o `.env` para dentro do `process.env`; como ele vem antes na lista,
 * um `CRONS_ENABLED` escrito só no `.env` local também é enxergado — desde que
 * a decisão seja tomada na hora da chamada, e não num const de topo de módulo.
 * Daí `cronsDecision()` ser função.
 */

/**
 * Recorte do ambiente que a decisão lê. A assinatura de índice existe para o
 * `process.env` (`NodeJS.ProcessEnv`) ser atribuível a isto — sem ela, o
 * TypeScript recusa por "weak type", já que os dois campos são opcionais.
 */
export interface CronEnv {
  [key: string]: string | undefined;
  CRONS_ENABLED?: string;
  NODE_ENV?: string;
}

export interface CronsDecision {
  /** Se os `@Cron` do app devem ser registrados neste processo. */
  enabled: boolean;
  /** Origem da decisão, curta o bastante para caber no log de boot. */
  reason: string;
}

/** Os únicos valores que LIGAM a flag. Comparados já em minúsculas. */
const TRUTHY = ['true', '1'];

/**
 * Função pura: mesma entrada, mesma saída, sem ler `process.env`. É o que os
 * testes exercitam — provar a decisão subindo o processo é justamente o que
 * não se pode fazer nesta máquina (o `.env` aponta para o staging).
 */
export function resolveCronsEnabled(env: CronEnv): CronsDecision {
  const raw = env.CRONS_ENABLED;

  if (raw !== undefined) {
    const enabled = TRUTHY.includes(raw.trim().toLowerCase());
    return { enabled, reason: `env explícita CRONS_ENABLED="${raw}"` };
  }

  return {
    enabled: env.NODE_ENV === 'production',
    reason: `default por NODE_ENV="${env.NODE_ENV ?? ''}"`,
  };
}

/**
 * A decisão que vale para ESTE processo.
 *
 * Chamada em dois lugares — o `imports` do `AppModule` e o log de boot do
 * `main.ts` — e os dois ocorrem depois de `ConfigModule.forRoot()` ter
 * carregado o `.env`, então as duas respostas são a mesma.
 */
export function cronsDecision(): CronsDecision {
  return resolveCronsEnabled(process.env);
}
