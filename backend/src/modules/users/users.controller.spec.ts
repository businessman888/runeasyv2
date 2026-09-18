import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const DONO = 'a3f1c0de-0000-4000-8000-000000000001';
const OUTRO = 'b7e2d1af-0000-4000-8000-000000000002';

describe('UsersController — exclusão de conta', () => {
  let requestDeletion: jest.Mock<Promise<{ requestedAt: string }>, [string]>;
  let controller: UsersController;

  beforeEach(async () => {
    requestDeletion = jest.fn<Promise<{ requestedAt: string }>, [string]>(() =>
      Promise.resolve({ requestedAt: '2026-09-18T12:00:00.000Z' }),
    );

    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: { requestDeletion } }],
    }).compile();

    controller = module.get(UsersController);
  });

  it('o dono pede a própria exclusão', async () => {
    const res = await controller.requestDeletion(DONO, DONO);

    expect(requestDeletion).toHaveBeenCalledWith(DONO);
    expect(res.success).toBe(true);
    expect(res.requestedAt).toBe('2026-09-18T12:00:00.000Z');
  });

  it('NINGUÉM pede a exclusão de outro — e o pedido nem chega ao service', async () => {
    // A guarda de IDOR é a única que importa nesta rota: o token diz quem é, e
    // o path diz quem some. Divergiram, é exclusão de conta alheia.
    await expect(
      controller.requestDeletion(DONO, OUTRO),
    ).rejects.toBeInstanceOf(HttpException);
    expect(requestDeletion).not.toHaveBeenCalled();
  });

  it('responde 202, não 200 — a exclusão foi aceita, não terminou', () => {
    // O `@HttpCode` é o contrato com o app: ele não pode dizer "pronto" na
    // tela enquanto o job ainda fala com o Google, o Storage e o Auth.
    //
    // A chave é a do próprio Nest (`HTTP_CODE_METADATA`); usamos o literal
    // porque ela só é exportada por caminho interno, e vem do descriptor para
    // não passar o método solto (o `this` de um método desamarrado é o tipo de
    // detalhe que o lint pega e que aqui não tem valor nenhum).
    const handler = Object.getOwnPropertyDescriptor(
      UsersController.prototype,
      'requestDeletion',
    )?.value as unknown;
    const code = Reflect.getMetadata('__httpCode__', handler) as number;

    expect(code).toBe(202);
  });
});
