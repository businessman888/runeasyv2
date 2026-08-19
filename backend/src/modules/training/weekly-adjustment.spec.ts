import {
  decideAdjustment,
  AdjustmentInput,
  SEVERE_ABSENCE_COMPLETION_PCT,
  VOLUME_SHORTFALL_EXECUTION_PCT,
  MIN_EASY_RUNS_FOR_INTENSITY_CUE,
} from './helpers/weekly-adjustment';

/**
 * Fase 2A — o reajuste sugerido da semana.
 *
 * A decisão é 100% determinística: nenhuma IA escolhe ajuste de treino. Estes
 * testes travam a escada inteira, e em especial as DUAS distinções que ela
 * existe para fazer:
 *
 *  1. Faltar sessão é problema de CALENDÁRIO (classe `schedule`, aplicável
 *     hoje). Correr menos nas sessões que fez é problema de PRESCRIÇÃO (classe
 *     `prescription`, só sugestão até a Fase 6).
 *  2. Sem essa separação, quem faz 3 de 5 treinos correndo a distância cheia em
 *     todos receberia "reduza o volume" — conselho errado, porque o volume não
 *     foi o problema.
 */

/** Semana "no trilho": 5 de 5, distância cheia, ritmo dentro do prescrito. */
const onTrack: AdjustmentInput = {
  plannedWorkouts: 5,
  completedWorkouts: 5,
  completionRate: 100,
  executionRatio: 100,
  easyRunsMeasured: 3,
  easyRunsTooFast: 0,
};

const withInput = (over: Partial<AdjustmentInput>): AdjustmentInput => ({
  ...onTrack,
  ...over,
});

describe('decideAdjustment', () => {
  describe('presença — classe schedule', () => {
    it('0 de 5 → adiar_semana', () => {
      const r = decideAdjustment(
        withInput({
          completedWorkouts: 0,
          completionRate: 0,
          executionRatio: 0,
          easyRunsMeasured: 0,
          easyRunsTooFast: 0,
        }),
      );
      expect(r.code).toBe('adiar_semana');
      expect(r.class).toBe('schedule');
      expect(r.reason).toBe('semana_sem_treino');
    });

    it('2 de 5 → repetir_semana', () => {
      const r = decideAdjustment(
        withInput({ completedWorkouts: 2, completionRate: 40 }),
      );
      expect(r.code).toBe('repetir_semana');
      expect(r.class).toBe('schedule');
      expect(r.reason).toBe('ausencia_severa');
    });

    it('2 de 4 (exatamente metade faltando) → repetir_semana', () => {
      // O limiar é `<=`, não `<`: "metade das sessões faltando" inclui 2 de 4.
      const r = decideAdjustment(
        withInput({
          plannedWorkouts: 4,
          completedWorkouts: 2,
          completionRate: SEVERE_ABSENCE_COMPLETION_PCT,
        }),
      );
      expect(r.code).toBe('repetir_semana');
    });

    it('presença vence execução — não julga o volume de quem quase não apareceu', () => {
      // 1 de 5 E encurtou o único treino. A resposta é a agenda, não o volume:
      // executionRatio sobre uma amostra de tamanho 1 não é diagnóstico.
      const r = decideAdjustment(
        withInput({
          completedWorkouts: 1,
          completionRate: 20,
          executionRatio: 50,
          easyRunsMeasured: 1,
          easyRunsTooFast: 1,
        }),
      );
      expect(r.code).toBe('repetir_semana');
      expect(r.class).toBe('schedule');
    });
  });

  describe('o caso que motivou a escada', () => {
    it('3 de 5 com distância CHEIA → manter (não reduzir_volume)', () => {
      const r = decideAdjustment(
        withInput({
          completedWorkouts: 3,
          completionRate: 60,
          executionRatio: 100,
        }),
      );
      expect(r.code).toBe('manter');
      expect(r.class).toBe('none');
      expect(r.reason).toBe('no_trilho');
    });

    it('3 de 5 ENCURTANDO os treinos → reduzir_volume', () => {
      // Mesma presença, execução diferente: agora o volume É o suspeito.
      const r = decideAdjustment(
        withInput({
          completedWorkouts: 3,
          completionRate: 60,
          executionRatio: 70,
        }),
      );
      expect(r.code).toBe('reduzir_volume');
      expect(r.class).toBe('volume');
      expect(r.reason).toBe('volume_abaixo_do_prescrito');
    });
  });

  describe('intensidade — o cue central', () => {
    it('5 de 5, mas 2 dos 3 fáceis rápidos demais → aliviar_ritmo', () => {
      const r = decideAdjustment(
        withInput({ easyRunsMeasured: 3, easyRunsTooFast: 2 }),
      );
      expect(r.code).toBe('aliviar_ritmo');
      expect(r.class).toBe('prescription');
      expect(r.reason).toBe('ritmo_acima_do_prescrito');
      expect(r.metrics.easyRunsTooFast).toBe(2);
    });

    it('exatamente metade dos fáceis rápidos demais já dispara', () => {
      const r = decideAdjustment(
        withInput({ easyRunsMeasured: 2, easyRunsTooFast: 1 }),
      );
      expect(r.code).toBe('aliviar_ritmo');
    });

    it('n=1 NÃO dispara — uma subida forte não é diagnóstico', () => {
      const r = decideAdjustment(
        withInput({
          easyRunsMeasured: MIN_EASY_RUNS_FOR_INTENSITY_CUE - 1,
          easyRunsTooFast: 1,
        }),
      );
      expect(r.code).toBe('manter');
    });

    it('1 de 3 fáceis rápido demais fica abaixo do share e não dispara', () => {
      const r = decideAdjustment(
        withInput({ easyRunsMeasured: 3, easyRunsTooFast: 1 }),
      );
      expect(r.code).toBe('manter');
    });

    it('INTENSIDADE VENCE VOLUME quando os dois disparam', () => {
      // Correr rápido demais é o erro mais caro (é assim que se lesiona), e
      // quem segura o pace normalmente consegue fechar a distância — aliviar o
      // ritmo tende a resolver os dois.
      const r = decideAdjustment(
        withInput({
          executionRatio: 70, // volume dispararia
          easyRunsMeasured: 3,
          easyRunsTooFast: 3, // intensidade também
        }),
      );
      expect(r.code).toBe('aliviar_ritmo');
    });
  });

  describe('volume — classe volume (aplicável desde a Fase 6.3)', () => {
    it('5 de 5 a 80% da distância → reduzir_volume', () => {
      const r = decideAdjustment(withInput({ executionRatio: 80 }));
      expect(r.code).toBe('reduzir_volume');
      // `volume`, não `prescription`: desde a 6.3 esta sugestão TEM botão. A
      // classe é o que governa a forma do card no app.
      expect(r.class).toBe('volume');
    });

    it('exatamente no limiar NÃO dispara', () => {
      const r = decideAdjustment(
        withInput({ executionRatio: VOLUME_SHORTFALL_EXECUTION_PCT }),
      );
      expect(r.code).toBe('manter');
    });

    it('correr MAIS que o prescrito não vira reduzir_volume', () => {
      const r = decideAdjustment(withInput({ executionRatio: 130 }));
      expect(r.code).toBe('manter');
    });
  });

  describe('classes', () => {
    it('só adiar/repetir são classe schedule (aplicáveis hoje)', () => {
      const scheduleCodes = ['adiar_semana', 'repetir_semana'];
      const cases: AdjustmentInput[] = [
        withInput({ completedWorkouts: 0, completionRate: 0 }),
        withInput({ completedWorkouts: 2, completionRate: 40 }),
        withInput({ easyRunsMeasured: 3, easyRunsTooFast: 3 }),
        withInput({ executionRatio: 60 }),
        withInput({}),
      ];

      for (const input of cases) {
        const r = decideAdjustment(input);
        if (scheduleCodes.includes(r.code)) {
          expect(r.class).toBe('schedule');
        } else if (r.code === 'manter') {
          expect(r.class).toBe('none');
        } else if (r.code === 'reduzir_volume') {
          // Aplicável desde a 6.3, sobre a fundação da Fase 6.
          expect(r.class).toBe('volume');
        } else {
          // Só o ritmo continua represado: pace é da Fase 3, e escrevê-lo aqui
          // reabriria a corrida F3×F6. É a 6.4.
          expect(r.class).toBe('prescription');
        }
      }
    });

    it('sempre carrega os números que dispararam a regra', () => {
      const r = decideAdjustment(
        withInput({ completedWorkouts: 3, completionRate: 60 }),
      );
      expect(r.metrics.plannedWorkouts).toBe(5);
      expect(r.metrics.completedWorkouts).toBe(3);
      expect(r.metrics.completionRate).toBe(60);
    });
  });
});
