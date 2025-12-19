import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../db/client.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

// Password must have: 8+ chars, 1 uppercase, 1 lowercase, 1 number
const passwordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number');

const registerSchema = z.object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email(),
    password: passwordSchema,
    inviteCode: z.string().min(1),
    platform: z.enum(['ios', 'android']),
    timezone: z.string().default('UTC'),
    deviceId: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
    deviceId: z.string().optional(),
});

const refreshSchema = z.object({
    refreshToken: z.string(),
});

// Rate limit config for auth endpoints (stricter than global)
const authRateLimit = {
    max: 5,              // 5 attempts
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
        error: 'Too many attempts. Please try again later.',
        retryAfter: 60,
    }),
};

// Password hashing functions imported from utils/password.js

function generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

export async function authRoutes(app: FastifyInstance) {
    // Register with invite code
    app.post('/register', {
        config: { rateLimit: authRateLimit },
    }, async (request, reply) => {
        const body = registerSchema.parse(request.body);

        // Verify invite code
        const inviteResult = await db.query(
            `SELECT code, expires_at FROM invite_codes 
       WHERE code = $1 AND used_by IS NULL AND expires_at > NOW()`,
            [body.inviteCode]
        );

        if (inviteResult.rows.length === 0) {
            return reply.status(400).send({ error: 'Invalid or expired invite code' });
        }

        // Check if user exists
        const existingUser = await db.query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [body.email, body.username]
        );

        if (existingUser.rows.length > 0) {
            return reply.status(409).send({ error: 'Email or username already taken' });
        }

        // Create user
        const passwordHash = await hashPassword(body.password);
        const userResult = await db.query(
            `INSERT INTO users (username, email, password_hash, platform, timezone, device_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, timezone, platform, tracking_status, created_at`,
            [body.username, body.email, passwordHash, body.platform, body.timezone, body.deviceId]
        );

        const user = userResult.rows[0];

        // Mark invite code as used
        await db.query(
            'UPDATE invite_codes SET used_by = $1 WHERE code = $2',
            [user.id, body.inviteCode]
        );

        // Create default temptation settings
        await db.query(
            'INSERT INTO temptation_settings (user_id) VALUES ($1)',
            [user.id]
        );

        // Generate tokens
        const accessToken = app.jwt.sign({ id: user.id, username: user.username });
        const refreshToken = generateRefreshToken();
        const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        await db.query(
            `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
            [user.id, refreshHash]
        );

        return {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                timezone: user.timezone,
                platform: user.platform,
                trackingStatus: user.tracking_status,
            },
            accessToken,
            refreshToken,
        };
    });

    // Login
    app.post('/login', {
        config: { rateLimit: authRateLimit },
    }, async (request, reply) => {
        const body = loginSchema.parse(request.body);

        const userResult = await db.query(
            `SELECT id, username, email, password_hash, timezone, platform, tracking_status, device_id, role
       FROM users WHERE email = $1`,
            [body.email]
        );

        if (userResult.rows.length === 0) {
            return reply.status(401).send({ error: 'Invalid credentials' });
        }

        const user = userResult.rows[0];

        const validPassword = await verifyPassword(body.password, user.password_hash);
        if (!validPassword) {
            return reply.status(401).send({ error: 'Invalid credentials' });
        }

        // Single device enforcement: update device_id if provided
        if (body.deviceId && user.device_id !== body.deviceId) {
            await db.query(
                'UPDATE users SET device_id = $1 WHERE id = $2',
                [body.deviceId, user.id]
            );
        }

        // Note: We don't delete old refresh tokens on login anymore.
        // This prevents accidental logout when the app re-authenticates.
        // Old tokens naturally expire after 90 days.

        // Generate new tokens
        const accessToken = app.jwt.sign({ id: user.id, username: user.username });
        const refreshToken = generateRefreshToken();
        const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        await db.query(
            `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
            [user.id, refreshHash]
        );

        return {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                timezone: user.timezone,
                platform: user.platform,
                trackingStatus: user.tracking_status,
                role: user.role || 'user',
            },
            accessToken,
            refreshToken,
        };
    });

    // Refresh token
    app.post('/refresh', async (request, reply) => {
        const body = refreshSchema.parse(request.body);
        const tokenHash = crypto.createHash('sha256').update(body.refreshToken).digest('hex');

        const tokenResult = await db.query(
            `SELECT rt.user_id, u.username
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
            [tokenHash]
        );

        if (tokenResult.rows.length === 0) {
            return reply.status(401).send({ error: 'Invalid refresh token' });
        }

        const { user_id, username } = tokenResult.rows[0];

        // Mark old token as expiring soon (5 min grace period for network issues)
        // This prevents permanent lockout if response doesn't reach client
        await db.query(
            `UPDATE refresh_tokens SET expires_at = NOW() + INTERVAL '5 minutes'
       WHERE token_hash = $1`,
            [tokenHash]
        );

        // Generate new tokens
        const accessToken = app.jwt.sign({ id: user_id, username });
        const newRefreshToken = generateRefreshToken();
        const newRefreshHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

        await db.query(
            `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '90 days')`,
            [user_id, newRefreshHash]
        );

        return {
            accessToken,
            refreshToken: newRefreshToken,
        };
    });

    // Logout
    app.post('/logout', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;
        await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
        return { success: true };
    });
}
