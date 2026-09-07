import { Injectable, Logger } from '@nestjs/common';
import { AIRouterService, AI_FEATURES } from '../../common/ai';

import {
  PLAN_ADJUSTMENT_LABELS,
  ReadinessDecision,
} from './helpers/readiness-score.helper';
import {
  AiAnalysis,
  completarComFallback,
  fallbackAnalysis,
} from './readiness-narrative.helper';
import { Dimension } from './helpers/subjective-baseline.helper';

/**
 * As respostas do check-in diário. Fonte ÚNICA do shape.
 *
 * ⚠️ Note que NÃO existe `userId` aqui, e isso é deliberado: a identidade do
 * corredor entra em `ReadinessService.analyzeReadiness` como parâmetro
 * posicional vindo de `@User('id')`. Se um dia alguém tentar reintroduzir o
 * id dentro do payload de respostas, o tipo recusa.
 */
export interface ReadinessAnswers {
  sleep: number; // 1-5
  legs: number; // 1-5
  mood: number; // 1-5
  stress: number; // 1-5
  motivation: number; // 1-5
}

/** O treino que a narrativa pode citar. */
export interface PlannedContext {
  todayWorkout?: {
    type: string;
    title: string;
    distance_km?: number;
    intensity?: string;
  };
  tomorrowWorkout?: { type: string; title: string };
  /**
   * `true` quando a consulta ao plano FALHOU — diferente de "não há treino".
   * Foi essa indistinção que fez 7 de 7 check-ins de produção afirmarem "Sem
   * treino planejado hoje", inclusive para quem tinha 170 treinos no banco.
   */
  workoutLookupFailed?: boolean;
}

export interface ReadinessVerdict {
  readiness_score: number; // 0-100
  status_color: 'green' | 'yellow' | 'red';
  status_label: string;
  ai_analysis: AiAnalysis;
  metrics_summary: Array<{
    label: string;
    value: string;
    sublabel?: string;
    icon: string;
  }>;
  generated_at: string;
}

const NOMES_PT: Record<Dimension, string> = {
  sleep: 'Sono',
  legs: 'Pernas',
  mood: 'Humor',
  stress: 'Estresse',
  motivation: 'Motivação',
};

/**
 * A IA NARRA — ela não decide mais nada.
 *
 * ── O QUE MUDOU ───────────────────────────────────────────────────────────────
 *
 * Este service pedia ao modelo o `readiness_score`, o `status_color`, o
 * `status_label` E o `metrics_summary`, com a aritmética escrita em prosa no
 * system prompt ("Base: média do check-in * 20", "Penalidade ACWR > 1.3: -15").
 * O modelo errava a própria conta: duas linhas de produção com média 4,2 foram
 * gravadas como `score = 42, red` quando a regra dele mesmo daria 84/verde.
 *
 * Agora o veredito chega pronto de `decideReadiness` e o modelo escreve três
 * strings. Se ele cair, `fallbackAnalysis` escreve as mesmas três — o check-in
 * NUNCA morre por causa da IA, que é o que acontece hoje.
 */
@Injectable()
export class ReadinessAIService {
  private readonly logger = new Logger(ReadinessAIService.name);

  constructor(private aiRouter: AIRouterService) {}

  /**
   * ⚠️ NUNCA rejeita e NUNCA devolve campo vazio.
   *
   * Três guardas, no molde de `WeeklyInsightService.generateNarrative`:
   * router indisponível, resposta incompleta, exceção.
   */
  async narrate(
    decision: ReadinessDecision,
    ctx: PlannedContext,
    userId?: string,
  ): Promise<AiAnalysis> {
    if (!this.aiRouter.isAvailable) {
      this.logger.warn('[Readiness] AI router indisponível — narrativa local');
      return fallbackAnalysis(decision);
    }

    try {
      const result = await this.aiRouter.call<Partial<AiAnalysis>>({
        featureName: AI_FEATURES.READINESS,
        userId,
        systemPrompt: [
          {
            type: 'text' as const,
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        userMessage: this.buildUserPrompt(decision, ctx),
        maxTokens: 400,
      });

      return completarComFallback(result.data, decision);
    } catch (error) {
      // `AIRouterService.call` lança por chave ausente, bloco de texto ausente,
      // `JSON.parse` de resposta truncada e qualquer erro de SDK.
      this.logger.error('[Readiness] narrativa via IA falhou', error);
      return fallbackAnalysis(decision);
    }
  }

  /**
   * O `metrics_summary` é montado EM CÓDIGO, e não pedido ao modelo.
   *
   * O prompt antigo pedia `"value": "Xh XXm ou X/5"` e
   * `"sublabel": "Relative Effort: XX"` — e não existe entrada de horas de sono
   * nem de Relative Effort em lugar nenhum do payload. As linhas gravadas em
   * produção contêm número alucinado ou o placeholder literal. É formatação
   * pura de números que o motor já calculou; pedir a um LLM que ecoe número é o
   * defeito medido (4,2 virando "42").
   */
  buildMetricsSummary(
    decision: ReadinessDecision,
  ): ReadinessVerdict['metrics_summary'] {
    const porDimensao = (d: Dimension, icon: string) => {
      const s = decision.signals.find((x) => x.dimension === d);
      return {
        label: NOMES_PT[d],
        value: `${s?.answer ?? '-'}/5`,
        sublabel:
          s && s.mode !== 'absoluto' && s.median !== null
            ? `Seu normal: ${s.median}`
            : 'Autorrelato',
        icon,
      };
    };

    return [
      porDimensao('sleep', 'bed'),
      porDimensao('legs', 'activity'),
      this.tileDeCarga(decision),
      porDimensao('stress', 'brain'),
    ];
  }

  /**
   * O tile de carga — onde o piso de histórico aparece na UI sem campo novo.
   *
   * O card já renderiza os quatro tiles pelo que vem no array, então "Aprendendo
   * — faltam 8 dias e 3 corridas" chega ao corredor sem uma linha de mobile.
   */
  private tileDeCarga(
    decision: ReadinessDecision,
  ): ReadinessVerdict['metrics_summary'][number] {
    const { load } = decision;
    const base = { label: 'Carga de treino', icon: 'trending-up' };

    if (load.reason === 'sem_historico' && load.floorProgress) {
      const { missingSpanDays, missingRunDays } = load.floorProgress;
      const faltas = [
        missingSpanDays > 0 ? `${missingSpanDays} dias` : null,
        missingRunDays > 0 ? `${missingRunDays} corridas` : null,
      ].filter(Boolean);
      return {
        ...base,
        value: 'Aprendendo',
        sublabel: faltas.length ? `Faltam ${faltas.join(' e ')}` : 'Quase lá',
      };
    }

    if (load.reason === 'indisponivel') {
      return {
        ...base,
        value: 'Indisponível',
        sublabel: 'Não consegui consultar',
      };
    }

    if (!load.modulates || load.ratio === null) {
      return {
        ...base,
        value: 'Pouco volume',
        sublabel: 'Sem base para comparar',
      };
    }

    const r = load.ratio;
    const rotulo =
      r >= 1.3
        ? 'Alta'
        : r >= 1.1
          ? 'Moderada-alta'
          : r >= 0.8
            ? 'Adequada'
            : 'Baixa';
    return {
      ...base,
      value: rotulo,
      sublabel: `${Math.round(load.acuteMinPerDay * 7)} min na semana`,
    };
  }

  private buildUserPrompt(d: ReadinessDecision, ctx: PlannedContext): string {
    const dimensoes = d.signals
      .map(
        (s) =>
          `- ${NOMES_PT[s.dimension]}: ${s.answer}/5` +
          (s.mode !== 'absoluto' && s.median !== null
            ? ` (o normal dele é ${s.median})`
            : ''),
      )
      .join('\n');

    // A carga só entra no prompt quando tem direito de falar. Se não tem, o
    // bloco diz explicitamente para não mencioná-la.
    const bloco =
      d.load.modulates && d.load.ratio !== null
        ? `Razão carga recente/habitual: ${d.load.ratio}` +
          (d.load.diasDesdeUltimaCorrida !== null
            ? `\nDias desde a última corrida: ${d.load.diasDesdeUltimaCorrida}`
            : '')
        : d.load.reason === 'sem_historico'
          ? 'APRENDENDO — histórico insuficiente. NÃO mencione carga, volume nem ritmo semanal.'
          : d.load.reason === 'indisponivel'
            ? 'INDISPONÍVEL — falha ao consultar. NÃO mencione carga, volume nem ritmo semanal.'
            : 'VOLUME BAIXO DEMAIS para comparar. NÃO mencione carga, volume nem ritmo semanal.';

    const treino = ctx.todayWorkout
      ? `${ctx.todayWorkout.title} (${ctx.todayWorkout.type}` +
        `${ctx.todayWorkout.distance_km ? `, ${ctx.todayWorkout.distance_km} km` : ''})`
      : ctx.workoutLookupFailed
        ? 'INDISPONÍVEL — falha ao consultar o plano. NÃO afirme que o atleta não tem treino hoje.'
        : 'Nenhum treino planejado';

    return `VEREDITO JÁ DECIDIDO — narre, não recalcule.

Cor do semáforo: ${d.color} (${d.statusLabel})
RECOMENDAÇÃO JÁ DECIDIDA: ${PLAN_ADJUSTMENT_LABELS[d.planAdjustment]}

RESPOSTAS DE HOJE (1-5, onde 5 é o melhor), da que mais pesou para a que menos:
${dimensoes}

CARGA:
${bloco}

TREINO DE HOJE:
${treino}

Escreva o JSON com headline, reasoning e plan_adjustment.`;
  }
}

const SYSTEM_PROMPT = `Você é o treinador da RunEasy comentando o check-in de prontidão do dia.

REGRAS INVIOLÁVEIS:
- O score, a COR e a RECOMENDAÇÃO abaixo JÁ ESTÃO DECIDIDOS. Você NÃO recalcula, NÃO contradiz e NÃO propõe outro ajuste.
- NUNCA cite a pontuação numérica. O número já está na tela; repeti-lo em prosa é como o veredito antigo se contradizia.
- Se o bloco CARGA disser APRENDENDO, INDISPONÍVEL ou VOLUME BAIXO, não mencione carga, ACWR, volume ou ritmo semanal em NENHUMA frase.
- Se houver dias sem correr, trate como retomada — não como excesso de treino.
- 2 a 3 frases no reasoning, segunda pessoa, português do Brasil, tom direto e sem bajulação.
- Você é um treinador, não um médico: nada de diagnóstico, nada de "risco de lesão".
- Responda APENAS com JSON válido:
{"headline":"máx 6 palavras","reasoning":"2-3 frases","plan_adjustment":"uma instrução prática para hoje"}`;
