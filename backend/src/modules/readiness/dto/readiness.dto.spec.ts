import { ValidationPipe, ArgumentMetadata } from '@nestjs/common';
import { ReadinessCheckInDto } from './readiness.dto';

/**
 * O contrato de entrada do check-in, validado pelo MESMO pipe do runtime.
 *
 * Por que este arquivo existe: o campo `userId` do DTO é código morto de
 * propósito — aceito e nunca lido. Sem um teste, o próximo leitor "limpa" o
 * campo e derruba o check-in de toda a base instalada, porque o
 * `forbidNonWhitelisted` transforma um campo a mais em 400.
 *
 * Os flags abaixo são cópia literal de `main.ts`. Se lá mudarem, aqui muda.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const meta: ArgumentMetadata = {
  type: 'body',
  metatype: ReadinessCheckInDto,
  data: '',
};

const answers = { sleep: 4, legs: 3, mood: 5, stress: 4, motivation: 5 };

describe('ReadinessCheckInDto', () => {
  describe('compat com o app instalado', () => {
    it('aceita o payload EXATO do app 1.0.9 (com userId no body)', async () => {
      // Esta é a prova de que remover `userId` do DTO daria 400 em produção.
      await expect(
        pipe.transform(
          {
            userId: 'c40efbbd-d792-4561-ad15-0ecc0d9fda84',
            answers,
            setNumber: 7,
          },
          meta,
        ),
      ).resolves.toMatchObject({ answers, setNumber: 7 });
    });

    it('aceita payload SEM userId, para o mobile poder parar de enviar', async () => {
      // Compatível nos dois sentidos: nenhuma coordenação de deploy necessária.
      await expect(
        pipe.transform({ answers, setNumber: 7 }, meta),
      ).resolves.toMatchObject({ answers });
    });

    it('rejeita campo desconhecido — a razão de userId seguir declarado', async () => {
      await expect(
        pipe.transform({ answers, campoNovo: 1 }, meta),
      ).rejects.toThrow();
    });
  });

  describe('validação que substituiu a checagem manual do controller', () => {
    it('rejeita answers ausente (trava o @IsDefined)', async () => {
      // Sem @IsDefined, @ValidateNested PULA o undefined: o body passaria e o
      // erro só apareceria ao ler `answers.sleep` — 500 em vez de 400.
      await expect(pipe.transform({ setNumber: 1 }, meta)).rejects.toThrow();
    });

    it.each([
      ['acima da escala', { ...answers, sleep: 6 }],
      ['abaixo da escala', { ...answers, sleep: 0 }],
      ['campo faltando', { legs: 3, mood: 5, stress: 4, motivation: 5 }],
      ['não numérico', { ...answers, mood: 'ótimo' }],
    ])('rejeita %s', async (_caso, bad) => {
      await expect(pipe.transform({ answers: bad }, meta)).rejects.toThrow();
    });

    it('aceita os extremos válidos da escala', async () => {
      const min = { sleep: 1, legs: 1, mood: 1, stress: 1, motivation: 1 };
      const max = { sleep: 5, legs: 5, mood: 5, stress: 5, motivation: 5 };

      await expect(
        pipe.transform({ answers: min }, meta),
      ).resolves.toBeDefined();
      await expect(
        pipe.transform({ answers: max }, meta),
      ).resolves.toBeDefined();
    });
  });
});
