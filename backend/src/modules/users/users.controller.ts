import {
    Controller,
    Get,
    Put,
    Post,
    Delete,
    Param,
    Body,
    Headers,
    HttpException,
    HttpStatus,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
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
    constructor(private readonly usersService: UsersService) { }

    /**
     * Get user profile
     */
    @Get(':userId')
    async getUser(
        @Param('userId') userId: string,
        @Headers('x-user-id') requestingUserId: string,
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
        @Headers('x-user-id') requestingUserId: string,
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
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES } }))
    async uploadAvatar(
        @Param('userId') userId: string,
        @Headers('x-user-id') requestingUserId: string,
        @UploadedFile() file: UploadedAvatarFile,
    ) {
        if (requestingUserId !== userId) {
            throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }

        if (!file || !file.buffer) {
            throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
        }

        if (file.size > MAX_AVATAR_BYTES) {
            throw new HttpException('File too large (max 5 MB)', HttpStatus.PAYLOAD_TOO_LARGE);
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
     * Delete user account (LGPD compliance)
     */
    @Delete(':userId')
    async deleteUser(
        @Param('userId') userId: string,
        @Headers('x-user-id') requestingUserId: string,
    ) {
        if (requestingUserId !== userId) {
            throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }

        await this.usersService.deleteUser(userId);
        return { success: true, message: 'User deleted successfully' };
    }
}
