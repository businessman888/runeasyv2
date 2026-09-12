import assert from 'node:assert/strict';
import test from 'node:test';

import {
    deriveReadinessLock,
    describeFloorProgress,
    generatedTimeLabel,
    interpretAnalyzeResponse,
    LEARNING_MESSAGE,
    metricTiles,
    PRO_GATE_MESSAGE,
    signalLabel,
    SIGNAL_TONE,
    toReadinessStatus,
} from '../../src/utils/readinessPresentation.ts';

// O payload que o motor R.1 grava hoje, na ordem em que grava.
const METRICS_R1 = [
    { label: 'Sono', value: '4/5', sublabel: 'Autorrelato', icon: 'bed' },
    { label: 'Pernas', value: '3/5', sublabel: 'Seu normal: 3', icon: 'activity' },
    { label: 'Carga de treino', value: 'Adequada', sublabel: '180 min na semana', icon: 'trending-up' },
    { label: 'Estresse', value: '4/5', sublabel: 'Autorrelato', icon: 'brain' },
];

const VEREDITO = {
    readiness_score: 81,
    status_color: 'green',
    status_label: 'Pronto para treinar',
    ai_analysis: { headline: 'h', reasoning: 'r', plan_adjustment: 'p' },
    metrics_summary: METRICS_R1,
    generated_at: '2026-09-11T10:00:00.000Z',
};

// O que o AllExceptionsFilter realmente põe no fio — sem `learning`.
const corpoDeErro = (statusCode: number, message: unknown) => ({
    statusCode,
    message,
    timestamp: '2026-09-11T10:00:00.000Z',
    path: '/api/readiness/analyze',
});

// ── interpretAnalyzeResponse ─────────────────────────────────────────────────

test('201 com veredito é ok — o Nest responde 201 num @Post sem @HttpCode', () => {
    const r = interpretAnalyzeResponse(201, { ...VEREDITO, alreadyCompleted: false });
    assert.equal(r?.kind, 'ok');
    assert.equal(r?.kind === 'ok' && r.verdict.readiness_score, 81);
});

test('200 também é ok', () => {
    assert.equal(interpretAnalyzeResponse(200, VEREDITO)?.kind, 'ok');
});

test('alreadyCompleted vira ja_respondeu e PRESERVA a mensagem', () => {
    const r = interpretAnalyzeResponse(201, {
        ...VEREDITO,
        alreadyCompleted: true,
        message: 'Check-in já realizado hoje. Próximo disponível amanhã às 03:00 AM.',
    });
    assert.equal(r?.kind, 'ja_respondeu');
    assert.match(r?.kind === 'ja_respondeu' ? r.message ?? '' : '', /03:00/);
});

test('ja_respondeu sem mensagem devolve message null, não string vazia', () => {
    const r = interpretAnalyzeResponse(201, { ...VEREDITO, alreadyCompleted: true });
    assert.equal(r?.kind === 'ja_respondeu' && r.message, null);
});

test('2xx sem score ou com cor fora do enum NÃO é veredito', () => {
    assert.equal(interpretAnalyzeResponse(201, { ...VEREDITO, readiness_score: undefined }), null);
    assert.equal(interpretAnalyzeResponse(201, { ...VEREDITO, readiness_score: Number.NaN }), null);
    assert.equal(interpretAnalyzeResponse(201, { ...VEREDITO, status_color: 'blue' }), null);
});

test('422 com o corpo REAL do filtro vira aprendendo, com learning null', () => {
    const r = interpretAnalyzeResponse(
        422,
        corpoDeErro(422, 'Sua prontidão ainda está aprendendo o seu normal. Continue treinando.'),
    );
    assert.equal(r?.kind, 'aprendendo');
    assert.equal(r?.kind === 'aprendendo' && r.learning, null);
    assert.match(r?.kind === 'aprendendo' ? r.message : '', /aprendendo/);
});

test('422 que um dia traga learning válido o aproveita', () => {
    const r = interpretAnalyzeResponse(422, {
        message: 'x',
        learning: { spanDays: 6, runDays: 3, missingSpanDays: 8, missingRunDays: 3 },
    });
    assert.deepEqual(r?.kind === 'aprendendo' && r.learning, {
        spanDays: 6,
        runDays: 3,
        missingSpanDays: 8,
        missingRunDays: 3,
    });
});

test('422 com learning malformado vira null, e sem mensagem cai no fallback', () => {
    const r = interpretAnalyzeResponse(422, { learning: { spanDays: '6' } });
    assert.equal(r?.kind === 'aprendendo' && r.learning, null);
    assert.equal(r?.kind === 'aprendendo' && r.message, LEARNING_MESSAGE);
});

test('403 é pro_gate — nunca "HTTP 403: {…}" na tela', () => {
    const r = interpretAnalyzeResponse(403, corpoDeErro(403, PRO_GATE_MESSAGE));
    assert.deepEqual(r, { kind: 'pro_gate', message: PRO_GATE_MESSAGE });
});

test('403 com message em array (formato do ValidationPipe) usa o fallback', () => {
    const r = interpretAnalyzeResponse(403, corpoDeErro(403, ['a', 'b']));
    assert.equal(r?.kind === 'pro_gate' && r.message, PRO_GATE_MESSAGE);
});

test('falhas de transporte são null — o store as trata como erro retentável', () => {
    assert.equal(interpretAnalyzeResponse(500, corpoDeErro(500, 'Internal server error')), null);
    assert.equal(interpretAnalyzeResponse(400, corpoDeErro(400, ['answers.sleep must be…'])), null);
    assert.equal(interpretAnalyzeResponse(401, corpoDeErro(401, 'Unauthorized')), null);
    assert.equal(interpretAnalyzeResponse(201, null), null);
    assert.equal(interpretAnalyzeResponse(201, 'texto'), null);
    assert.equal(interpretAnalyzeResponse(201, [VEREDITO]), null);
});

// ── metricTiles — a mina viva ────────────────────────────────────────────────

test('A MINA: a ordem da R.1 sai com o rótulo e o ícone CERTOS, na ordem do payload', () => {
    const tiles = metricTiles(METRICS_R1);
    assert.deepEqual(
        tiles.map((t) => [t.label, t.value, t.icon]),
        [
            ['Sono', '4/5', 'sleep'],
            ['Pernas', '3/5', 'running'],
            ['Carga de treino', 'Adequada', 'trainingLoad'],
            ['Estresse', '4/5', 'stress'],
        ],
    );
    // O rótulo que a tela cravava na posição 2 não pode reaparecer.
    assert.ok(!tiles.some((t) => t.label === 'Energia'));
});

test('o valor de pernas NUNCA sai sob o rótulo de carga', () => {
    const carga = metricTiles(METRICS_R1).find((t) => t.icon === 'trainingLoad');
    assert.equal(carga?.value, 'Adequada');
    assert.equal(carga?.sublabel, '180 min na semana');
});

test('sem dado não há tile: [] / null / undefined viram lista vazia — nada de "7h 30m"', () => {
    assert.deepEqual(metricTiles([]), []);
    assert.deepEqual(metricTiles(null), []);
    assert.deepEqual(metricTiles(undefined), []);
});

test('item sem valor ou sem rótulo some, em vez de ganhar um valor inventado', () => {
    const tiles = metricTiles([
        { label: 'Sono', value: '', icon: 'bed' },
        { label: '', value: '3/5', icon: 'activity' },
        { value: '4/5' },
        null,
        'lixo',
        { label: 'Estresse', value: '4/5', icon: 'brain' },
    ]);
    assert.deepEqual(tiles.map((t) => t.label), ['Estresse']);
});

test('veredito antigo do LLM (tile "Energia") ainda ganha um ícone coerente', () => {
    const [t] = metricTiles([{ label: 'Energia', value: '8/10', icon: 'x' }]);
    assert.equal(t.icon, 'energy');
});

test('rótulo desconhecido — incluindo nome de propriedade herdada — usa o ícone neutro', () => {
    assert.equal(metricTiles([{ label: 'Hidratação', value: 'ok' }])[0].icon, 'readiness');
    // Guarda contra `obj['constructor']` devolver a função de Object.
    assert.equal(metricTiles([{ label: 'constructor', value: 'ok' }])[0].icon, 'readiness');
});

test('sublabel vazio vira null', () => {
    assert.equal(metricTiles([{ label: 'Sono', value: '4/5', sublabel: '  ' }])[0].sublabel, null);
});

// ── describeFloorProgress ────────────────────────────────────────────────────

test('a frase do progresso cita as duas faltas', () => {
    assert.equal(
        describeFloorProgress({ spanDays: 6, runDays: 3, missingSpanDays: 8, missingRunDays: 3 }),
        'Faltam 8 dias e 3 corridas pra desbloquear.',
    );
});

test('só a condição que falta aparece, com concordância', () => {
    assert.equal(
        describeFloorProgress({ spanDays: 14, runDays: 5, missingSpanDays: 0, missingRunDays: 1 }),
        'Falta 1 corrida pra desbloquear.',
    );
    assert.equal(
        describeFloorProgress({ spanDays: 10, runDays: 6, missingSpanDays: 4, missingRunDays: 0 }),
        'Faltam 4 dias pra desbloquear.',
    );
    assert.equal(
        describeFloorProgress({ spanDays: 13, runDays: 5, missingSpanDays: 1, missingRunDays: 1 }),
        'Faltam 1 dia e 1 corrida pra desbloquear.',
    );
});

test('quem nunca correu NÃO lê "faltam 14 dias" — esses dias ainda não começaram', () => {
    const frase = describeFloorProgress({
        spanDays: 0,
        runDays: 0,
        missingSpanDays: 14,
        missingRunDays: 6,
    });
    assert.equal(frase, 'Sua primeira corrida começa a calibragem.');
    assert.ok(!frase.includes('14'));
});

test('sem progresso conhecido, a frase é genérica e verdadeira', () => {
    assert.match(describeFloorProgress(null), /semanas de corridas/);
    assert.match(describeFloorProgress(undefined), /semanas de corridas/);
});

// ── deriveReadinessLock ──────────────────────────────────────────────────────

const STATUS_BASE = {
    isUnlocked: false,
    hasCompletedFirstWorkout: false,
    canCheckInToday: false,
    hasCompletedToday: false,
    lastCheckInDate: null,
    todayVerdict: null,
};

test('status nulo é indisponível — falha de rede não se passa por "não treinou"', () => {
    assert.deepEqual(deriveReadinessLock(null), { kind: 'indisponivel' });
});

test('desbloqueado é aberto', () => {
    assert.deepEqual(deriveReadinessLock({ ...STATUS_BASE, isUnlocked: true }), { kind: 'open' });
});

test('eligibilityReason indisponivel é indisponível', () => {
    assert.deepEqual(
        deriveReadinessLock({ ...STATUS_BASE, eligibilityReason: 'indisponivel', learning: null }),
        { kind: 'indisponivel' },
    );
});

test('abaixo do piso carrega o progresso', () => {
    const learning = { spanDays: 6, runDays: 3, missingSpanDays: 8, missingRunDays: 3 };
    assert.deepEqual(
        deriveReadinessLock({ ...STATUS_BASE, eligibilityReason: 'sem_historico', learning }),
        { kind: 'aprendendo', learning },
    );
});

test('backend anterior à R.1 (sem os campos aditivos) ainda produz um bloqueio válido', () => {
    assert.deepEqual(deriveReadinessLock(STATUS_BASE), { kind: 'aprendendo', learning: null });
});

// ── o semáforo ───────────────────────────────────────────────────────────────

test('o rótulo é o texto do MOTOR, não o mapa estático', () => {
    assert.equal(signalLabel('red', 'Dia de recuperação'), 'Dia de recuperação');
    assert.equal(signalLabel('red', 'Texto novo do motor'), 'Texto novo do motor');
});

test('sem rótulo do motor, cai no fallback — nunca "Sinal azul"', () => {
    assert.equal(signalLabel('green', ''), 'Pronto para treinar');
    assert.equal(signalLabel('green', null), 'Pronto para treinar');
    assert.equal(signalLabel('green'), 'Pronto para treinar');
});

test('o verde é success, não o accent ciano', () => {
    assert.equal(SIGNAL_TONE.green, 'success');
});

// ── generatedTimeLabel ───────────────────────────────────────────────────────

// ── toReadinessStatus ────────────────────────────────────────────────────────

test('o /status da R.1 chega com os três campos aditivos — nada morre num `as`', () => {
    const s = toReadinessStatus({
        ...STATUS_BASE,
        todayAnswers: { sleep: 4, legs: 3, mood: 5, stress: 4, motivation: 5 },
        learning: { spanDays: 6, runDays: 3, missingSpanDays: 8, missingRunDays: 3 },
        eligibilityReason: 'sem_historico',
    });
    assert.equal(s?.eligibilityReason, 'sem_historico');
    assert.equal(s?.learning?.missingSpanDays, 8);
    assert.equal(s?.todayAnswers?.legs, 3);
});

test('todayVerdict malformado de linha antiga vira null, não chega à revisão', () => {
    const s = toReadinessStatus({
        ...STATUS_BASE,
        hasCompletedToday: true,
        todayVerdict: { readiness_score: 'oitenta', status_color: 'green' },
    });
    assert.equal(s?.hasCompletedToday, true);
    assert.equal(s?.todayVerdict, null);
});

test('eligibilityReason desconhecido é descartado; corpo sem isUnlocked é ilegível', () => {
    assert.equal(toReadinessStatus({ ...STATUS_BASE, eligibilityReason: 'zzz' })?.eligibilityReason, undefined);
    assert.equal(toReadinessStatus({ hasCompletedToday: true }), null);
    assert.equal(toReadinessStatus(null), null);
});

test('timestamp ilegível não vira "Invalid Date" na tela', () => {
    assert.equal(generatedTimeLabel(''), null);
    assert.equal(generatedTimeLabel(null), null);
    assert.equal(generatedTimeLabel('não é data'), null);
    assert.match(generatedTimeLabel('2026-09-11T10:00:00.000Z') ?? '', /^\d{2}:\d{2}$/);
});
