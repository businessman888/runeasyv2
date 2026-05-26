import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';

export interface ValidateResult {
    valid: boolean;
    influencer_name?: string;
    discount_description?: string;
    message?: string;
}

export interface ApplyResult {
    applied: boolean;
    influencer_id: string;
    referral_id: string;
}

export type StatusResult =
    | {
          has_referral: true;
          code: string;
          influencer_name: string;
          applied_at: string;
      }
    | { has_referral: false };

export const ReferralError = {
    NOT_FOUND: 'NOT_FOUND',
    ALREADY_APPLIED: 'ALREADY_APPLIED',
    RATE_LIMITED: 'RATE_LIMITED',
    NETWORK: 'NETWORK',
    UNKNOWN: 'UNKNOWN',
} as const;
export type ReferralErrorCode = (typeof ReferralError)[keyof typeof ReferralError];

export class ReferralApiError extends Error {
    code: ReferralErrorCode;
    constructor(code: ReferralErrorCode, message: string) {
        super(message);
        this.code = code;
    }
}

async function authHeaders(): Promise<HeadersInit> {
    const userId = await Storage.getItemAsync('user_id');
    if (!userId) {
        throw new ReferralApiError(ReferralError.UNKNOWN, 'Usuário não autenticado');
    }
    return {
        'Content-Type': 'application/json',
        'x-user-id': userId,
    };
}

export const referralService = {
    async validate(code: string): Promise<ValidateResult> {
        try {
            const res = await fetch(`${BASE_API_URL}/referral/validate`, {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ code }),
            });
            if (res.status === 429) {
                throw new ReferralApiError(
                    ReferralError.RATE_LIMITED,
                    'Muitas tentativas. Tente novamente mais tarde.',
                );
            }
            if (!res.ok) {
                return { valid: false, message: 'Código não encontrado' };
            }
            return (await res.json()) as ValidateResult;
        } catch (err) {
            if (err instanceof ReferralApiError) throw err;
            throw new ReferralApiError(ReferralError.NETWORK, 'Erro de conexão');
        }
    },

    async apply(code: string): Promise<ApplyResult> {
        try {
            const res = await fetch(`${BASE_API_URL}/referral/apply`, {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ code }),
            });
            if (res.status === 409) {
                throw new ReferralApiError(
                    ReferralError.ALREADY_APPLIED,
                    'Você já usou um código de indicação',
                );
            }
            if (res.status === 404) {
                throw new ReferralApiError(
                    ReferralError.NOT_FOUND,
                    'Código não encontrado',
                );
            }
            if (!res.ok) {
                throw new ReferralApiError(
                    ReferralError.UNKNOWN,
                    'Não foi possível aplicar o código',
                );
            }
            return (await res.json()) as ApplyResult;
        } catch (err) {
            if (err instanceof ReferralApiError) throw err;
            throw new ReferralApiError(ReferralError.NETWORK, 'Erro de conexão');
        }
    },

    async getStatus(): Promise<StatusResult> {
        try {
            const res = await fetch(`${BASE_API_URL}/referral/status`, {
                method: 'GET',
                headers: await authHeaders(),
            });
            if (!res.ok) {
                return { has_referral: false };
            }
            return (await res.json()) as StatusResult;
        } catch {
            return { has_referral: false };
        }
    },
};
