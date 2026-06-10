import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import rateLimit from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = [
    'http://localhost:5173',
    `https://${process.env.DOMAIN}`,
    `https://www.${process.env.DOMAIN}`,
  ].filter(Boolean);

  app.enableCors({
    // Allow the web app + any chrome-extension:// origin (so the popup/content
    // script can hit the API directly during dev).
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl/postman
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (origin.startsWith('chrome-extension://')) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);

  // General API limit
  app.use(rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200,                  // 200 requests per window
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Stricter limit for AI-heavy endpoints (CV upload, job search)
  app.use('/resume/upload', rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,                   // 10 uploads per hour
    message: 'Too many CV uploads, please wait before trying again.',
  }));

  app.use('/jobs/search', rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,                   // 20 searches per hour
    message: 'Too many job searches, please wait before trying again.',
  }));

  await app.listen(3000);
}
bootstrap();
