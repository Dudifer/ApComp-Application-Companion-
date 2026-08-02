import { Controller, Post } from '@nestjs/common';
import { DemoService } from './demo.service';

// Deliberately no @UseGuards(ClerkAuthGuard) here — this is the one endpoint
// that has to be reachable by a visitor who isn't signed in yet. It only
// resets a fixed, low-stakes sandbox account (see demo.constants.ts), never
// touches real user data.
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('reset')
  reset() {
    return this.demoService.resetAndSeed();
  }
}
