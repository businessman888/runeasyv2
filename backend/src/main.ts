import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend, mobile apps, and tunnels
  // Explicitly allowing all origins for development
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      // and all Cloudflare tunnel URLs
      logger.debug(`CORS request from origin: ${origin || 'no-origin'}`);
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-user-id',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Request logging middleware for debugging
  app.use((req: any, res: any, next: any) => {
    logger.log(`📥 ${req.method} ${req.url} from ${req.headers.origin || req.headers.host}`);
    next();
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 RunEasy Backend running on http://localhost:${port}`);
  logger.log(`📚 Strava OAuth: http://localhost:${port}/api/auth/strava/login`);
  logger.log(`🌐 CORS enabled for all origins (dynamic)`);
}

bootstrap();

