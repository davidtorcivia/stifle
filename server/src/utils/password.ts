import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt) as (
    password: crypto.BinaryLike,
    salt: crypto.BinaryLike,
    keylen: number
) => Promise<Buffer>;

/**
 * Hash a password using scrypt (async, non-blocking)
 * 
 * Uses scrypt with a random 16-byte salt and 64-byte output.
 * Format: salt:hash (both hex-encoded)
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, 64);
    const hash = derivedKey.toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash
 * Uses timing-safe comparison to prevent timing attacks
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [salt, storedHash] = stored.split(':');
    if (!salt || !storedHash) {
        return false;
    }

    const derivedKey = await scrypt(password, salt, 64);
    const testHash = derivedKey.toString('hex');

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
        Buffer.from(storedHash, 'hex'),
        Buffer.from(testHash, 'hex')
    );
}
