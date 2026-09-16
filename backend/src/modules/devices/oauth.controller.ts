import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  HttpException,
  HttpStatus,
  GoneException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Public, User } from '../../common/decorators';
import { DevicesService } from './devices.service';
import { ActivitySyncService, WearableActivity } from './activity-sync.service';
import { FitbitOAuthService } from './providers/fitbit-oauth.service';
import { PolarOAuthService } from './providers/polar-oauth.service';
import {
  GoogleHealthOAuthService,
  GOOGLE_HEALTH_CALLBACK_PATH,
} from './providers/google-health-oauth.service';
import { GoogleHealthSubscriptionsService } from './providers/google-health-subscriptions.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Volta ao app pelo deep link que o `WebBrowser.openAuthSessionAsync` do mobile
 * intercepta. Mesma codificação dos callbacks de Fitbit e Polar, para que a
 * Fase 5 trate os três do mesmo jeito.
 */
function googleHealthReturnUrl(success: boolean, error?: string): string {
  const base = `runeasy://wearable-connected?provider=google_health&success=${String(success)}`;
  return error ? `${base}&error=${encodeURIComponent(error)}` : base;
}

@Controller('devices')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly devicesService: DevicesService,
    private readonly activitySyncService: ActivitySyncService,
    private readonly fitbitOAuth: FitbitOAuthService,
    private readonly polarOAuth: PolarOAuthService,
    private readonly googleHealthOAuth: GoogleHealthOAuthService,
    private readonly googleHealthSubscriptions: GoogleHealthSubscriptionsService,
    @InjectQueue('activity-sync-queue') private readonly syncQueue: Queue,
  ) {}

  // ============================================
  // GOOGLE HEALTH OAuth
  // ============================================
  //
  // Conexão SEM sincronização (Fase 3): o usuário autoriza, o token é guardado
  // criptografado e se renova sozinho — nada é buscado nem gravado em
  // `activities`. A ingestão depende do webhook, que é da Fase 4.

  /**
   * Inicia o fluxo — devolve a URL de autorização do Google.
   * GET /api/devices/google-health/auth
   */
  @Get('google-health/auth')
  async googleHealthAuth(@User('id') userId: string) {
    if (!userId) {
      throw new UnauthorizedException();
    }

    return { url: await this.googleHealthOAuth.generateAuthUrl(userId) };
  }

  /**
   * Callback — o Google redireciona o navegador para cá.
   * GET /api/devices/google-health/callback
   *
   * `@Public()`: chega sem sessão. O usuário é resolvido pelo `state`, que mora
   * em `oauth_states` — sobrevive a restart e a réplicas, ao contrário do `Map`
   * de Fitbit e Polar.
   *
   * Nunca lança para o navegador: sucesso e falha voltam ao app pelo mesmo deep
   * link, com `success` explícito. Negar o consentimento (`?error=access_denied`)
   * é um caminho normal, não exceção.
   */
  @Public()
  @Get(GOOGLE_HEALTH_CALLBACK_PATH)
  async googleHealthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string,
    @Res() res: Response,
  ) {
    if (oauthError) {
      // Consumir o state impede que ele seja reaproveitado depois da recusa.
      await this.googleHealthOAuth.discardState(state);
      this.logger.log(`Google Health authorization not granted: ${oauthError}`);
      return res.redirect(googleHealthReturnUrl(false, oauthError));
    }

    if (!code || !state) {
      return res.redirect(
        googleHealthReturnUrl(false, 'missing_code_or_state'),
      );
    }

    try {
      const { userId, tokens } = await this.googleHealthOAuth.exchangeCode(
        code,
        state,
      );

      await this.devicesService.connectDevice(userId, {
        provider: 'google_health',
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.expiresAt,
        refresh_token_expires_at: tokens.refreshTokenExpiresAt,
        scope: tokens.scope,
        device_name: 'Google Health',
      });

      this.logger.log(`Google Health connected for user ${userId}`);

      // A subscription é o que faz o Google nos avisar de treino novo. Ela é
      // criada aqui, mas a sua falha NÃO derruba a conexão: o usuário já
      // consentiu, e perder o consentimento por causa de uma chamada de
      // subscription seria trocar um problema pequeno por um grande. O que
      // sobra fica pendente (`subscription_id` NULL) e o retroativo
      // `npm run gh:backfill-subscriptions` recupera.
      try {
        const outcome =
          await this.googleHealthSubscriptions.createSubscriptionForUser(
            userId,
          );
        if (!outcome.created) {
          this.logger.warn(
            `Google Health subscription pendente para ${userId}: ${outcome.reason ?? 'desconhecido'}`,
          );
        }
      } catch (subscriptionError) {
        const message =
          subscriptionError instanceof Error
            ? subscriptionError.message
            : String(subscriptionError);
        this.logger.error(
          `Google Health subscription falhou para ${userId} — conexão mantida: ${message}`,
        );
      }

      return res.redirect(googleHealthReturnUrl(true));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Google Health callback error: ${message}`);
      return res.redirect(googleHealthReturnUrl(false, message));
    }
  }

  // ============================================
  // FITBIT OAuth
  // ============================================

  /**
   * Start Fitbit OAuth flow — returns authorization URL.
   * GET /api/devices/fitbit/auth
   */
  @Get('fitbit/auth')
  async fitbitAuth(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException(
        'x-user-id header required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const { url, state } = this.fitbitOAuth.generateAuthUrl(userId);
    return { url, state };
  }

  /**
   * Fitbit OAuth callback — exchanges code for tokens, stores device.
   * GET /api/devices/fitbit/callback
   */
  // Public: OAuth redirect from Fitbit's browser flow — no user token; the
  // user is resolved from the signed `state` param.
  @Public()
  @Get('fitbit/callback')
  async fitbitCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      return res.status(400).send('Missing code or state parameter');
    }

    try {
      const { tokens, userId } = await this.fitbitOAuth.exchangeCode(
        code,
        state,
      );

      const expiresAt = new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString();

      await this.devicesService.connectDevice(userId, {
        provider: 'fitbit',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: tokens.scope,
        provider_user_id: tokens.user_id,
        device_name: 'Fitbit',
      });

      this.logger.log(`Fitbit connected for user ${userId}`);

      // Redirect back to app with success
      return res.redirect(
        `runeasy://wearable-connected?provider=fitbit&success=true`,
      );
    } catch (error: any) {
      this.logger.error(`Fitbit callback error: ${error.message}`);
      return res.redirect(
        `runeasy://wearable-connected?provider=fitbit&success=false&error=${encodeURIComponent(error.message)}`,
      );
    }
  }

  // ============================================
  // POLAR OAuth
  // ============================================

  /**
   * Start Polar OAuth flow — returns authorization URL.
   * GET /api/devices/polar/auth
   */
  @Get('polar/auth')
  async polarAuth(@User('id') userId: string) {
    if (!userId) {
      throw new HttpException(
        'x-user-id header required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const { url, state } = this.polarOAuth.generateAuthUrl(userId);
    return { url, state };
  }

  /**
   * Polar OAuth callback — exchanges code for tokens, registers user, stores device.
   * GET /api/devices/polar/callback
   */
  // Public: OAuth redirect from Polar's browser flow — no user token; the
  // user is resolved from the signed `state` param.
  @Public()
  @Get('polar/callback')
  async polarCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      return res.status(400).send('Missing code or state parameter');
    }

    try {
      const { tokens, userId } = await this.polarOAuth.exchangeCode(
        code,
        state,
      );

      const expiresAt = new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString();

      // Register user in AccessLink (required for data access)
      await this.polarOAuth.registerUser(tokens.access_token, tokens.x_user_id);

      await this.devicesService.connectDevice(userId, {
        provider: 'polar',
        access_token: tokens.access_token,
        expires_at: expiresAt,
        provider_user_id: String(tokens.x_user_id),
        device_name: 'Polar',
      });

      this.logger.log(`Polar connected for user ${userId}`);

      return res.redirect(
        `runeasy://wearable-connected?provider=polar&success=true`,
      );
    } catch (error: any) {
      this.logger.error(`Polar callback error: ${error.message}`);
      return res.redirect(
        `runeasy://wearable-connected?provider=polar&success=false&error=${encodeURIComponent(error.message)}`,
      );
    }
  }

  // ============================================
  // WEBHOOKS — FECHADOS
  // ============================================
  //
  // ── O QUE ESTAVA ABERTO ──────────────────────────────────────────────────
  //
  // Os dois receptores (Fitbit e Polar) verificavam a assinatura assim:
  //
  //     if (signature && !verifyWebhookSignature(rawBody, signature)) { … }
  //
  // Quando o header NÃO vinha, a condição inteira era falsa, a verificação era
  // pulada e o handler seguia até `syncQueue.add(...)`. As rotas são
  // `@Public()`. Ou seja: qualquer um, sem credencial alguma, enfileirava job
  // na `activity-sync-queue` — bastava OMITIR o header em vez de forjá-lo.
  //
  // Ter o `client_secret` real fecha a FORJA; não fechava o BYPASS.
  //
  // ── POR QUE RECUSAR EM VEZ DE CONSERTAR ──────────────────────────────────
  //
  // Não há um único dispositivo Fitbit ou Polar conectado — zero linhas em
  // `connected_devices`, PROD e staging, verificado por provider. Recusar não
  // custa funcionalidade nenhuma hoje, toca menos código que consertar, e não
  // deixa caminho aberto por descuido.
  //
  // As rotas e o `@Public()` continuam de propósito: a remoção é da Fase 2, e
  // manter o decorator deixa a desativação legível aqui, em vez de escondida
  // num decorator ausente. Com isto o `OAuthController` deixa de ser produtor
  // da `activity-sync-queue` — que fica sem NENHUM produtor no app inteiro.

  /**
   * Fitbit webhook verification (subscription setup). Fechado.
   * GET /api/devices/webhooks/fitbit
   *
   * 410: o provedor está sendo descontinuado em favor da Google Health API —
   * esta rota não volta.
   */
  @Public()
  @Get('webhooks/fitbit')
  fitbitWebhookVerify(): never {
    throw new GoneException('Fitbit webhook descontinuado');
  }

  /**
   * Fitbit webhook receiver. Fechado — nunca enfileira job.
   * POST /api/devices/webhooks/fitbit
   */
  @Public()
  @Post('webhooks/fitbit')
  fitbitWebhook(): never {
    throw new GoneException('Fitbit webhook descontinuado');
  }

  /**
   * Polar webhook receiver. Fechado — nunca enfileira job.
   * POST /api/devices/webhooks/polar
   *
   * 401 e NÃO 410, e a diferença é deliberada: ao contrário do Fitbit, o Polar
   * CONTINUA no produto. Dizer "Gone" seria mentira — esta rota volta a
   * funcionar quando a verificação de assinatura for implementada. `401` diz o
   * que é verdade hoje: a requisição não está autenticada.
   *
   * A recusa é INCONDICIONAL: não lê segredo, não computa HMAC, não compara
   * nada. Fechar o bypass não exige verificar — exige recusar. Implementar a
   * verificação de verdade é trabalho de outra fase, e depende de um segredo
   * que a Polar só entrega no momento em que o webhook é registrado.
   */
  @Public()
  @Post('webhooks/polar')
  polarWebhook(): never {
    throw new UnauthorizedException(
      'Polar webhook sem verificação de assinatura configurada',
    );
  }
}
