import { Module } from '@nestjs/common';
import { INVESTOR_AGENT_PROVIDER } from './investor-agent.interface.js';
import { InvestorAgentService } from './investor-agent.service.js';

@Module({
  providers: [
    {
      provide: INVESTOR_AGENT_PROVIDER,
      useClass: InvestorAgentService,
    },
  ],
  exports: [INVESTOR_AGENT_PROVIDER],
})
export class InvestorAgentModule {}

