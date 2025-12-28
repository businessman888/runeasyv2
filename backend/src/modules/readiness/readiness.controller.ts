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
            const verdict = await this.readinessService.analyzeReadiness(dto);
            return verdict;
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
}
