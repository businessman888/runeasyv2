import {
  editableFrom,
  isEditableWorkout,
  isEditableTargetDate,
  isPlanEditable,
} from './plan-window.helper';

/**
 * Fase 6.1 — a FRONTEIRA DE EDIÇÃO.
 *
 * O que estes testes protegem, em ordem de importância:
 *   1. HOJE é intocável, mesmo `pending` — é o que protege o treino que o
 *      corredor pode estar correndo agora (o backend não conhece esse estado);
 *   2. terminal, prova e plano encerrado ficam de fora sem heurística de data;
 *   3. a comparação é de STRING `YYYY-MM-DD` — nada de `Date`, nada de fuso.
 *
 * ⚠️ Esta é a metade TypeScript da fronteira. A outra metade é o `WHERE` de
 * `apply_plan_adaptation`, e há um teste de paridade entre as duas em
 * `test/integration/plan-adaptation.int-spec.ts`. Duas cópias da mesma regra é
 * exatamente como a mina 2 nasceu — a diferença é que agora elas são
 * comparadas.
 */

const PLAN = 'plan-ativo';
const TODAY = '2026-08-15';
const ctx = { activePlanId: PLAN, todayStr: TODAY };

const workout = (over: Record<string, unknown> = {}) => ({
  plan_id: PLAN,
  status: 'pending',
  scheduled_date: '2026-08-20',
  is_race_day: false,
  ...over,
});

describe('editableFrom', () => {
  it('é sempre AMANHÃ — hoje inteiro fica congelado', () => {
    expect(editableFrom('2026-08-15')).toBe('2026-08-16');
  });

  it('atravessa a virada de mês sem envolver fuso', () => {
    expect(editableFrom('2026-08-31')).toBe('2026-09-01');
    expect(editableFrom('2026-12-31')).toBe('2027-01-01');
  });

  it('atravessa 29 de fevereiro em ano bissexto', () => {
    expect(editableFrom('2028-02-28')).toBe('2028-02-29');
  });
});

describe('isEditableWorkout', () => {
  it('aceita treino pendente de amanhã em diante', () => {
    expect(isEditableWorkout(workout(), ctx)).toEqual({ editable: true });
    expect(
      isEditableWorkout(workout({ scheduled_date: '2026-08-16' }), ctx),
    ).toEqual({ editable: true });
  });

  it('RECUSA o treino de HOJE mesmo pendente', () => {
    // O caso central da fase: o corredor pode estar correndo agora, e o
    // backend não tem como saber — não existe status `started`.
    expect(isEditableWorkout(workout({ scheduled_date: TODAY }), ctx)).toEqual({
      editable: false,
      reason: 'today_or_past',
    });
  });

  it('recusa o passado', () => {
    expect(
      isEditableWorkout(workout({ scheduled_date: '2026-08-14' }), ctx),
    ).toEqual({ editable: false, reason: 'today_or_past' });
  });

  it.each(['completed', 'skipped', 'missed'])(
    'recusa status terminal: %s',
    (status) => {
      expect(isEditableWorkout(workout({ status }), ctx)).toEqual({
        editable: false,
        reason: 'not_pending',
      });
    },
  );

  it('recusa treino de outro plano — e de plano encerrado', () => {
    expect(isEditableWorkout(workout({ plan_id: 'outro-plano' }), ctx)).toEqual({
      editable: false,
      reason: 'not_in_active_plan',
    });
  });

  it('recusa corrida manual/livre (plan_id nulo)', () => {
    // Sem heurística: `plan_id` nulo NUNCA entra num patch de plano.
    expect(isEditableWorkout(workout({ plan_id: null }), ctx)).toEqual({
      editable: false,
      reason: 'not_in_active_plan',
    });
  });

  it('recusa o dia da prova — invariante do contrato', () => {
    expect(isEditableWorkout(workout({ is_race_day: true }), ctx)).toEqual({
      editable: false,
      reason: 'race_day',
    });
  });

  it('recusa treino sem data', () => {
    expect(isEditableWorkout(workout({ scheduled_date: null }), ctx)).toEqual({
      editable: false,
      reason: 'today_or_past',
    });
  });

  it('a fronteira é comparação de string, não de Date', () => {
    // Se alguém trocar por `new Date(...)`, este caso quebra na TZ do Railway
    // (UTC): 2026-12-31 vira 2027-01-01 e a semana inteira desloca.
    const virada = { activePlanId: PLAN, todayStr: '2026-12-31' };
    expect(
      isEditableWorkout(workout({ scheduled_date: '2027-01-01' }), virada),
    ).toEqual({ editable: true });
    expect(
      isEditableWorkout(workout({ scheduled_date: '2026-12-31' }), virada),
    ).toEqual({ editable: false, reason: 'today_or_past' });
  });
});

describe('isPlanEditable', () => {
  const plan = (over: Record<string, unknown> = {}) => ({
    status: 'active',
    generation_status: 'complete',
    ...over,
  });

  it('aceita plano ativo, completo e com treinos', () => {
    expect(isPlanEditable(plan(), 12)).toEqual({ editable: true });
  });

  it.each(['completed', 'cancelled'])('recusa plano %s', (status) => {
    expect(isPlanEditable(plan({ status }), 12)).toEqual({
      editable: false,
      reason: 'not_active',
    });
  });

  it.each(['generating', 'partial'])(
    'recusa plano em geração (%s)',
    (generation_status) => {
      expect(isPlanEditable(plan({ generation_status }), 0)).toEqual({
        editable: false,
        reason: 'generating',
      });
    },
  );

  it('recusa plano com geração falha', () => {
    expect(isPlanEditable(plan({ generation_status: 'failed' }), 5)).toEqual({
      editable: false,
      reason: 'generation_failed',
    });
  });

  it('recusa "complete" com ZERO treinos', () => {
    // O estado que a ordem antiga de `generateAndSaveFullPlan` produzia:
    // `generation_status='complete'` gravado ANTES dos inserts em lote. A
    // ordem foi corrigida, mas planos criados antes disso existem — daí a
    // contagem ser checada em vez de presumida.
    expect(isPlanEditable(plan(), 0)).toEqual({
      editable: false,
      reason: 'no_workouts',
    });
  });
});

/**
 * Troca de Dias T.0 — a FRONTEIRA DO DESTINO.
 *
 * A outra metade da fronteira. `isEditableWorkout` responde "esta LINHA pode ser
 * tocada?"; esta responde "esta DATA pode receber?". Um remapeamento precisa das
 * duas — e até a Troca de Dias nenhuma feature precisou da segunda, porque
 * nenhuma movia data.
 *
 * ⚠️ Metade TypeScript. A guarda é o `RAISE … RE422` de `apply_plan_adaptation`,
 * e há paridade entre as duas em `test/integration/plan-adaptation.int-spec.ts`.
 */
describe('isEditableTargetDate — a fronteira do DESTINO', () => {
  const ctx = { todayStr: TODAY }; // 2026-08-15

  it('aceita amanhã — o primeiro dia que uma adaptação alcança', () => {
    expect(isEditableTargetDate('2026-08-16', ctx)).toEqual({ editable: true });
  });

  it('aceita qualquer data mais adiante', () => {
    expect(isEditableTargetDate('2026-12-25', ctx)).toEqual({ editable: true });
  });

  it('recusa HOJE — o dia inteiro é congelado', () => {
    // Mesmo motivo da fronteira de origem: o backend não conhece o estado "em
    // execução" (o cursor da corrida vive em MMKV no device). Mover um treino
    // PARA hoje o colocaria num dia que já não é editável.
    expect(isEditableTargetDate(TODAY, ctx)).toEqual({
      editable: false,
      reason: 'new_date_today_or_past',
    });
  });

  it('recusa ontem', () => {
    expect(isEditableTargetDate('2026-08-14', ctx)).toEqual({
      editable: false,
      reason: 'new_date_today_or_past',
    });
  });

  it('recusa o passado distante', () => {
    expect(isEditableTargetDate('2025-01-01', ctx)).toEqual({
      editable: false,
      reason: 'new_date_today_or_past',
    });
  });

  it.each<string | null | undefined>([null, undefined])(
    'aceita %p — o patch não move data, e isso é o NO-OP',
    (v) => {
      // Este caso É o contrato da T.0: a F3, a 6.2 e a 6.3 nunca põem
      // `scheduled_date` no `set`, então nunca chegam à guarda. O SQL faz o
      // mesmo — o `IF` lá é condicionado a `v_set ? 'scheduled_date'`.
      expect(isEditableTargetDate(v, ctx)).toEqual({ editable: true });
    },
  );

  it('a régua é a MESMA de `editableFrom` — origem e destino não divergem', () => {
    // Se estas duas pudessem discordar, um treino poderia sair de um dia que a
    // fronteira protege e cair num que ela também protegeria. É a paridade
    // interna que a paridade com o SQL depois confirma de fora.
    const primeiroValido = editableFrom(TODAY);
    expect(isEditableTargetDate(primeiroValido, ctx).editable).toBe(true);
    expect(isEditableTargetDate(addDay(primeiroValido, -1), ctx).editable).toBe(
      false,
    );
  });

  it('compara STRING, sem `Date` — nada de fuso', () => {
    // A virada do ano é onde uma comparação numérica ingênua quebraria.
    expect(
      isEditableTargetDate('2027-01-01', { todayStr: '2026-12-31' }),
    ).toEqual({ editable: true });
    expect(
      isEditableTargetDate('2026-12-31', { todayStr: '2027-01-01' }),
    ).toEqual({ editable: false, reason: 'new_date_today_or_past' });
  });
});

/** Soma dias a `YYYY-MM-DD` sem envolver fuso — só para o teste acima. */
function addDay(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
