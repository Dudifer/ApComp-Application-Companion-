// ── apps/api/src/auth/auth.module.ts ─────────────────────────────────────────

import { Module, Global } from '@nestjs/common';
import { ClerkAuthGuard } from './clerk.guard';
import { UserService } from './user.service';

@Global()
@Module({
  providers: [ClerkAuthGuard, UserService],
  exports: [ClerkAuthGuard, UserService],
})
export class AuthModule {}
