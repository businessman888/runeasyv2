import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  AI_MODELS,
  AITier,
  FALLBACK_MODEL,
  FEATURE_TIER_MAP,
  TIER_MODEL_MAP,
} from './ai.constants';
import { AICallOptions, AICallResult } from './ai.interfaces';
import { AIUsageService } from './ai-usage.service';

@Injectable()
export class AIRouterService {
  private readonly logger = new Logger(AIRouterService.name);
  private anthropic: Anthropic | null = null;

  constructor(
    private configService: ConfigService,
    private usageService: AIUsageService,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    } else {
      this.logger.warn(
        '[AIRouter] ANTHROPIC_API_KEY not configured — AI calls will fail',
      );
    }
  }

  /** Whether the router has a valid API key and can make calls */
  get isAvailable(): boolean {
    return this.anthropic !== null;
  }

  /**
   * Central method for all AI calls. Handles model routing, logging, and fallback.
   */
  async call<T>(options: AICallOptions): Promise<AICallResult<T>> {
    if (!this.anthropic) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const tier = FEATURE_TIER_MAP[options.featureName];
    const model = options.model || TIER_MODEL_MAP[tier] || AI_MODELS.HAIKU_4_5;

    try {
      return await this.executeCall<T>(model, options, false);
    } catch (error) {
      // Fallback: if EFFICIENCY tier failed and fallback is enabled
      const shouldFallback =
        options.enableFallback !== false &&
        tier === AITier.EFFICIENCY &&
        model !== FALLBACK_MODEL;

      if (shouldFallback) {
        this.logger.warn(
          `[AIRouter] ${model} failed for ${options.featureName}, falling back to ${FALLBACK_MODEL}`,
        );
        return await this.executeCall<T>(FALLBACK_MODEL, options, true);
      }

      throw error;
    }
  }

  private async executeCall<T>(
    model: string,
    options: AICallOptions,
    isFallback: boolean,
  ): Promise<AICallResult<T>> {
    const startTime = Date.now();
    const params = this.buildParams(model, options);

    // Use streaming for large requests to avoid Anthropic SDK timeout guard
    // "Streaming is required for operations that may take longer than 10 minutes"
    const useStreaming = options.maxTokens > 8000;

    // Opções por-requisição (timeout/maxRetries) — sobrescrevem os defaults do
    // SDK (10 min / 2 retries) só nesta chamada, sem tocar o cliente global.
    const requestOptions: { timeout?: number; maxRetries?: number } = {};
    if (options.timeoutMs != null) requestOptions.timeout = options.timeoutMs;
    if (options.maxRetries != null) requestOptions.maxRetries = options.maxRetries;

    try {
      let message: Anthropic.Message;

      if (useStreaming) {
        this.logger.log(
          `[AIRouter] Using streaming for ${options.featureName} ` +
            `(maxTokens: ${options.maxTokens}` +
            `${options.timeoutMs != null ? `, timeout: ${options.timeoutMs}ms` : ''}` +
            `${options.maxRetries != null ? `, maxRetries: ${options.maxRetries}` : ''})`,
        );
        const stream = this.anthropic.messages.stream(
          params as any,
          requestOptions,
        );
        message = await stream.finalMessage();
      } else {
        message = (await this.anthropic.messages.create(
          params as any,
          requestOptions,
        )) as Anthropic.Message;
      }

      const latencyMs = Date.now() - startTime;

      const textBlock = message.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in AI response');
      }

      const data = this.extractJSON<T>(textBlock.text, {
        featureName: options.featureName,
        stopReason: (message as any).stop_reason ?? null,
        maxTokens: options.maxTokens,
      });

      const usage = {
        input_tokens: message.usage?.input_tokens || 0,
        output_tokens: message.usage?.output_tokens || 0,
        cache_creation_input_tokens:
          (message.usage as any)?.cache_creation_input_tokens || 0,
        cache_read_input_tokens:
          (message.usage as any)?.cache_read_input_tokens || 0,
      };

      const cost = this.usageService.calculateCost(model, usage);

      // Fire-and-forget logging
      this.fireUsageLog({
        userId: options.userId,
        featureName: options.featureName,
        modelName: model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationTokens: usage.cache_creation_input_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        estimatedCostUsd: cost,
        latencyMs,
        success: true,
      });

      // stop_reason + chars no log de SUCESSO: se um plano que PASSOU vier com
      // stop_reason='max_tokens' (ou out: perto de maxTokens), já sabemos que
      // estamos raspando o teto e a causa é truncamento — sem esperar uma falha.
      this.logger.log(
        `[AIRouter] ${options.featureName} via ${model} in ${latencyMs}ms ` +
          `(in:${usage.input_tokens} out:${usage.output_tokens}/${options.maxTokens} ` +
          `chars:${textBlock.text.length} stop:${(message as any).stop_reason ?? 'n/a'} ` +
          `cost:$${cost.toFixed(6)})`,
      );

      return { data, usage, model, latencyMs, wasFallback: isFallback };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;

      // Log failure (fire-and-forget)
      this.fireUsageLog({
        userId: options.userId,
        featureName: options.featureName,
        modelName: model,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        estimatedCostUsd: 0,
        latencyMs,
        success: false,
        errorMessage: error?.message?.substring(0, 500),
      });

      throw error;
    }
  }

  /**
   * Fire-and-forget usage logging: never blocks the AI response and never raises
   * an unhandled promise rejection if the write fails — logs a warning instead.
   */
  private fireUsageLog(entry: Parameters<AIUsageService['log']>[0]): void {
    void this.usageService.log(entry).catch((err: unknown) => {
      this.logger.warn(
        `[AIRouter] usage log failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    });
  }

  private buildParams(
    model: string,
    options: AICallOptions,
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {
      model,
      max_tokens: options.maxTokens,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: options.userMessage }],
    };

    // Sonnet 4.6: add thinking (disabled) + output_config for high effort
    if (model === AI_MODELS.SONNET_4_6) {
      params.thinking = { type: 'disabled' };
      params.output_config = { effort: 'high' };
    }

    return params;
  }

  /**
   * Extract JSON from AI response text (handles markdown code blocks).
   *
   * Diagnóstico (Fase B/troubleshooting): quando o parse falha, loga tamanho da
   * resposta, stop_reason e a janela de ±200 chars ao redor da posição do erro.
   * Isso distingue TRUNCAMENTO (stop_reason='max_tokens' e/ou a string TERMINA na
   * posição do erro) de STRING MALFORMADA (a string CONTINUA depois da posição —
   * ex.: aspa não escapada num coach_note PT-BR). Sem isso, a causa exata some.
   */
  private extractJSON<T>(
    text: string,
    meta?: {
      featureName?: string;
      stopReason?: string | null;
      maxTokens?: number;
    },
  ): T {
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

    // Causa-raiz confirmada (staging, maratona+meia): "Bad control character in
    // string literal" — a IA emite uma quebra de linha LITERAL dentro de um
    // coach_note/scientific_note em vez de `\n` escapado. Saneia SEMPRE, antes do
    // parse: é determinístico e no-op em JSON já válido (ver método abaixo), então
    // não depende do retry caro (regeração ~7min/$0.56) pra curar.
    const { text: sanitized, escapedCount } =
      this.escapeControlCharsInStrings(cleaned);
    if (escapedCount > 0) {
      this.logger.warn(
        `[AIRouter] extractJSON escapou ${escapedCount} control char(s) cru(s) em ` +
          `strings de ${meta?.featureName ?? 'unknown'} antes do parse`,
      );
    }

    try {
      return JSON.parse(sanitized) as T;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Extrai "position N" da mensagem do V8 (ex.: "... at position 36222").
      const posMatch = /position (\d+)/.exec(msg);
      const pos = posMatch ? parseInt(posMatch[1], 10) : -1;
      const len = sanitized.length;
      // A string TERMINA no erro? (truncamento) ou CONTINUA? (malformada)
      const endsAtError = pos >= 0 && len - pos <= 2;
      const window =
        pos >= 0
          ? sanitized.slice(Math.max(0, pos - 200), Math.min(len, pos + 200))
          : sanitized.slice(-400);
      this.logger.error(
        `[AIRouter] JSON parse FAILED for ${meta?.featureName ?? 'unknown'} — ` +
          `${msg} | totalChars=${len} errorPos=${pos} escapedCtrl=${escapedCount} ` +
          `stop_reason=${meta?.stopReason ?? 'n/a'} maxTokens=${meta?.maxTokens ?? 'n/a'} | ` +
          `provável=${
            meta?.stopReason === 'max_tokens' || endsAtError
              ? 'TRUNCAMENTO'
              : 'STRING_MALFORMADA'
          } (endsAtError=${endsAtError})\n` +
          `--- janela ±200 chars ao redor da posição do erro ---\n${window}\n---`,
      );
      throw err;
    }
  }

  /**
   * Escapa caracteres de controle CRUS (U+0000–U+001F) que aparecem DENTRO de
   * valores string do JSON. A IA às vezes quebra a linha literalmente num
   * coach_note/scientific_note em vez de escrever `\n`, o que faz o JSON.parse
   * estourar com "Bad control character in string literal".
   *
   * SEGURANÇA (por que é seguro rodar SEMPRE, antes do primeiro parse):
   *  • É um NO-OP em JSON bem-formado. JSON válido nunca tem control char cru
   *    dentro de uma string (estaria escapado), então o único ramo que altera
   *    texto (`inString && código < 0x20`) jamais dispara — retorna o input
   *    intacto (escapedCount=0).
   *  • Só toca o INTERIOR de strings. As quebras de linha ESTRUTURAIS entre
   *    campos ficam fora de string e não são alteradas — logo não corrompe um
   *    plano que já estava bom.
   *  • Rastreia o estado de escape para não confundir `\"` (aspa escapada) com o
   *    fim da string. Scanner de um passo, O(n), sem regex sobre o texto inteiro.
   */
  private escapeControlCharsInStrings(input: string): {
    text: string;
    escapedCount: number;
  } {
    let out = '';
    let inString = false;
    let escaped = false;
    let escapedCount = 0;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      const code = input.charCodeAt(i);

      if (!inString) {
        out += ch;
        if (ch === '"') inString = true;
        continue;
      }

      // Dentro de uma string.
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (code < 0x20) {
        // Control char cru dentro da string → escapa (isto é o conserto).
        switch (code) {
          case 0x08:
            out += '\\b';
            break;
          case 0x09:
            out += '\\t';
            break;
          case 0x0a:
            out += '\\n';
            break;
          case 0x0c:
            out += '\\f';
            break;
          case 0x0d:
            out += '\\r';
            break;
          default:
            out += '\\u' + code.toString(16).padStart(4, '0');
            break;
        }
        escapedCount++;
      } else {
        out += ch;
      }
    }

    // No-op real quando nada mudou: devolve a referência original.
    return escapedCount > 0
      ? { text: out, escapedCount }
      : { text: input, escapedCount: 0 };
  }
}
