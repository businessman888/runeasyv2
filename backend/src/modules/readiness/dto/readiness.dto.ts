import { IsString, IsNotEmpty, IsNumber, Min, Max, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class ReadinessAnswersDto {
    @IsNumber()
    @Min(1, { message: 'sleep must be at least 1' })
    @Max(5, { message: 'sleep must be at most 5' })
    sleep: number;

    @IsNumber()
    @Min(1, { message: 'legs must be at least 1' })
    @Max(5, { message: 'legs must be at most 5' })
    legs: number;

    @IsNumber()
    @Min(1, { message: 'mood must be at least 1' })
    @Max(5, { message: 'mood must be at most 5' })
    mood: number;

    @IsNumber()
    @Min(1, { message: 'stress must be at least 1' })
    @Max(5, { message: 'stress must be at most 5' })
    stress: number;

    @IsNumber()
    @Min(1, { message: 'motivation must be at least 1' })
    @Max(5, { message: 'motivation must be at most 5' })
    motivation: number;
}

export class ReadinessCheckInDto {
    @IsString()
    @IsNotEmpty({ message: 'userId is required' })
    userId: string;

    @ValidateNested()
    @Type(() => ReadinessAnswersDto)
    answers: ReadinessAnswersDto;

    @IsOptional()
    @IsNumber()
    setNumber?: number;
}

