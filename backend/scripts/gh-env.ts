/**
 * Trava de ambiente para os scripts `gh:*`.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ──────────────────────────────────────────────
 *
 * Medido em 2026-09-16: o `SUPABASE_URL` do `.env` local aponta para
 * `ndlsxgsccyjspbhzccyp`, que é **PRODUÇÃO**. O projeto de staging só existe ali
 * como `SUPABASE_URL_STAGING`, usado pelos scripts de QA.
 *
 * Isso contraria o que a documentação do projeto vinha afirmando ("backend
 * local aponta para o Supabase de staging") e torna o default muito mais
 * perigoso do que se supunha: um script que suba o contexto da aplicação e
 * escreva no banco estaria escrevendo em PRODUÇÃO, nos dados de usuários reais.
 *
 * Por isso nenhum script `gh:*` roda sem dizer, explicitamente, em que ambiente
 * quer mexer. Não há default: "esqueci de passar a flag" precisa falhar, não
 * escolher por mim.
 */

export type GhEnvName = 'staging' | 'production';

export interface GhEnvChoice {
  name: GhEnvName;
  supabaseHost: string;
}

/**
 * Lê `--env <staging|production>` do `argv`, aponta o `process.env` para o
 * Supabase certo, e devolve o que foi escolhido.
 *
 * Precisa rodar ANTES de `NestFactory.createApplicationContext`: o `dotenv` do
 * `ConfigModule` não sobrescreve variável já presente no `process.env`, então
 * quem escreve primeiro vence.
 */
export function resolveGhEnv(argv: string[]): GhEnvChoice {
  const index = argv.indexOf('--env');
  const requested = index >= 0 ? argv[index + 1] : undefined;

  if (requested !== 'staging' && requested !== 'production') {
    throw new Error(
      'ambiente não informado. Use --env staging (ou --env production).\n' +
        '  Não existe default de propósito: o SUPABASE_URL do .env local aponta\n' +
        '  para PRODUÇÃO, então "esquecer a flag" mexeria em dados reais.',
    );
  }

  if (requested === 'staging') {
    const url = process.env.SUPABASE_URL_STAGING;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING;

    if (!url) {
      throw new Error('SUPABASE_URL_STAGING ausente do .env local.');
    }
    if (!key) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY_STAGING ausente do .env local.\n' +
          '  O backend precisa da service role: a anon key esbarra na RLS e o\n' +
          '  script leria uma tabela vazia achando que não há nada a fazer —\n' +
          '  que é o pior modo de falha possível aqui.\n' +
          '  Copie a service role do projeto de staging no painel do Supabase.',
      );
    }

    // Vence o `.env`, que aponta para produção.
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    process.env.SUPABASE_KEY = key;
  }

  const host = new URL(process.env.SUPABASE_URL).host;

  if (requested === 'production' && !argv.includes('--yes-production')) {
    throw new Error(
      `recusado: --env production exige TAMBÉM --yes-production.\n` +
        `  Alvo seria ${host}, com dados de usuários reais.`,
    );
  }

  return { name: requested, supabaseHost: host };
}

/** Banner de uma linha, para o alvo nunca ser uma surpresa no meio do log. */
export function printGhEnv(choice: GhEnvChoice): void {
  console.log('');
  console.log(
    '  ambiente : %s   (Supabase: %s)',
    choice.name.toUpperCase(),
    choice.supabaseHost,
  );
}
