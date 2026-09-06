import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../../database';
import axios from 'axios';
import * as admin from 'firebase-admin';
import * as path from 'path';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
  id: string;
  status: 'ok' | 'error';
  message?: string;
  details?: { error: string };
}

// Notification types for in-app notifications
export type NotificationType =
  | 'recovery_analysis'
  | 'workout_sync'
  | 'achievement'
  | 'reminder'
  /**
   * Insight de fim de semana do plano (Fase 2A). Type próprio, e não
   * 'recovery_analysis' reusado, para que a lista e o filtro do app consigam
   * distinguir o insight semanal da retrospectiva de fim de ciclo.
   *
   * ⚠️ O mobile ainda não mapeia este type: `mapNotificationType` em
   * NotificationsScreen.tsx cai no `default` e renderiza como lembrete. A linha
   * no switch é Fase 2B, junto com a tela — o bloco de mobile está represado
   * para uma build EAS única. A coluna `notifications.type` é varchar sem CHECK,
   * então o banco aceita desde já.
   */
  | 'weekly_insight'
  | 'system';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  description: string;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Entrada de {@link NotificationService.notifyOnce}. */
export interface NotifyOnceParams {
  userId: string;
  type: NotificationType;
  /** Vale para a linha in-app E para o push — os dois textos são o mesmo. */
  title: string;
  description: string;
  /**
   * Chave DETERMINÍSTICA, montada pelo produtor a partir do que identifica o
   * evento — nunca de um relógio, um contador ou um UUID novo. Duas execuções
   * do mesmo job para o mesmo evento têm de produzir a MESMA string.
   *
   * Convenção em uso: `'<assunto>:<id>:<YYYY-MM-DD>'`
   *   `reminder:<workout_id>:<scheduled_date>`
   *   `daily_readiness:<user_id>:<dia SP>`
   */
  dedupeKey: string;
  metadata?: Record<string, unknown>;
  push?: {
    data?: Record<string, unknown>;
    channelId?: string;
  };
}

export interface NotifyOnceResult {
  /** `true` só quando ESTA chamada gravou a linha. */
  created: boolean;
  /** Só pode ser `true` quando `created` é `true`. */
  pushSent: boolean;
  notification: AppNotification | null;
}

/** Resultado interno do insert — separa "já existia" de "falhou". */
interface InsertOutcome {
  row: AppNotification | null;
  created: boolean;
  failed: boolean;
}

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private readonly expoPushUrl = 'https://exp.host/--/api/v2/push/send';
  private firebaseInitialized = false;

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Initialize Firebase Admin SDK on module init
   */
  onModuleInit() {
    this.initializeFirebase();
  }

  /**
   * Initialize Firebase Admin with service account
   * Supports both env var (for Railway) and file path (for local dev)
   */
  private initializeFirebase(): void {
    if (this.firebaseInitialized || admin.apps.length > 0) {
      this.firebaseInitialized = true;
      return;
    }

    try {
      // Try environment variable first (for Railway/production)
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

      if (serviceAccountJson) {
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.firebaseInitialized = true;
        this.logger.log('Firebase Admin SDK initialized from env var');
        return;
      }

      // Fallback to file path (for local development)
      const serviceAccountPath = path.join(
        process.cwd(),
        'firebase-service-account.json',
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
      });

      this.firebaseInitialized = true;
      this.logger.log('Firebase Admin SDK initialized from file');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK:', error);
    }
  }

  /**
   * Save user's push token
   */
  async savePushToken(userId: string, pushToken: string): Promise<void> {
    const { error } = await this.supabaseService
      .from('users')
      .update({ push_token: pushToken })
      .eq('id', userId);

    if (error) {
      this.logger.error('Failed to save push token', error);
      throw error;
    }

    this.logger.log(`Push token saved for user ${userId}`);
  }

  /**
   * Get user's push token
   */
  async getPushToken(userId: string): Promise<string | null> {
    const { data, error } = await this.supabaseService
      .from('users')
      .select('push_token')
      .eq('id', userId)
      .single();

    if (error || !data?.push_token) {
      return null;
    }

    return data.push_token;
  }

  /**
   * Send push notification to user (supports both Expo and native FCM tokens)
   */
  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    options?: { channelId?: string; badge?: number },
  ): Promise<boolean> {
    const pushToken = await this.getPushToken(userId);

    if (!pushToken) {
      this.logger.warn(`No push token found for user ${userId}`);
      return false;
    }

    // Determine if it's an Expo token or native FCM token
    const isExpoToken = pushToken.startsWith('ExponentPushToken[');

    if (isExpoToken) {
      // Send via Expo Push API
      return this.sendViaExpoPush(pushToken, title, body, data, options);
    } else {
      // Send via Firebase FCM (native token)
      return this.sendViaFCM(pushToken, title, body, data, options);
    }
  }

  /**
   * Send push notification via Expo Push API
   */
  private async sendViaExpoPush(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    options?: { channelId?: string; badge?: number },
  ): Promise<boolean> {
    const message: ExpoPushMessage = {
      to: pushToken,
      title,
      body,
      data,
      sound: 'default',
      channelId: options?.channelId,
      badge: options?.badge,
      priority: 'high',
    };

    try {
      const response = await axios.post<ExpoPushTicket[]>(
        this.expoPushUrl,
        [message],
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
        },
      );

      const ticket = response.data[0];
      if (ticket.status === 'error') {
        this.logger.error('Expo push error:', ticket.message);
        return false;
      }

      this.logger.log('Expo push sent successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to send Expo push notification:', error);
      return false;
    }
  }

  /**
   * Send push notification via Firebase Cloud Messaging (FCM) using Admin SDK
   */
  private async sendViaFCM(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    options?: { channelId?: string; badge?: number },
  ): Promise<boolean> {
    if (!this.firebaseInitialized) {
      this.logger.error('Firebase Admin SDK not initialized');
      return false;
    }

    // Build the FCM v1 message format
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: options?.channelId || 'default',
          icon: 'notification_icon',
          color: '#FF6B35',
        },
      },
      data: data ? this.stringifyData(data) : undefined,
    };

    try {
      const messageId = await admin.messaging().send(message);
      this.logger.log(`FCM push sent successfully: ${messageId}`);
      return true;
    } catch (error: any) {
      // Handle specific FCM errors
      if (error.code === 'messaging/registration-token-not-registered') {
        this.logger.warn('FCM token expired or invalid, should be removed');
      } else if (error.code === 'messaging/invalid-argument') {
        this.logger.error('Invalid FCM message format:', error.message);
      } else {
        this.logger.error('Failed to send FCM push notification:', error);
      }
      return false;
    }
  }

  /**
   * Stringify data values for FCM (FCM requires all data values to be strings)
   */
  private stringifyData(data: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return result;
  }

  /**
   * Helper to get workout type name in Portuguese
   */
  private getWorkoutTypeName(workoutType: string): string {
    const types: Record<string, string> = {
      easy_run: 'Corrida Leve',
      long_run: 'Longão',
      interval: 'Intervalado',
      tempo: 'Tempo Run',
      recovery: 'Recuperação',
    };
    return types[workoutType] || workoutType;
  }

  /**
   * Send feedback ready notification
   */
  async sendFeedbackReadyNotification(
    userId: string,
    feedbackId: string,
    workoutType: string,
  ): Promise<boolean> {
    const workoutTypeName = this.getWorkoutTypeName(workoutType);

    // Create persistent notification in database
    await this.createNotification(
      userId,
      'workout_sync',
      '📊 Feedback Pronto!',
      `Sua análise do ${workoutTypeName} está disponível. Veja como você se saiu!`,
      {
        feedback_id: feedbackId,
        workout_type: workoutType,
        screen: 'CoachAnalysis',
        feedbackId,
      },
    );

    // Send push notification
    return this.sendPushNotification(
      userId,
      '📊 Feedback Pronto!',
      `Sua análise do ${workoutTypeName} está disponível. Veja como você se saiu!`,
      {
        type: 'feedback_ready',
        feedbackId,
        workoutType,
        screen: 'CoachAnalysis',
      },
      { channelId: 'feedback' },
    );
  }

  /**
   * Send workout reminder notification
   */
  async sendWorkoutReminderNotification(
    userId: string,
    workoutId: string,
    workoutType: string,
    scheduledTime: string,
  ): Promise<boolean> {
    const workoutTypeName = this.getWorkoutTypeName(workoutType);

    return this.sendPushNotification(
      userId,
      '🏃 Hora do Treino!',
      `Você tem um ${workoutTypeName} agendado para hoje. Vamos lá!`,
      {
        type: 'workout_reminder',
        workoutId,
        workoutType,
      },
      { channelId: 'training' },
    );
  }

  /**
   * Send badge earned notification
   */
  async sendBadgeEarnedNotification(
    userId: string,
    badgeName: string,
    badgeIcon: string,
  ): Promise<boolean> {
    return this.sendPushNotification(
      userId,
      `${badgeIcon} Nova Badge Conquistada!`,
      `Parabéns! Você conquistou a badge "${badgeName}"`,
      {
        type: 'badge_earned',
        badgeName,
      },
    );
  }

  /**
   * Send level up notification
   */
  async sendLevelUpNotification(
    userId: string,
    newLevel: number,
    levelName: string,
  ): Promise<boolean> {
    return this.sendPushNotification(
      userId,
      '🎉 Level Up!',
      `Você subiu para o nível ${newLevel}: ${levelName}!`,
      {
        type: 'level_up',
        newLevel,
        levelName,
      },
    );
  }

  /**
   * Send streak warning notification
   */
  async sendStreakWarningNotification(
    userId: string,
    currentStreak: number,
  ): Promise<boolean> {
    return this.sendPushNotification(
      userId,
      '🔥 Não perca seu streak!',
      `Você tem ${currentStreak} dias de streak. Faça um treino hoje para manter!`,
      {
        type: 'streak_warning',
        currentStreak,
      },
    );
  }

  // `sendDailyReadinessNotification` vivia aqui e foi REMOVIDO.
  //
  // Ele enviava o push de prontidão sem passar por guarda nenhuma, ao lado de um
  // `createNotification` separado — os dois independentes, que é a forma exata
  // do bug de duplicação. O convite diário agora sai por
  // `ReadinessScheduler` → `notifyOnce`, que liga o push ao INSERT.
  //
  // Deixá-lo aqui seria deixar um segundo caminho, não deduplicado, para enviar
  // exatamente o mesmo push — pronto para alguém reencontrar e reusar.

  // ==================== IN-APP NOTIFICATIONS ====================

  /**
   * Create a new in-app notification.
   *
   * Sem guarda de duplicata — para o caminho REQUEST-DRIVEN, em que o usuário
   * pediu a ação e uma segunda linha significa uma segunda ação de verdade.
   * Job periódico deve usar {@link notifyOnce}.
   */
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    description: string,
    metadata?: Record<string, unknown>,
  ): Promise<AppNotification | null> {
    const { row } = await this.insertNotification(
      userId,
      type,
      title,
      description,
      metadata,
    );
    return row;
  }

  /**
   * Grava a linha in-app E envia o push — no máximo UMA vez por `dedupeKey`.
   *
   * ── POR QUE OS DOIS JUNTOS, NUM MÉTODO SÓ ─────────────────────────────────
   *
   * Porque separados eles já falharam. `createNotification` e
   * `sendPushNotification` eram chamadas independentes, e o produtor tinha de
   * lembrar de condicionar a segunda ao resultado da primeira — o que ninguém
   * fazia. Deduplicar só a LINHA não resolveria nada do sintoma: o corredor
   * continuaria recebendo dois pushes, que é a parte que ele sente.
   *
   * Aqui a regra é estrutural: o push só existe dentro do ramo em que o INSERT
   * de fato criou a linha. Não há como esquecer.
   *
   * ── A GUARDA ANTERIOR, E POR QUE ELA NÃO ERA UMA ──────────────────────────
   *
   * O lembrete de treino tinha um `Set<string>` em memória
   * (`TrainingSchedulerService.sentReminders`). Ele não pegou NADA: as duas
   * execuções do cron duplicado liam o Set vazio antes de qualquer escrita, e
   * ainda por cima nem sobreviveria a um restart ou a uma segunda réplica. A
   * guarda que funciona é o índice UNIQUE — foi por tê-la que
   * `weekly_insight` e `retrospective` escaparam do bug (0 duplicatas medidas
   * contra 4.038 do lembrete).
   *
   * ── O QUE ACONTECE SE O PUSH FALHAR ───────────────────────────────────────
   *
   * A chave já foi consumida e o push NÃO é retentado. É deliberado: a
   * alternativa (apagar a linha quando o envio falha) reabre exatamente a
   * corrida que este método fecha. Um push perdido é melhor que um push dobrado
   * todo dia — e a linha in-app fica lá, então o aviso não some.
   */
  async notifyOnce(params: NotifyOnceParams): Promise<NotifyOnceResult> {
    const { userId, type, title, description, dedupeKey, metadata, push } =
      params;

    const outcome = await this.insertNotification(
      userId,
      type,
      title,
      description,
      metadata,
      dedupeKey,
    );

    if (outcome.failed) {
      // Falha de escrita NÃO é duplicata. Não enviar é o lado seguro: se o
      // banco está fora, a próxima execução tenta de novo com a mesma chave.
      return { created: false, pushSent: false, notification: null };
    }

    if (!outcome.created) {
      this.logger.log(
        `[notifyOnce] '${dedupeKey}' já existia — push suprimido`,
      );
      return { created: false, pushSent: false, notification: null };
    }

    const pushSent = await this.sendPushNotification(
      userId,
      title,
      description,
      push?.data,
      push?.channelId ? { channelId: push.channelId } : undefined,
    );

    return { created: true, pushSent, notification: outcome.row };
  }

  /**
   * O único ponto de escrita em `notifications`.
   *
   * Com `dedupeKey`, emite `INSERT … ON CONFLICT (dedupe_key) DO NOTHING`: o
   * conflito devolve ZERO linhas, e é assim que `created: false` se distingue
   * de `failed: true`. Sem `dedupeKey`, é um insert comum e a coluna fica
   * `NULL` — o índice UNIQUE trata NULLs como distintos entre si, então
   * quantas linhas request-driven quiser convivem.
   *
   * `maybeSingle()` e não `single()`: `single()` transforma "zero linhas" em
   * erro (PGRST116), que é justamente o caso normal da deduplicação.
   */
  private async insertNotification(
    userId: string,
    type: NotificationType,
    title: string,
    description: string,
    metadata?: Record<string, unknown>,
    dedupeKey?: string,
  ): Promise<InsertOutcome> {
    const payload: Record<string, unknown> = {
      user_id: userId,
      type,
      title,
      description,
      metadata: metadata || {},
      is_read: false,
    };
    if (dedupeKey) payload.dedupe_key = dedupeKey;

    try {
      const table = this.supabaseService.from('notifications');
      const query = dedupeKey
        ? table.upsert(payload, {
            onConflict: 'dedupe_key',
            ignoreDuplicates: true,
          })
        : table.insert(payload);

      const { data, error } = await query.select().maybeSingle();

      if (error) {
        // A dica do 42703 é deliberada e específica: o modo de falha mais
        // provável desta função é o CÓDIGO subir antes da migration
        // `20260905_add_notification_dedupe_key.sql`. Nesse cenário TODO envio
        // de cron para de sair de uma vez — e sem esta linha o log diria apenas
        // "failed to create notification", que não aponta para lugar nenhum.
        const dica =
          dedupeKey && (error as { code?: string }).code === '42703'
            ? ' — a coluna `dedupe_key` não existe: aplique a migration 20260905_add_notification_dedupe_key.sql'
            : '';
        this.logger.error(
          `Failed to create notification${dedupeKey ? ` (dedupeKey='${dedupeKey}')` : ''}${dica}`,
          error,
        );
        return { row: null, created: false, failed: true };
      }

      if (!data) {
        // Só alcançável no caminho deduplicado: a linha já existia.
        return { row: null, created: false, failed: false };
      }

      this.logger.log(`Created ${type} notification for user ${userId}`);
      return { row: data as AppNotification, created: true, failed: false };
    } catch (error) {
      this.logger.error('Error creating notification', error);
      return { row: null, created: false, failed: true };
    }
  }

  /**
   * Get all notifications for a user
   */
  async getUserNotifications(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AppNotification[]> {
    try {
      const { data, error } = await this.supabaseService
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.logger.error('Failed to get notifications', error);
        return [];
      }

      return (data as AppNotification[]) || [];
    } catch (error) {
      this.logger.error('Error getting notifications', error);
      return [];
    }
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await this.supabaseService
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', userId);

      if (error) {
        this.logger.error('Failed to mark notification as read', error);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error marking notification as read', error);
      return false;
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const { count, error } = await this.supabaseService
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        this.logger.error('Failed to get unread count', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      this.logger.error('Error getting unread count', error);
      return 0;
    }
  }

  /**
   * Schedule a recovery analysis notification to be created after 10 minutes
   * This creates an in-app notification with a summary of the AI analysis
   */
  scheduleRecoveryAnalysisNotification(
    userId: string,
    aiAnalysis: {
      headline: string;
      reasoning: string;
      readiness_score: number;
      status_label: string;
    },
  ): void {
    const DELAY_MS = 10 * 60 * 1000; // 10 minutes

    this.logger.log(
      `Scheduling recovery analysis notification for user ${userId} in 10 minutes`,
    );

    setTimeout(() => {
      // void-ed IIFE: keeps the timer callback synchronous so the async work
      // can't surface as an unhandled rejection (no-misused-promises).
      void (async () => {
        try {
          // Create a brief summary from the AI analysis
          const description = `${aiAnalysis.headline}. Score: ${aiAnalysis.readiness_score}% - ${aiAnalysis.status_label}`;

          await this.createNotification(
            userId,
            'recovery_analysis',
            'Análise de Recuperação',
            description,
            {
              readiness_score: aiAnalysis.readiness_score,
              status_label: aiAnalysis.status_label,
              headline: aiAnalysis.headline,
            },
          );

          // Also send push notification
          await this.sendPushNotification(
            userId,
            '🧠 Análise de Recuperação',
            description,
            { type: 'recovery_analysis' },
            { channelId: 'insights' },
          );

          this.logger.log(
            `Recovery analysis notification created for user ${userId}`,
          );
        } catch (error) {
          this.logger.error(
            'Failed to create scheduled recovery notification',
            error,
          );
        }
      })();
    }, DELAY_MS);
  }

  // ==================== NOTIFICATION PREFERENCES ====================

  /**
   * Get user's notification preferences
   */
  async getPreferences(userId: string): Promise<any> {
    try {
      const { data, error } = await this.supabaseService
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // If preferences don't exist, create default ones
        if (error.code === 'PGRST116') {
          return this.createDefaultPreferences(userId);
        }
        this.logger.error('Failed to get notification preferences', error);
        return null;
      }

      return data;
    } catch (error) {
      this.logger.error('Error getting notification preferences', error);
      return null;
    }
  }

  /**
   * Update user's notification preferences
   */
  async updatePreferences(
    userId: string,
    preferences: {
      readiness_enabled?: boolean;
      fatigue_alerts_enabled?: boolean;
      session_reminder_enabled?: boolean;
      sync_enabled?: boolean;
      squad_activities_enabled?: boolean;
    },
  ): Promise<any> {
    try {
      const { data, error } = await this.supabaseService
        .from('notification_preferences')
        .update(preferences)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to update notification preferences', error);
        return null;
      }

      this.logger.log(`Updated notification preferences for user ${userId}`);
      return data;
    } catch (error) {
      this.logger.error('Error updating notification preferences', error);
      return null;
    }
  }

  /**
   * Create default preferences for a new user
   */
  private async createDefaultPreferences(userId: string): Promise<any> {
    try {
      const { data, error } = await this.supabaseService
        .from('notification_preferences')
        .insert({
          user_id: userId,
          readiness_enabled: true,
          fatigue_alerts_enabled: false,
          session_reminder_enabled: true,
          sync_enabled: true,
          squad_activities_enabled: false,
        })
        .select()
        .single();

      if (error) {
        this.logger.error(
          'Failed to create default notification preferences',
          error,
        );
        return null;
      }

      this.logger.log(
        `Created default notification preferences for user ${userId}`,
      );
      return data;
    } catch (error) {
      this.logger.error(
        'Error creating default notification preferences',
        error,
      );
      return null;
    }
  }
}
