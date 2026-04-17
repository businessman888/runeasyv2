import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../database';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(private readonly supabaseService: SupabaseService) {}

    async signInWithGoogle(idToken: string) {
        this.logger.log('[AUTH] Exchanging Google ID token with Supabase...');

        const { data, error } = await this.supabaseService.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
        });

        if (error) {
            this.logger.error('[AUTH] Google sign-in failed:', error.message);
            throw new UnauthorizedException(error.message);
        }

        if (!data.session || !data.user) {
            throw new UnauthorizedException('No session returned from Supabase');
        }

        this.logger.log(`[AUTH] Google sign-in successful, userId: ${data.user.id}`);

        return {
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_in: data.session.expires_in,
                token_type: data.session.token_type,
            },
            user: {
                id: data.user.id,
                email: data.user.email,
            },
        };
    }

    async signInWithApple(idToken: string, nonce?: string) {
        this.logger.log('[AUTH] Exchanging Apple ID token with Supabase...');

        const { data, error } = await this.supabaseService.auth.signInWithIdToken({
            provider: 'apple',
            token: idToken,
            nonce,
        });

        if (error) {
            this.logger.error('[AUTH] Apple sign-in failed:', error.message);
            throw new UnauthorizedException(error.message);
        }

        if (!data.session || !data.user) {
            throw new UnauthorizedException('No session returned from Supabase');
        }

        this.logger.log(`[AUTH] Apple sign-in successful, userId: ${data.user.id}`);

        return {
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_in: data.session.expires_in,
                token_type: data.session.token_type,
            },
            user: {
                id: data.user.id,
                email: data.user.email,
            },
        };
    }
}
