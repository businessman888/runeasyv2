import { Controller, Post, Get, Body, Headers, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ReadinessService, ReadinessCheckInDto } from './readiness.service';

@Controller('readiness')
export class ReadinessController {
    private readonly logger = new Logger(ReadinessController.name);

    constructor(private readonly readinessService: ReadinessService) { }

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
            const caseIndex = this.calculateCurrentCase();
            const questions = this.readinessService.getQuestionSet(caseIndex);

            return {
                caseIndex,
                questions,
                nextRotation: this.getNextRotationTime(),
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
     * Calculate current question case based on days since epoch
     * Changes at 3 AM each day, cycles through 18 cases
     */
    private calculateCurrentCase(): number {
        const EPOCH_DATE = new Date('2026-01-01T03:00:00'); // Start date
        const TOTAL_CASES = 18;

        const now = new Date();
        // Adjust for 3 AM cutoff - if before 3 AM, consider it the previous day
        const adjustedNow = new Date(now);
        if (now.getHours() < 3) {
            adjustedNow.setDate(adjustedNow.getDate() - 1);
        }
        adjustedNow.setHours(3, 0, 0, 0);

        const daysSinceEpoch = Math.floor(
            (adjustedNow.getTime() - EPOCH_DATE.getTime()) / (1000 * 60 * 60 * 24)
        );

        const caseIndex = Math.abs(daysSinceEpoch) % TOTAL_CASES;
        this.logger.debug(`Days since epoch: ${daysSinceEpoch}, Case index: ${caseIndex}`);

        return caseIndex;
    }

    /**
     * Get the next rotation time (next day at 3 AM)
     */
    private getNextRotationTime(): string {
        const now = new Date();
        const nextRotation = new Date(now);

        if (now.getHours() >= 3) {
            nextRotation.setDate(nextRotation.getDate() + 1);
        }
        nextRotation.setHours(3, 0, 0, 0);

        return nextRotation.toISOString();
    }
}
