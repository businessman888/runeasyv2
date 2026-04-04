import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

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
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
      rawBody: true, // Required for webhook signature verification
    });
    console.log('[Bootstrap] Aplicação NestJS criada com sucesso!');

    // Enable CORS for frontend, mobile apps, and tunnels
    console.log('[Bootstrap] Configurando CORS...');
    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        // and all Cloudflare tunnel URLs
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
