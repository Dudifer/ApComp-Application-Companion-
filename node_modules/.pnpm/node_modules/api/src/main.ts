import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    // Allow the web app + any chrome-extension:// origin (so the popup/content
    // script can hit the API directly during dev).
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl/postman
      if (origin === 'http://localhost:5173') return callback(null, true);
      if (origin.startsWith('chrome-extension://')) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
