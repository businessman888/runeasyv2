import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface ReadinessInput {
    checkIn: {
        sleep: number;      // 1-5
        legs: number;       // 1-5
        mood: number;       // 1-5
        stress: number;     // 1-5
        motivation: number; // 1-5
    };
    trainingLoadData: string;     // Formatted text description
    todayWorkout?: {
        type: string;
        title: string;
        distance_km?: number;
        intensity?: string;
    };
    tomorrowWorkout?: {
        type: string;
        title: string;
    };
}

export interface ReadinessVerdict {
    readiness_score: number;          // 0-100
    status_color: 'green' | 'yellow' | 'red';
    status_label: string;
    ai_analysis: {
        headline: string;
        reasoning: string;
        plan_adjustment: string;
    };
    metrics_summary: Array<{
        label: string;
        value: string;
        sublabel?: string;
        icon: string;
    }>;
    generated_at: string;
}

@Injectable()
export class ReadinessAIService {
    private readonly logger = new Logger(ReadinessAIService.name);
    private anthropic: Anthropic;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }
        this.anthropic = new Anthropic({ apiKey });
    }

    async analyzeReadiness(input: ReadinessInput): Promise<ReadinessVerdict> {
        const systemPrompt = `Você é o 'Head Coach IA' da RunEasy. Sua missão é decidir se o atleta deve manter o plano, reduzir a carga ou descansar hoje.

INPUTS RECEBIDOS:
1. Check-in (1-5): Sono, Pernas, Clima Mental, Estresse, Motivação
2. Carga de Treino (Objetivo): Carga Aguda (7d) vs Crônica (28d) e ACWR
3. Plano (Futuro): Detalhes do treino de hoje e amanhã

LÓGICA DE ANÁLISE (PRIORIDADE MÁXIMA):
- Se Treino de Hoje = 'Alta Intensidade' (intervals, tempo) E ('Pernas' <= 2 OU 'Sono' <= 2), sugira obrigatoriamente um 'Downgrade' ou 'Recuperação Ativa'
- Se ACWR > 1.3, o risco de lesão é elevado; considere sugerir 'Redução de Volume'
- Se ACWR > 1.5, risco CRÍTICO; sugira 'Descanso' independente da motivação
- Se Check-in médio < 2.5, sugira 'Descanso Ativo' ou 'Dia Off'

CÁLCULO DO SCORE (0-100):
- Base: média do check-in * 20 (máximo 100)
- Penalidade ACWR > 1.3: -15 pontos
- Penalidade ACWR > 1.5: -30 pontos
- Bônus ACWR entre 0.8-1.2: +5 pontos

STATUS_COLOR:
- green: score >= 70 (Pronto/Sinal Verde)
- yellow: score 40-69 (Atenção/Sinal Amarelo)
- red: score < 40 (Descanso/Sinal Vermelho)

OUTPUT: Retorne APENAS um objeto JSON válido seguindo o schema abaixo, sem explicações externas:

{
  "readiness_score": 0-100,
  "status_color": "green | yellow | red",
  "status_label": "String curta (ex: Sinal verde, Pronto para o desafio, Dia de recuperação)",
  "ai_analysis": {
    "headline": "Frase de efeito curta e motivacional (max 6 palavras)",
    "reasoning": "Explicação técnica de 2-3 frases cruzando sono/carga/pernas/estresse. Mencione valores específicos.",
    "plan_adjustment": "Instrução prática e específica para o treino de hoje (ex: Mantenha o volume planejado, mas evite sprints máximos hoje)"
  },
  "metrics_summary": [
    { "label": "Sono", "value": "Xh XXm ou X/5", "sublabel": "Estado", "icon": "bed" },
    { "label": "Carga de Treino", "value": "Baixa/Moderada/Alta", "sublabel": "Relative Effort: XX", "icon": "trending-up" },
    { "label": "Energia", "value": "X/10", "sublabel": "Estado atual", "icon": "zap" },
    { "label": "Estresse", "value": "Baixo/Moderado/Alto", "sublabel": "Estado mental", "icon": "brain" }
  ]
}`;

        const checkInAvg = (input.checkIn.sleep + input.checkIn.legs + input.checkIn.mood + input.checkIn.stress + input.checkIn.motivation) / 5;

        const checkInLabels = {
            sleep: ['Péssimo', 'Ruim', 'Ok', 'Bom', 'Excelente'],
            legs: ['Como chumbo', 'Pesadas', 'Normais', 'Leves', 'Com molas'],
            mood: ['Tempestade', 'Nublado', 'Instável', 'Ensolarado', 'Céu limpo'],
            stress: ['Insuportável', 'Pesado', 'Presente', 'Leve', 'Inexistente'],
            motivation: ['Ainda na cama', 'Preciso café', 'Talvez', 'Vamos nessa!', 'Já estou de tênis'],
        };

        const userPrompt = `ANÁLISE DE PRONTIDÃO DO ATLETA

CHECK-IN DIÁRIO (1-5):
- Sono: ${input.checkIn.sleep}/5 (${checkInLabels.sleep[input.checkIn.sleep - 1]})
- Pernas: ${input.checkIn.legs}/5 (${checkInLabels.legs[input.checkIn.legs - 1]})
- Clima Mental: ${input.checkIn.mood}/5 (${checkInLabels.mood[input.checkIn.mood - 1]})
- Estresse: ${input.checkIn.stress}/5 (${checkInLabels.stress[input.checkIn.stress - 1]})
- Motivação: ${input.checkIn.motivation}/5 (${checkInLabels.motivation[input.checkIn.motivation - 1]})
- Média: ${checkInAvg.toFixed(1)}/5

DADOS DE TREINO:
${input.trainingLoadData}

TREINO DE HOJE:
${input.todayWorkout ? `Tipo: ${input.todayWorkout.type}, Título: ${input.todayWorkout.title}, Distância: ${input.todayWorkout.distance_km || 'N/A'}km` : 'Nenhum treino planejado'}

TREINO DE AMANHÃ:
${input.tomorrowWorkout ? `Tipo: ${input.tomorrowWorkout.type}, Título: ${input.tomorrowWorkout.title}` : 'Nenhum treino planejado'}

Hora atual: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

Gere o veredito de prontidão em JSON.`;

        try {
            this.logger.log('Generating readiness verdict with Claude AI...');

            const message = await this.anthropic.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 2000,
                temperature: 0.7,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            });

            const textContent = message.content.find((block) => block.type === 'text');
            if (!textContent || textContent.type !== 'text') {
                throw new Error('No text content in AI response');
            }

            this.logger.log('Received AI response, parsing JSON...');
            const verdict = this.extractJSON(textContent.text);
            verdict.generated_at = new Date().toISOString();

            this.logger.log(`Readiness verdict: score=${verdict.readiness_score}, color=${verdict.status_color}`);
            return verdict;
        } catch (error) {
            this.logger.error('Failed to generate readiness verdict', error);
            throw error;
        }
    }

    private extractJSON(text: string): ReadinessVerdict {
        let cleaned = text.trim();
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.slice(0, -3);
        }
        cleaned = cleaned.trim();

        try {
            return JSON.parse(cleaned);
        } catch (parseError) {
            this.logger.error('Failed to parse JSON from AI response:', cleaned.substring(0, 500));
            throw new Error(`Invalid JSON in AI response: ${parseError}`);
        }
    }
}
