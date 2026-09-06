import { Test, TestingModule } from '@nestjs/testing';
import { TrainingSchedulerService } from './training-scheduler.service';
import { SupabaseService } from '../../database/supabase.service';
import { NotificationService } from '../notifications/notification.service';
import { RetrospectiveService } from './retrospective.service';
import { WeeklyInsightService } from './weekly-insight.service';

/**
 * Fase 1A — trava do disparo ÚNICO de notificação de retrospectiva.
 *
 * Até a 1A este scheduler tinha o seu próprio `sendRetrospectiveNotification` e
 * o chamava para cada retro devolvido por `checkForCompletedPlans` — enquanto
 * `RetrospectiveService.generateRetrospective` já havia enviado a sua. Cada
 * retrospectiva gerava 2 linhas em `notifications` e 2 pushes, com títulos e
 * tipos diferentes ('recovery_analysis' e 'achievement').
 *
 * O dono do envio é o service, e não este cron, porque o endpoint manual
 * `POST /training/retrospective/generate` chama o service direto — se o dono
 * fosse aqui, geração manual não notificaria ninguém.
 *
 * Este teste existe para a reintrodução do envio no scheduler quebrar a suíte.
 */
describe('TrainingSchedulerService — retrospectiva', () => {
  let service: TrainingSchedulerService;
  let notificationService: {
    createNotification: jest.Mock;
    sendPushNotification: jest.Mock;
    notifyOnce: jest.Mock;
  };
  let retrospectiveService: { checkForCompletedPlans: jest.Mock };
  let weeklyInsightService: { checkForClosedPlanWeeks: jest.Mock };
  let supabaseGetClient: jest.Mock;

  beforeEach(async () => {
    notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
      sendPushNotification: jest.fn().mockResolvedValue(true),
      notifyOnce: jest.fn().mockResolvedValue({
        created: true,
        pushSent: true,
        notification: null,
      }),
    };
    retrospectiveService = {
      // Dois planos concluídos no mesmo ciclo do cron.
      checkForCompletedPlans: jest.fn().mockResolvedValue([
        { userId: 'user-1', retroId: 'retro-1' },
        { userId: 'user-2', retroId: 'retro-2' },
      ]),
    };
    weeklyInsightService = {
      // Duas semanas fechadas no mesmo ciclo do cron.
      checkForClosedPlanWeeks: jest.fn().mockResolvedValue([
        { userId: 'user-1', insightId: 'wi-1', weekNumber: 2 },
        { userId: 'user-2', insightId: 'wi-2', weekNumber: 3 },
      ]),
    };

    supabaseGetClient = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingSchedulerService,
        {
          provide: SupabaseService,
          useValue: { getClient: supabaseGetClient },
        },
        { provide: NotificationService, useValue: notificationService },
        { provide: RetrospectiveService, useValue: retrospectiveService },
        { provide: WeeklyInsightService, useValue: weeklyInsightService },
      ],
    }).compile();

    service = module.get(TrainingSchedulerService);
  });

  it('delega a varredura ao RetrospectiveService', async () => {
    await service.checkForCompletedPlans();
    expect(retrospectiveService.checkForCompletedPlans).toHaveBeenCalledTimes(
      1,
    );
  });

  it('NÃO envia notificação — o service é o dono do disparo', async () => {
    await service.checkForCompletedPlans();

    expect(notificationService.createNotification).not.toHaveBeenCalled();
    expect(notificationService.sendPushNotification).not.toHaveBeenCalled();
  });

  it('não expõe mais um sendRetrospectiveNotification próprio', () => {
    expect(
      (service as unknown as Record<string, unknown>)
        .sendRetrospectiveNotification,
    ).toBeUndefined();
  });

  it('não derruba o cron quando a varredura falha', async () => {
    retrospectiveService.checkForCompletedPlans.mockRejectedValue(
      new Error('db down'),
    );
    await expect(service.checkForCompletedPlans()).resolves.toBeUndefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Fase 2A — o insight semanal herda a MESMA regra de dono único. Estes testes
  // existem para que a introdução de um envio de notificação aqui quebre a
  // suíte, do mesmo jeito que a reintrodução do de retrospectiva quebraria.
  // ───────────────────────────────────────────────────────────────────────────
  describe('insight semanal', () => {
    it('delega a varredura ao WeeklyInsightService', async () => {
      await service.checkForClosedPlanWeeks();
      expect(
        weeklyInsightService.checkForClosedPlanWeeks,
      ).toHaveBeenCalledTimes(1);
    });

    it('NÃO envia notificação — o service é o dono do disparo', async () => {
      await service.checkForClosedPlanWeeks();

      expect(notificationService.createNotification).not.toHaveBeenCalled();
      expect(notificationService.sendPushNotification).not.toHaveBeenCalled();
    });

    it('não derruba o cron quando a varredura falha', async () => {
      weeklyInsightService.checkForClosedPlanWeeks.mockRejectedValue(
        new Error('db down'),
      );
      await expect(service.checkForClosedPlanWeeks()).resolves.toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Lembrete de treino — a guarda de duplicata saiu da memória e foi para o
  // banco. Era este cron que produzia 4.038 das 4.140 notificações duplicadas
  // medidas em produção (97,5%).
  // ───────────────────────────────────────────────────────────────────────────
  describe('lembrete de treino', () => {
    const TREINO = {
      id: 'workout-1',
      user_id: 'user-1',
      type: 'easy_run',
      distance_km: 5,
      objective: 'base',
      scheduled_date: '2026-09-05',
    };

    beforeEach(() => {
      // 04:00 na hora LOCAL do processo — é `now.getHours()` que o job compara.
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 8, 5, 4, 0, 0));

      supabaseGetClient.mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [TREINO], error: null }),
            }),
          }),
        }),
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('envia pelo notifyOnce, com a chave determinística do treino + data', async () => {
      await service.sendWorkoutReminders();

      expect(notificationService.notifyOnce).toHaveBeenCalledTimes(1);
      const [params] = notificationService.notifyOnce.mock.calls[0] as [
        { dedupeKey: string; userId: string; type: string },
      ];
      expect(params.dedupeKey).toBe('reminder:workout-1:2026-09-05');
      expect(params.userId).toBe('user-1');
      expect(params.type).toBe('reminder');
    });

    it('a chave vem de `scheduled_date`, não de um "hoje" calculado', async () => {
      // Um treino de outra data no mesmo lote não pode herdar a data de hoje —
      // seria a chave errada, e a dedupe protegeria o evento errado.
      supabaseGetClient.mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: [{ ...TREINO, scheduled_date: '2026-12-25' }],
                  error: null,
                }),
            }),
          }),
        }),
      });

      await service.sendWorkoutReminders();

      const [params] = notificationService.notifyOnce.mock.calls[0] as [
        { dedupeKey: string },
      ];
      expect(params.dedupeKey).toBe('reminder:workout-1:2026-12-25');
    });

    it('NÃO chama createNotification/sendPushNotification soltos', async () => {
      // Separados, eles são a forma exata do bug: mesmo deduplicando a linha, o
      // push sairia duas vezes. O envio tem de estar preso ao insert.
      await service.sendWorkoutReminders();

      expect(notificationService.createNotification).not.toHaveBeenCalled();
      expect(notificationService.sendPushNotification).not.toHaveBeenCalled();
    });

    it('não expõe mais o `sentReminders` em memória', () => {
      const interno = service as unknown as Record<string, unknown>;
      expect(interno.sentReminders).toBeUndefined();
      expect(interno.cleanupOldReminders).toBeUndefined();
    });

    it('fora da hora do lembrete não envia nada', async () => {
      jest.setSystemTime(new Date(2026, 8, 5, 9, 0, 0));
      await service.sendWorkoutReminders();
      expect(notificationService.notifyOnce).not.toHaveBeenCalled();
    });
  });
});
