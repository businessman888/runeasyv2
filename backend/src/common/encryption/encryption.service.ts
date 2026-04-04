import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag
const ENCODING = 'base64';
const SEPARATOR = ':'; // iv:tag:ciphertext

@Injectable()
export class EncryptionService {
    private readonly key: Buffer;

    constructor(private readonly configService: ConfigService) {
        const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');

        if (!encryptionKey) {
            throw new Error(
                'ENCRYPTION_KEY environment variable is required. ' +
                'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
            );
        }

        // Key must be 32 bytes (256 bits) for AES-256
        this.key = Buffer.from(encryptionKey, 'hex');

        if (this.key.length !== 32) {
            throw new Error(
                'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
                'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
            );
        }
    }

    /**
     * Encrypt a plaintext string using AES-256-GCM.
     * Returns format: base64(iv):base64(authTag):base64(ciphertext)
     */
    encrypt(plaintext: string): string {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

        let encrypted = cipher.update(plaintext, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const tag = cipher.getAuthTag();

        return [
            iv.toString(ENCODING),
            tag.toString(ENCODING),
            encrypted.toString(ENCODING),
        ].join(SEPARATOR);
    }

    /**
     * Decrypt a ciphertext string encrypted with encrypt().
     * Expects format: base64(iv):base64(authTag):base64(ciphertext)
     */
    decrypt(ciphertext: string): string {
        const parts = ciphertext.split(SEPARATOR);

        if (parts.length !== 3) {
            throw new Error('Invalid encrypted data format');
        }

        const [ivStr, tagStr, encryptedStr] = parts;

        const iv = Buffer.from(ivStr, ENCODING);
        const tag = Buffer.from(tagStr, ENCODING);
        const encrypted = Buffer.from(encryptedStr, ENCODING);

        const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString('utf8');
    }
}
