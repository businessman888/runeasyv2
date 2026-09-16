import * as fs from 'fs';
import * as path from 'path';
import { resolveCronsEnabled } from './common/config/crons-enabled';

/**
 * TRAVA — `ScheduleModule.forRoot()` mora em UM lugar só.
 *
 * ── O QUE ESTE TESTE IMPEDE DE VOLTAR ─────────────────────────────────────────
 *
 * `forRoot()` instancia um `ScheduleExplorer`, e cada explorador varre a
 * aplicação INTEIRA registrando TODOS os `@Cron` — não só os do módulo que o
 * importou. Duas chamadas viram um processo com dois agendadores, e todo job
 * dispara em dobro.
 *
 * Foi o que aconteceu por três meses: `readiness.module.ts` e
 * `training.module.ts` chamavam `forRoot()` cada um. Medido em produção em
 * 2026-09-05: 4.038 de 4.140 lembretes de treino duplicados (97,5%), todo dia,
 * desde 20/06/2026. O sintoma era invisível no boot a menos que se reparasse que
 * `ScheduleModule dependencies initialized` aparecia DUAS vezes enquanto o resto
 * do boot aparecia uma.
 *
 * O erro é fácil de repetir porque é intuitivo: "meu módulo tem um @Cron, então
 * ele precisa importar ScheduleModule". Não precisa — `forRoot()` devolve um
 * módulo `global: true`.
 *
 * O teste é textual de propósito. Subir o `AppModule` de verdade exigiria
 * Redis, Supabase e Firebase, e mesmo assim não acusaria a duplicação: dois
 * exploradores registram os crons sem erro nenhum. O que precisa ser garantido
 * é uma propriedade do CÓDIGO-FONTE, e é ela que se verifica aqui.
 */
describe('ScheduleModule.forRoot() — instância única', () => {
  const SRC = path.join(__dirname);
  const CHAMADA = /ScheduleModule\s*\.\s*forRoot\s*\(/;
  const IMPORTA =
    /import\s*\{[^}]*\bScheduleModule\b[^}]*\}\s*from\s*'@nestjs\/schedule'/;

  /**
   * Comentários fora — senão o teste acusa a si mesmo. `readiness.module.ts` e
   * `training.module.ts` carregam um aviso explicando por que NÃO chamam
   * `forRoot()`, e esse aviso precisa citar o nome para servir de aviso.
   * Aproximação suficiente para arquivos de módulo: não há `//` dentro de
   * string aqui, e mesmo que houvesse só apagaria texto — nunca criaria um
   * falso negativo para a chamada que interessa.
   */
  function semComentarios(fonte: string): string {
    return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  }

  function codigoDe(arquivo: string): string {
    return semComentarios(fs.readFileSync(arquivo, 'utf8'));
  }

  function todosOsArquivosTs(dir: string): string[] {
    const saida: string[] = [];
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === 'node_modules') continue;
        saida.push(...todosOsArquivosTs(completo));
      } else if (
        entrada.name.endsWith('.ts') &&
        !entrada.name.endsWith('.spec.ts')
      ) {
        saida.push(completo);
      }
    }
    return saida;
  }

  const arquivosQueChamam = todosOsArquivosTs(SRC)
    .filter((f) => CHAMADA.test(codigoDe(f)))
    .map((f) => path.relative(SRC, f).replace(/\\/g, '/'));

  it('é chamado em exatamente um arquivo, e esse arquivo é o app.module.ts', () => {
    expect(arquivosQueChamam).toEqual(['app.module.ts']);
  });

  it('o app.module.ts realmente o chama', () => {
    expect(codigoDe(path.join(SRC, 'app.module.ts'))).toMatch(CHAMADA);
  });

  it('nenhum módulo de feature importa ScheduleModule', () => {
    // Importar o símbolo sem chamar `forRoot()` não duplica explorador, mas é o
    // primeiro passo de quem vai chamar. Só `app.module.ts` tem motivo.
    const importam = todosOsArquivosTs(SRC)
      .filter((f) => IMPORTA.test(codigoDe(f)))
      .map((f) => path.relative(SRC, f).replace(/\\/g, '/'));

    expect(importam).toEqual(['app.module.ts']);
  });
});

/**
 * TRAVA — o kill-switch dos crons decide certo.
 *
 * ── O QUE ESTE TESTE IMPEDE ──────────────────────────────────────────────────
 *
 * O `AppModule` só registra `@Cron` quando `cronsDecision().enabled` é true.
 * Errar essa decisão tem dois custos assimétricos:
 *
 *  - ligada por engano no desenvolvimento → o backend local aponta para o
 *    Supabase de STAGING e dispara IA paga e push real (00:00, 04:00, 07:00);
 *  - desligada por engano em produção → lembrete de treino que não sai.
 *
 * Testar isso subindo o processo é exatamente o que não se pode fazer nesta
 * máquina, então o que se exercita é a função pura — e é por isso que a
 * decisão mora numa função pura.
 */
describe('CRONS_ENABLED — kill-switch dos @Cron', () => {
  describe('env explícita manda', () => {
    it('"true" liga', () => {
      expect(resolveCronsEnabled({ CRONS_ENABLED: 'true' }).enabled).toBe(true);
    });

    it('"1" liga', () => {
      expect(resolveCronsEnabled({ CRONS_ENABLED: '1' }).enabled).toBe(true);
    });

    it('"false" desliga MESMO com NODE_ENV=production', () => {
      // O kill-switch tem que alcançar o ambiente onde o cron de fato roda —
      // senão ele não é kill-switch, é só um default com outro nome.
      const decisao = resolveCronsEnabled({
        CRONS_ENABLED: 'false',
        NODE_ENV: 'production',
      });

      expect(decisao.enabled).toBe(false);
    });

    it('"true" liga MESMO fora de produção', () => {
      const decisao = resolveCronsEnabled({
        CRONS_ENABLED: 'true',
        NODE_ENV: 'development',
      });

      expect(decisao.enabled).toBe(true);
    });

    it('valor setado mas ilegível desliga, em vez de cair no default', () => {
      // "setado e não claramente ligado" = desligado. Vale inclusive para
      // string vazia, que é o que uma variável esvaziada no painel entrega.
      for (const valor of ['', 'sim', 'yes', 'TRUE ', '0', 'off']) {
        const decisao = resolveCronsEnabled({
          CRONS_ENABLED: valor,
          NODE_ENV: 'production',
        });

        // 'TRUE ' liga — o parse é case-insensitive e apara espaço.
        expect(decisao.enabled).toBe(valor.trim().toLowerCase() === 'true');
      }
    });
  });

  describe('sem a env, o default é NODE_ENV', () => {
    it('liga com NODE_ENV=production (é o que o Railway seta nos dois ambientes)', () => {
      expect(resolveCronsEnabled({ NODE_ENV: 'production' }).enabled).toBe(
        true,
      );
    });

    it('desliga em development', () => {
      expect(resolveCronsEnabled({ NODE_ENV: 'development' }).enabled).toBe(
        false,
      );
    });

    it('desliga sem NODE_ENV nenhum', () => {
      // Ambiente novo que esqueça de setar NODE_ENV nasce SEM cron — o lado
      // seguro do erro.
      expect(resolveCronsEnabled({}).enabled).toBe(false);
    });

    it('desliga em "test" (a suíte não agenda nada)', () => {
      expect(resolveCronsEnabled({ NODE_ENV: 'test' }).enabled).toBe(false);
    });
  });

  describe('o motivo diz de onde veio a decisão', () => {
    it('distingue env explícita de default por NODE_ENV', () => {
      // O log de boot é o único lugar onde se descobre, num container do
      // Railway, por que este processo agenda (ou não) IA e push.
      const explicita = resolveCronsEnabled({
        CRONS_ENABLED: 'false',
        NODE_ENV: 'production',
      }).reason;
      const padrao = resolveCronsEnabled({ NODE_ENV: 'production' }).reason;

      expect(explicita).toContain('CRONS_ENABLED');
      expect(explicita).toContain('false');
      expect(padrao).toContain('NODE_ENV');
      expect(padrao).toContain('production');
      expect(padrao).not.toContain('CRONS_ENABLED');
    });
  });
});
