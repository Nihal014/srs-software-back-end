import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:4200' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // On the server HOST=127.0.0.1 keeps the API reachable only through nginx.
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '0.0.0.0');
}
await bootstrap();
