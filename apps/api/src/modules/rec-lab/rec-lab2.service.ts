import { Injectable, Logger } from '@nestjs/common';

/**
 * Rec Lab 2 — clean rebuild, starting from scratch. No logic yet; the
 * frontend (apps/web RecLab2.tsx) is currently just three empty boxes
 * (recommended / dismissed / saved jobs) with nothing to fetch.
 */
@Injectable()
export class RecLab2Service {
  private readonly logger = new Logger(RecLab2Service.name);
}
