// ── apps/api/src/auth/authenticated.controller.ts ────────────────────────────
// Base class all controllers extend — extracts userId from request

import { UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from './clerk.guard';

@UseGuards(ClerkAuthGuard)
export class AuthenticatedController {
  protected getUserId(request: any): string {
    return request.userId;
  }
}
