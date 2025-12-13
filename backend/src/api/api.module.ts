import { Module } from '@nestjs/common';
import { InvestorAgentModule } from '../investor-agent/index.js';
import { InvestorAgentController } from './investor-agent.controller.js';

@Module({
  imports: [InvestorAgentModule],
  controllers: [InvestorAgentController],
})
export class ApiModule {}

