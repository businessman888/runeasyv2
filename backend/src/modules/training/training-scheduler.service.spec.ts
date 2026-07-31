import { Test, TestingModule } from '@nestjs/testing';
import { TrainingSchedulerService } from './training-scheduler.service';
import { SupabaseService } from '../../database/supabase.service';
import { NotificationService } from '../notifications/notification.service';
import { RetrospectiveService } from './retrospective.service';

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
  };
  let retrospectiveService: { checkForCompletedPlans: jest.Mock };

  beforeEach(async () => {
    notificationService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
      sendPushNotification: jest.fn().mockResolvedValue(true),
    };
    retrospectiveService = {
      // Dois planos concluídos no mesmo ciclo do cron.
      checkForCompletedPlans: jest.fn().mockResolvedValue([
        { userId: 'user-1', retroId: 'retro-1' },
        { userId: 'user-2', retroId: 'retro-2' },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingSchedulerService,
        { provide: SupabaseService, useValue: { getClient: jest.fn() } },
        { provide: NotificationService, useValue: notificationService },
        { provide: RetrospectiveService, useValue: retrospectiveService },
      ],
    }).compile();

    service = module.get(TrainingSchedulerService);
  });

  it('delega a varredura ao RetrospectiveService', async () => {
    await service.checkForCompletedPlans();
    expect(retrospectiveService.checkForCompletedPlans).toHaveBeenCalledTimes(1);
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
});
