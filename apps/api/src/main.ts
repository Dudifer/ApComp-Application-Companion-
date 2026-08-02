import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.production in production, .env otherwise.
// After build, __dirname is apps/api/dist; env files live one level up in apps/api/
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import rateLimit from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cloudflare tunnel forwards requests — trust the proxy so rate-limiting
  // and IP detection work correctly.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Falls back to the real production domain if DOMAIN isn't set at runtime
  // (e.g. NODE_ENV wasn't 'production' when pm2 started the process, so
  // .env.production never got loaded — see the note above main()). Without
  // this fallback, a missing DOMAIN silently turns into "https://undefined"
  // and CORS rejects every real origin uniformly, which is a nasty failure
  // mode to debug since every endpoint breaks the same way at once.
  const domain = process.env.DOMAIN || 'apcomp.us';
  const allowedOrigins = [
    'http://localhost:5173',
    `https://${domain}`,
    `https://www.${domain}`,
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (origin.startsWith('chrome-extension://')) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 200 : 2000,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.use('/resume/upload', rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'Too many CV uploads, please wait before trying again.',
  }));

  app.use('/jobs/search', rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: 'Too many job searches, please wait before trying again.',
  }));

  app.use('/demo/reset', rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    message: 'Too many demo resets, please wait before trying again.',
  }));

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();