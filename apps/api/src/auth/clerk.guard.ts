import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import { Request } from 'express';
import { DEMO_CLERK_ID } from '../modules/demo/demo.constants';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No auth token provided');
    }

    // Sandbox bypass for the public "Demo" button (see DemoService) — a
    // single fixed, low-stakes account with no real data. Only active when
    // DEMO_ACCESS_TOKEN is explicitly configured; unset means this path is
    // disabled entirely rather than falling back to a guessable default.
    if (process.env.DEMO_ACCESS_TOKEN && token === process.env.DEMO_ACCESS_TOKEN) {
      (request as any).userId = DEMO_CLERK_ID;
      return true;
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });

      // Attach userId to request for downstream use
      (request as any).userId = payload.sub;
      return true;
    } catch (err) {
      this.logger.warn('Invalid token:', err);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return null;
  }
}
