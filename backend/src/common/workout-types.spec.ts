import {
  ALL_WORKOUT_TYPES,
  HEAVY_TYPES,
  LOAD_WEIGHT_BY_TYPE,
  PROTECTED_FROM_VOLUME_CUT,
  QUALITY_TYPES,
  cedesVolume,
  loadWeightFor,
} from './workout-types';

/**
 * O teste que este arquivo existe para ter: **todo tipo tem peso**.
 *
 * O modo de falha que ele fecha não é hipotético. O readiness tinha um mapa
 * privado de intensidade dentro do service; quando o gerador ganhou
 * `race_simulation` e `repetition`, ninguém abriu aquele arquivo, os dois caíram
 * no default e a regra de prevenção ficou desligada para quem tinha tiro
 * marcado. Nada quebrou, nada avisou. Aqui, um tipo novo sem peso é vermelho.
 */
describe('LOAD_WEIGHT_BY_TYPE', () => {
  it('cobre TODOS os tipos que podem aparecer em workouts.type', () => {
    const semPeso = [...ALL_WORKOUT_TYPES].filter(
      (t) => LOAD_WEIGHT_BY_TYPE[t] === undefined,
    );
    expect(semPeso).toEqual([]);
  });

  it('não tem peso para tipo que não existe (mapa e união não divergem)', () => {
    const sobrando = Object.keys(LOAD_WEIGHT_BY_TYPE).filter(
      (t) => !ALL_WORKOUT_TYPES.has(t),
    );
    expect(sobrando).toEqual([]);
  });

  it('todo peso é finito e positivo', () => {
    for (const peso of Object.values(LOAD_WEIGHT_BY_TYPE)) {
      expect(Number.isFinite(peso)).toBe(true);
      expect(peso).toBeGreaterThan(0);
    }
  });

  it('ancora a escala na rodagem leve = 1,0', () => {
    expect(LOAD_WEIGHT_BY_TYPE.easy_run).toBe(1.0);
    expect(LOAD_WEIGHT_BY_TYPE.free_run).toBe(1.0);
  });

  it('regenerativo pesa menos que a base; qualidade pesa mais', () => {
    expect(LOAD_WEIGHT_BY_TYPE.recovery).toBeLessThan(1.0);
    expect(LOAD_WEIGHT_BY_TYPE.walk_run).toBeLessThan(1.0);

    for (const tipo of QUALITY_TYPES) {
      // `progressive` está em QUALITY_TYPES e é o mais leve dos qualidade —
      // ainda assim tem de custar mais que rodagem.
      expect(LOAD_WEIGHT_BY_TYPE[tipo]).toBeGreaterThan(1.0);
    }
  });

  it('os dois tipos que a R.0 deixou de fora têm peso de qualidade', () => {
    // A dívida concreta que este bloco paga.
    expect(LOAD_WEIGHT_BY_TYPE.race_simulation).toBe(1.5);
    expect(LOAD_WEIGHT_BY_TYPE.repetition).toBe(1.7);
  });
});

describe('loadWeightFor', () => {
  it('devolve o peso do tipo', () => {
    expect(loadWeightFor('intervals')).toBe(1.6);
    expect(loadWeightFor('long_run')).toBe(1.15);
  });

  it('tipo desconhecido, null e undefined pesam como rodagem leve', () => {
    // Default seguro: subestimar faz o motor falar MENOS sobre carga.
    // Superestimar fabricaria o "risco de lesão" que o redesenho existe p/ matar.
    expect(loadWeightFor('tipo_que_nao_existe')).toBe(1.0);
    expect(loadWeightFor(null)).toBe(1.0);
    expect(loadWeightFor(undefined)).toBe(1.0);
    expect(loadWeightFor('')).toBe(1.0);
  });

  it('não confunde chave herdada de Object.prototype', () => {
    // `LOAD_WEIGHT_BY_TYPE['constructor']` devolveria uma função sem o `??`.
    expect(loadWeightFor('constructor')).toBe(1.0);
    expect(loadWeightFor('toString')).toBe(1.0);
  });
});

/**
 * Os três conjuntos que já existiam continuam respondendo as suas perguntas —
 * a adição do quarto bloco não pode ter mexido neles.
 */
describe('os conjuntos anteriores seguem intactos', () => {
  it('race_simulation é protegido do corte mas não é slot de qualidade', () => {
    expect(PROTECTED_FROM_VOLUME_CUT.has('race_simulation')).toBe(true);
    expect(QUALITY_TYPES.has('race_simulation')).toBe(false);
  });

  it('long_run cede volume mas é pesado para a perna', () => {
    expect(cedesVolume('long_run')).toBe(true);
    expect(HEAVY_TYPES.has('long_run')).toBe(true);
  });

  it('tipo desconhecido cede volume (falha segura)', () => {
    expect(cedesVolume('tipo_novo')).toBe(true);
    expect(cedesVolume(null)).toBe(true);
  });
});
