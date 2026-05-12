import { Global, Module } from '@nestjs/common';
import { PaceCalculatorService } from './pace-calculator.service';

@Global()
@Module({
    providers: [PaceCalculatorService],
    exports: [PaceCalculatorService],
})
export class PaceCalculatorModule {}
