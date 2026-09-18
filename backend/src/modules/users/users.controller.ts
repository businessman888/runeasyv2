import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
  HttpCode,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { User } from '../../common/decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';

interface UploadedAvatarFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get user profile
   */
  @Get(':userId')
  async getUser(
    @Param('userId') userId: string,
    @User('id') requestingUserId: string,
  ) {
    // Verify requesting user is the same as the user being fetched
    if (requestingUserId !== userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.usersService.getUser(userId);
    return { user };
  }

  /**
   * Update user profile
   */
  @Put(':userId/profile')
  async updateProfile(
    @Param('userId') userId: string,
    @User('id') requestingUserId: string,
    @Body() body: { profile: Record<string, any> },
  ) {
    if (requestingUserId !== userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.usersService.updateProfile(userId, body.profile);
    return { user };
  }

  /**
   * Upload profile avatar (multipart/form-data, field name: "file")
   */
  @Post(':userId/profile/avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES } }),
  )
  async uploadAvatar(
    @Param('userId') userId: string,
    @User('id') requestingUserId: string,
    @UploadedFile() file: UploadedAvatarFile,
  ) {
    if (requestingUserId !== userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    if (!file || !file.buffer) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    if (file.size > MAX_AVATAR_BYTES) {
      throw new HttpException(
        'File too large (max 5 MB)',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    try {
      const { avatar_url } = await this.usersService.uploadAvatar(
        userId,
        file.buffer,
        file.mimetype,
        file.originalname || 'avatar.jpg',
      );
      return { avatar_url };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Pede a exclusão da conta (LGPD, e diretriz 5.1.1(v) da App Store).
   *
   * Responde **202**: a exclusão foi aceita e vai acontecer, não terminou
   * agora. Ela fala com o Google (revogar o grant e remover a subscription
   * ANTES de o token sumir), com o Storage e com o Auth — três redes, nenhuma
   * dentro de uma transação. Segurar a resposta até tudo terminar faria uma
   * indisponibilidade externa virar erro na cara de quem já decidiu sair.
   *
   * A guarda de IDOR é a mesma de antes, e continua sendo a única que importa
   * aqui: só o dono pede a própria exclusão.
   */
  @Delete(':userId')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestDeletion(
    @Param('userId') userId: string,
    @User('id') requestingUserId: string,
  ) {
    if (requestingUserId !== userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const { requestedAt } = await this.usersService.requestDeletion(userId);
    return {
      success: true,
      requestedAt,
      message:
        'Exclusão solicitada. Seus dados serão removidos e as integrações revogadas.',
    };
  }
}
