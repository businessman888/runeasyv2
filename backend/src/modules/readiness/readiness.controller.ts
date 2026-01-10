import { Controller, Post, Get, Body, Headers, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { ReadinessCheckInDto } from './dto/readiness.dto';
import { QuestionSetsParserService } from './question-sets-parser.service';

@Controller('readiness')
export class ReadinessController {
    private readonly logger = new Logger(ReadinessController.name);

    constructor(
        private readonly readinessService: ReadinessService,
        private readonly questionSetsParser: QuestionSetsParserService,
    ) { }

    @Post('analyze')
    async analyzeReadiness(@Body() dto: ReadinessCheckInDto) {
        this.logger.log(`POST /api/readiness/analyze - userId: ${dto.userId}`);

        // Validate input
        if (!dto.userId) {
            throw new HttpException('userId is required', HttpStatus.BAD_REQUEST);
        }

        if (!dto.answers) {
            throw new HttpException('answers object is required', HttpStatus.BAD_REQUEST);
        }

        const requiredFields = ['sleep', 'legs', 'mood', 'stress', 'motivation'];
        for (const field of requiredFields) {
            const value = dto.answers[field as keyof typeof dto.answers];
            if (value === undefined || value < 1 || value > 5) {
                throw new HttpException(
                    `${field} must be a number between 1 and 5`,
                    HttpStatus.BAD_REQUEST,
                );
            }
        }

        try {
            // Check if user already completed check-in today (after 3 AM)
            const existingVerdict = await this.readinessService.hasCheckedInToday(dto.userId);
            if (existingVerdict) {
                this.logger.log(`User ${dto.userId} already checked in today, returning existing verdict`);
                return {
                    ...existingVerdict,
                    alreadyCompleted: true,
                    message: 'Check-in já realizado hoje. Próximo disponível amanhã às 03:00 AM.',
                };
            }

            const verdict = await this.readinessService.analyzeReadiness(dto);
            return { ...verdict, alreadyCompleted: false };
        } catch (error) {
            this.logger.error('Failed to analyze readiness', error);
            throw new HttpException(
                'Failed to analyze readiness. Please try again.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('status')
    async getReadinessStatus(@Headers('x-user-id') userId: string) {
        this.logger.log(`GET /api/readiness/status - userId: ${userId}`);

        if (!userId) {
            throw new HttpException('x-user-id header is required', HttpStatus.BAD_REQUEST);
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
    async getQuestions() {
        this.logger.log('GET /api/readiness/questions');

        try {
            // Get today's question set using timezone-aware selection
            const questionSet = this.questionSetsParser.getTodaysQuestionSet();

            this.logger.log(`Using question set ${questionSet.setNumber}: "${questionSet.setName}"`);

            return {
                setNumber: questionSet.setNumber,
                setName: questionSet.setName,
                questions: questionSet.questions,
                nextRotation: this.getNextRotationTime(),
                totalSets: this.questionSetsParser.getAllSets().length,
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
        const saoPauloNow = new Date(nowUtc.getTime() + (SAO_PAULO_OFFSET_HOURS * 60 * 60 * 1000));
        const saoPauloHour = saoPauloNow.getUTCHours();

        // Calculate next 3 AM in São Paulo (as UTC)
        const next3amSaoPaulo = new Date(Date.UTC(
            saoPauloNow.getUTCFullYear(),
            saoPauloNow.getUTCMonth(),
            saoPauloNow.getUTCDate(),
            3 - SAO_PAULO_OFFSET_HOURS, // Convert 3 AM local to UTC (3 - (-3) = 6 UTC)
            0, 0, 0
        ));

        // If current São Paulo time is >= 3 AM, next rotation is tomorrow
        if (saoPauloHour >= 3) {
            next3amSaoPaulo.setUTCDate(next3amSaoPaulo.getUTCDate() + 1);
        }

        return next3amSaoPaulo.toISOString();
    }
}
