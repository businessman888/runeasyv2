import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { BODY_SIZE_LIMIT } from './common/config/body-limit';

async function bootstrap() {
  console.log('[Bootstrap] ========================================');
  console.log('[Bootstrap] Iniciando Bootstrap...');
  console.log('[Bootstrap] Timestamp:', new Date().toISOString());
  console.log('[Bootstrap] NODE_ENV:', process.env.NODE_ENV);
  console.log('[Bootstrap] PORT:', process.env.PORT);
  console.log('[Bootstrap] ========================================');

  const logger = new Logger('Bootstrap');

  try {
    console.log('[Bootstrap] Criando aplicação NestJS...');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: ['error', 'warn', 'log'],
      rawBody: true, // Required for webhook signature verification
    });
    console.log('[Bootstrap] Aplicação NestJS criada com sucesso!');

    // Teto do corpo da requisição. O default do body-parser (100 KB) rejeitava
    // a conclusão de QUALQUER corrida ao ar livre acima de ~6,5 km — a rota GPS
    // vai inteira no payload. Ver o racional e as medições em body-limit.ts.
    //
    // Reaplicar o parser aqui preserva o `rawBody` acima (é o caminho oficial
    // do Nest para os dois juntos), que a verificação de assinatura do webhook
    // do RevenueCat precisa.
    app.useBodyParser('json', { limit: BODY_SIZE_LIMIT });
    app.useBodyParser('urlencoded', { limit: BODY_SIZE_LIMIT, extended: true });

    // Security headers + response compression.
    app.use(helmet());
    app.use(compression());

    // CORS. The mobile app sends requests with no Origin header (native), which
    // must always be allowed. Browsers are restricted to the production web
    // domain in production; staging/development stay permissive for tooling.
    console.log('[Bootstrap] Configurando CORS...');
    const isProduction = process.env.NODE_ENV === 'production';
    const allowedOrigins = ['https://app.runeasy.com.br'];
    app.enableCors({
      origin: (origin, callback) => {
        // No origin = native mobile app / server-to-server / curl — always allow.
        if (!origin) return callback(null, true);
        // Outside production, allow any origin (local dev, tunnels, staging tools).
        if (!isProduction) return callback(null, true);
        // Production browsers: only the official web domain.
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin not allowed by CORS: ${origin}`));
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

    // Request logging middleware for debugging (minimal)
    app.use((req: any, res: any, next: any) => {
      if (req.method !== 'OPTIONS') {
        logger.log(`📥 ${req.method} ${req.url}`);
      }
      next();
    });

    // Global validation pipe
    console.log('[Bootstrap] Configurando ValidationPipe...');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    // Standardized error responses (no stack traces in production) + slow
    // request logging.
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new LoggingInterceptor());

    // API prefix
    app.setGlobalPrefix('api');

    // ==========================================
    // CRITICAL FIX: Listen on 0.0.0.0 for Railway/containers
    // ==========================================
    const port = process.env.PORT || 3000;
    const host = '0.0.0.0';

    console.log(`[Bootstrap] Iniciando servidor em ${host}:${port}...`);
    await app.listen(port, host);

    const appUrl = await app.getUrl();
    console.log('[Bootstrap] ========================================');
    console.log(`[Bootstrap] ✅ Servidor online!`);
    console.log(`[Bootstrap] 🚀 URL: ${appUrl}`);
    console.log('[Bootstrap] ========================================');

    logger.log(`🚀 RunEasy Backend running on ${appUrl}`);
    logger.log(`📚 API Docs: ${appUrl}/api`);
    logger.log(`🌐 CORS enabled for all origins`);
  } catch (error: any) {
    console.error('[Bootstrap] ❌ ERRO FATAL NA INICIALIZAÇÃO:');
    console.error('[Bootstrap] Error name:', error?.name);
    console.error('[Bootstrap] Error message:', error?.message);
    console.error('[Bootstrap] Error stack:', error?.stack);
    process.exit(1);
  }
}

console.log('[Pre-Bootstrap] Script main.ts carregado');
console.log('[Pre-Bootstrap] Iniciando bootstrap()...');

bootstrap().catch((err) => {
  console.error('[Bootstrap] Erro não tratado:', err);
  process.exit(1);
});
