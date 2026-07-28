import { ConfigService } from '@nestjs/config';
import { AIRouterService } from './ai-router.service';
import { AIUsageService } from './ai-usage.service';

/**
 * Sanitizador de control chars do JSON da IA.
 *
 * Por que este arquivo existe: `escapeControlCharsInStrings` roda em TODO parse
 * de resposta da IA (planos, feedback, retrospectiva) e estava com 0% de
 * cobertura. O docstring dele afirma ser "no-op em JSON bem-formado" — e essa
 * invariante é o que autoriza rodá-lo SEMPRE, antes do primeiro parse. Se ela
 * quebrar, planos válidos são corrompidos em silêncio, e o custo de descobrir
 * isso em produção é uma regeração de ~7 min por usuário.
 *
 * Causa-raiz original (staging, maratona+meia): a IA emitia uma quebra de linha
 * LITERAL dentro de um `coach_note`, e o JSON.parse estourava com
 * "Bad control character in string literal".
 */
describe('AIRouterService — sanitização de control chars', () => {
  /** Acesso tipado aos métodos privados, sem recorrer a `any`. */
  type Internals = {
    escapeControlCharsInStrings(input: string): {
      text: string;
      escapedCount: number;
    };
    extractJSON<T>(text: string): T;
  };

  let internals: Internals;

  beforeEach(() => {
    // Sem ANTHROPIC_API_KEY: o construtor não instancia o cliente Anthropic, e
    // nenhum teste aqui chega perto da rede.
    const config = { get: (): string | undefined => undefined } as unknown as ConfigService;
    const usage = {} as AIUsageService;
    internals = new AIRouterService(config, usage) as unknown as Internals;
  });

  const sanitize = (s: string) => internals.escapeControlCharsInStrings(s);

  // ── A invariante que autoriza rodar sempre ────────────────────────────────

  describe('no-op em JSON bem-formado', () => {
    it('devolve o texto IDÊNTICO e escapedCount 0', () => {
      const valido = JSON.stringify({
        planHeadline: 'Seu plano de 12 semanas',
        duration_weeks: 12,
        frequency_per_week: 4,
        ativo: true,
        vazio: null,
        lista: [1, 2.5, 'três'],
        aninhado: { zone: 'Z1', pace_min: 300, pace_max: 360 },
        // \n e \t JÁ escapados corretamente pelo JSON.stringify.
        coach_note: 'Corra leve.\nSe cansar, caminhe.\tSem culpa.',
      });

      const { text, escapedCount } = sanitize(valido);

      expect(escapedCount).toBe(0);
      expect(text).toBe(valido);
      // A implementação devolve a MESMA referência quando nada mudou.
      expect(text).toStrictEqual(valido);
      expect(JSON.parse(text)).toEqual(JSON.parse(valido));
    });

    it('é no-op num plano realista de várias semanas', () => {
      const plano = JSON.stringify({
        planHeader: {
          objectiveShort: '10km',
          durationWeeks: '12 Sem',
          frequencyWeekly: '4x/Sem',
        },
        planHeadline: 'Rumo aos 10 km com base sólida',
        welcomeBadge: 'Corredor Iniciante',
        nextWorkout: {
          title: 'Rodagem Leve - 5 km',
          duration: '35 min',
          paceEstimate: 'Pace 5:30',
          type: 'run',
        },
        duration_weeks: 2,
        frequency_per_week: 3,
        weeks: [1, 2].map((n) => ({
          week_number: n,
          phase: 'base',
          workouts: [
            {
              day_of_week: 1,
              type: 'easy_run',
              distance_km: 5,
              zone: 'Z1',
              perceived_effort: '3-4/10',
              segments: [
                {
                  type: 'steady',
                  distance_km: 5,
                  pace_min: 551,
                  pace_max: 618,
                  zone: 'Z1',
                  description: 'Ritmo confortável, dá pra conversar',
                },
              ],
              objective: 'Construir base aeróbia',
              tips: ['Comece controlado', 'Respire pelo nariz'],
              coach_note:
                'Aspas "internas" e acentuação: progressão, é fácil demais? Ótimo.',
              scientific_note:
                'Volume em Z1 desenvolve densidade mitocondrial sem fadiga residual.',
            },
          ],
        })),
      });

      const { text, escapedCount } = sanitize(plano);

      expect(escapedCount).toBe(0);
      expect(text).toBe(plano);
    });

    it('não altera JSON com barras invertidas e unicode já escapados', () => {
      const valido = JSON.stringify({
        caminho: 'C:\\Users\\treino',
        emoji: '🏃 bora',
        aspas: 'ele disse "vai"',
      });

      const { text, escapedCount } = sanitize(valido);

      expect(escapedCount).toBe(0);
      expect(text).toBe(valido);
    });
  });

  // ── O conserto: o caso que quebrava em produção ───────────────────────────

  describe('conserta control char cru dentro de string', () => {
    it('escapa quebra de linha literal e o JSON.parse volta a funcionar', () => {
      // Montado à mão: uma quebra de linha CRUA dentro do valor de coach_note.
      const quebrado = '{"coach_note":"Corra leve.\nSe cansar, caminhe."}';

      // Confirma que o problema é real antes de consertar.
      expect(() => JSON.parse(quebrado)).toThrow();

      const { text, escapedCount } = sanitize(quebrado);

      expect(escapedCount).toBe(1);
      expect(JSON.parse(text)).toEqual({
        coach_note: 'Corra leve.\nSe cansar, caminhe.',
      });
    });

    it('mapeia cada control char para seu escape canônico', () => {
      const casos: Array<[string, string]> = [
        ['\b', '\\b'],
        ['\t', '\\t'],
        ['\n', '\\n'],
        ['\f', '\\f'],
        ['\r', '\\r'],
        ['\u0000', '\\u0000'],
        ['\u0001', '\\u0001'],
        ['\u001f', '\\u001f'],
      ];

      for (const [cru, esperado] of casos) {
        const { text, escapedCount } = sanitize(`{"nota":"a${cru}b"}`);
        expect(escapedCount).toBe(1);
        expect(text).toBe(`{"nota":"a${esperado}b"}`);
        expect(JSON.parse(text)).toEqual({ nota: `a${cru}b` });
      }
    });

    it('conta e escapa múltiplos control chars em campos diferentes', () => {
      const quebrado =
        '{"a":"um\ndois","b":"tres\tquatro","c":"cinco\r\nseis"}';

      const { text, escapedCount } = sanitize(quebrado);

      expect(escapedCount).toBe(4); // \n, \t, \r, \n
      expect(JSON.parse(text)).toEqual({
        a: 'um\ndois',
        b: 'tres\tquatro',
        c: 'cinco\r\nseis',
      });
    });
  });

  // ── Os dois modos de corromper que o scanner precisa evitar ───────────────

  describe('não confunde aspa escapada com fim de string', () => {
    it('mantém a estrutura quando há \\" dentro do valor', () => {
      // A aspa escapada NÃO fecha a string — a quebra crua depois dela ainda
      // está DENTRO do valor e precisa ser escapada.
      const quebrado = '{"nota":"ele disse \\"vai\\" e\nfoi"}';

      const { text, escapedCount } = sanitize(quebrado);

      expect(escapedCount).toBe(1);
      expect(JSON.parse(text)).toEqual({ nota: 'ele disse "vai" e\nfoi' });
    });

    it('trata barra invertida escapada (\\\\) sem perder o rastreio de estado', () => {
      // O valor termina em uma barra literal; a aspa seguinte FECHA a string.
      // Se o scanner errasse aqui, a quebra estrutural seguinte seria escapada.
      const entrada = '{"caminho":"dir\\\\",\n"x":1}';

      const { text, escapedCount } = sanitize(entrada);

      expect(escapedCount).toBe(0);
      expect(text).toBe(entrada);
      expect(JSON.parse(text)).toEqual({ caminho: 'dir\\', x: 1 });
    });
  });

  describe('não toca control chars FORA de string', () => {
    it('preserva quebras de linha e indentação estruturais', () => {
      // JSON.stringify com indentação: control chars estruturais em toda parte.
      const identado = JSON.stringify(
        { week_number: 1, phase: 'base', workouts: [] },
        null,
        2,
      );

      expect(identado).toContain('\n'); // garante que o caso é real
      const { text, escapedCount } = sanitize(identado);

      expect(escapedCount).toBe(0);
      expect(text).toBe(identado);
    });

    it('escapa só o control char de dentro, deixando o de fora intacto', () => {
      const misto = '{\n"nota":"a\nb",\n"n":1\n}';

      const { text, escapedCount } = sanitize(misto);

      expect(escapedCount).toBe(1); // só o de dentro da string
      expect(text).toBe('{\n"nota":"a\\nb",\n"n":1\n}');
      expect(JSON.parse(text)).toEqual({ nota: 'a\nb', n: 1 });
    });
  });

  // ── Caminho real de produção (extractJSON) ────────────────────────────────

  describe('extractJSON — integração do sanitizador', () => {
    it('parseia resposta com control char cru sem precisar de retry', () => {
      const resposta = '{"planHeadline":"Semana 1\ncomeça leve","weeks":[]}';

      expect(() => JSON.parse(resposta)).toThrow();
      expect(internals.extractJSON(resposta)).toEqual({
        planHeadline: 'Semana 1\ncomeça leve',
        weeks: [],
      });
    });

    it('desembrulha bloco markdown ```json e ainda saneia', () => {
      const resposta = '```json\n{"nota":"linha1\nlinha2"}\n```';

      expect(internals.extractJSON(resposta)).toEqual({
        nota: 'linha1\nlinha2',
      });
    });

    it('ainda lança quando o JSON está truncado (sanitizador não mascara)', () => {
      // Truncamento é falha real e deve continuar estourando — o sanitizador
      // conserta control char, não resposta cortada pelo max_tokens.
      expect(() => internals.extractJSON('{"weeks":[{"week_number":1,')).toThrow();
    });
  });
});
