import {
  Controller,
  Post,
  Get,
  Body,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { User } from '../../common/decorators';
import { ReadinessService } from './readiness.service';
import { ReadinessCheckInDto } from './dto/readiness.dto';
import { QuestionSetsParserService } from './question-sets-parser.service';

@Controller('readiness')
export class ReadinessController {
  private readonly logger = new Logger(ReadinessController.name);

  constructor(
    private readonly readinessService: ReadinessService,
    private readonly questionSetsParser: QuestionSetsParserService,
  ) {}

  /**
   * ⚠️ A identidade vem de `@User('id')` — NUNCA de `dto.userId`.
   *
   * Esta rota lia o `userId` do BODY, e era a única do backend inteiro a fazer
   * isso. Como o corpo é controlado pelo cliente, qualquer usuário autenticado
   * podia gravar um check-in — e disparar uma chamada de IA paga — no id de
   * outro. `dto.userId` ainda é ACEITO (o app 1.0.9 o envia e o ValidationPipe
   * roda com `forbidNonWhitelisted`), mas não é lido em lugar nenhum.
   */
  @Post('analyze')
  async analyzeReadiness(
    @User('id') userId: string,
    @Body() dto: ReadinessCheckInDto,
  ) {
    this.logger.log(`POST /api/readiness/analyze - userId: ${userId}`);

    // Fora do try: o catch abaixo converteria esta exceção em 500.
    if (!userId) {
      throw new HttpException(
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // A forma de `answers` (presença, campos e faixa 1-5) é validada pelo
    // ValidationPipe global via ReadinessCheckInDto. A checagem manual que
    // existia aqui era uma segunda cópia das mesmas regras.

    try {
      // Check if user already completed check-in today (after 3 AM)
      const existingVerdict =
        await this.readinessService.hasCheckedInToday(userId);
      if (existingVerdict) {
        this.logger.log(
          `User ${userId} already checked in today, returning existing verdict`,
        );
        return {
          ...existingVerdict,
          alreadyCompleted: true,
          message:
            'Check-in já realizado hoje. Próximo disponível amanhã às 03:00 AM.',
        };
      }

      const verdict = await this.readinessService.analyzeReadiness(
        userId,
        dto.answers,
        dto.setNumber,
      );
      return { ...verdict, alreadyCompleted: false };
    } catch (error) {
      // Sem este rethrow, qualquer HttpException levantada aqui dentro (401,
      // 404, 422) viraria um 500 genérico.
      if (error instanceof HttpException) throw error;

      this.logger.error('Failed to analyze readiness', error);
      throw new HttpException(
        'Failed to analyze readiness. Please try again.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status')
  async getReadinessStatus(@User('id') userId: string) {
    this.logger.log(`GET /api/readiness/status - userId: ${userId}`);

    if (!userId) {
      throw new HttpException(
        'x-user-id header is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.readinessService.getReadinessStatus(userId);
    } catch (error) {
      this.logger.error('Failed to get readiness status', error);
      throw new HttpException(
        'Failed to get readiness status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('questions')
  async getQuestions(@User('id') userId: string) {
    this.logger.log(
      `GET /api/readiness/questions - userId: ${userId || 'anonymous'}`,
    );

    try {
      let questionSet;

      if (userId) {
        // User-specific selection with exclusion logic
        questionSet =
          await this.questionSetsParser.getQuestionSetForUser(userId);
      } else {
        // Fallback for anonymous users (legacy behavior)
        questionSet = this.questionSetsParser.getTodaysQuestionSet();
      }

      this.logger.log(
        `Delivering question set ${questionSet.setNumber}: "${questionSet.setName}"`,
      );

      return {
        setNumber: questionSet.setNumber,
        setName: questionSet.setName,
        questions: questionSet.questions,
        nextRotation: this.getNextRotationTime(),
        totalSets: 40,
      };
    } catch (error) {
      this.logger.error('Failed to get questions', error);
      throw new HttpException(
        'Failed to get questions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get the next rotation time (next day at 3 AM São Paulo time)
   */
  private getNextRotationTime(): string {
    const SAO_PAULO_OFFSET_HOURS = -3; // UTC-3

    // Get current UTC time
    const nowUtc = new Date();

    // Convert to São Paulo local time
    const saoPauloNow = new Date(
      nowUtc.getTime() + SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000,
    );
    const saoPauloHour = saoPauloNow.getUTCHours();

    // Calculate next 3 AM in São Paulo (as UTC)
    const next3amSaoPaulo = new Date(
      Date.UTC(
        saoPauloNow.getUTCFullYear(),
        saoPauloNow.getUTCMonth(),
        saoPauloNow.getUTCDate(),
        3 - SAO_PAULO_OFFSET_HOURS, // Convert 3 AM local to UTC (3 - (-3) = 6 UTC)
        0,
        0,
        0,
      ),
    );

    // If current São Paulo time is >= 3 AM, next rotation is tomorrow
    if (saoPauloHour >= 3) {
      next3amSaoPaulo.setUTCDate(next3amSaoPaulo.getUTCDate() + 1);
    }

    return next3amSaoPaulo.toISOString();
  }
}
