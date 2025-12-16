import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import crypto from 'crypto';
import { getWeekStartForTimezone } from '../utils/time.js';

const updateUserSchema = z.object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
    timezone: z.string().optional(),
});

const updateTrackingSchema = z.object({
    status: z.enum(['pending', 'verified', 'broken']),
});

export async function userRoutes(app: FastifyInstance) {
    // Get current user
    app.get('/me', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;

        const result = await db.query(
            `SELECT id, username, email, timezone, platform, tracking_status, created_at
       FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return { error: 'User not found' };
        }

        const user = result.rows[0];

        // Get current week score
        const scoreResult = await db.query(
            `SELECT total_points, streak_count, longest_streak
       FROM weekly_scores
       WHERE user_id = $1 AND week_start = date_trunc('week', NOW())
       ORDER BY week_start DESC LIMIT 1`,
            [userId]
        );

        const weeklyScore = scoreResult.rows[0] || {
            total_points: 0,
            streak_count: 0,
            longest_streak: 0,
        };

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            timezone: user.timezone,
            platform: user.platform,
            trackingStatus: user.tracking_status,
            createdAt: user.created_at,
            weeklyScore: {
                totalPoints: Number(weeklyScore.total_points),
                streakCount: weeklyScore.streak_count,
                longestStreak: weeklyScore.longest_streak,
            },
        };
    });

    // Get user stats (for HomeScreen display)
    app.get('/me/stats', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;

        // Get user timezone
        const userResult = await db.query(
            'SELECT timezone FROM users WHERE id = $1',
            [userId]
        );
        const timezone = userResult.rows[0]?.timezone || 'UTC';
        const weekStart = getWeekStartForTimezone(new Date(), timezone);

        // Get current week score using the same week calculation as scoring
        const weekResult = await db.query(
            `SELECT COALESCE(total_points, 0) as total_points, 
                    COALESCE(streak_count, 0) as streak_count
             FROM weekly_scores
             WHERE user_id = $1 AND week_start = $2`,
            [userId, weekStart]
        );

        const weeklyPoints = weekResult.rows[0]?.total_points || 0;

        // Get today's streak count
        const todayResult = await db.query(
            `SELECT COUNT(*) as count FROM events
             WHERE user_id = $1 
               AND event_type = 'unlock'
               AND timestamp >= date_trunc('day', NOW())`,
            [userId]
        );
        const todayStreakCount = parseInt(todayResult.rows[0]?.count || '0');

        // Get last completed streak (last lock->unlock pair)
        const lastStreakResult = await db.query(
            `WITH last_unlock AS (
                SELECT id, timestamp as unlock_time
                FROM events
                WHERE user_id = $1 AND event_type = 'unlock'
                ORDER BY timestamp DESC
                LIMIT 1
            ),
            preceding_lock AS (
                SELECT e.timestamp as lock_time
                FROM events e, last_unlock lu
                WHERE e.user_id = $1 
                  AND e.event_type = 'lock'
                  AND e.timestamp < lu.unlock_time
                ORDER BY e.timestamp DESC
                LIMIT 1
            )
            SELECT 
                lu.unlock_time,
                pl.lock_time,
                EXTRACT(EPOCH FROM (lu.unlock_time - pl.lock_time)) as duration_seconds
            FROM last_unlock lu
            LEFT JOIN preceding_lock pl ON true
            WHERE pl.lock_time IS NOT NULL`,
            [userId]
        );

        let lastStreak = null;
        if (lastStreakResult.rows.length > 0) {
            const row = lastStreakResult.rows[0];
            const durationSeconds = Math.round(Number(row.duration_seconds) || 0);
            // Calculate points earned using same formula as scoring
            const durationMinutes = durationSeconds / 60;
            const pointsEarned = durationSeconds >= 60 ? Math.max(0, Math.round(Math.log(durationMinutes) * 10 * 100) / 100) : 0;

            lastStreak = {
                durationSeconds,
                pointsEarned,
                endedAt: row.unlock_time,
            };
        }

        return {
            weeklyPoints: Number(weeklyPoints),
            todayStreakCount,
            lastStreak,
        };
    });


    // Update user profile
    app.put('/me', {
        preHandler: [(app as any).authenticate],
    }, async (request, reply) => {
        const userId = (request as any).user.id;
        const body = updateUserSchema.parse(request.body);

        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (body.username) {
            // Check if username is taken
            const existing = await db.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [body.username, userId]
            );
            if (existing.rows.length > 0) {
                return reply.status(409).send({ error: 'Username already taken' });
            }
            updates.push(`username = $${paramIndex++}`);
            values.push(body.username);
        }

        if (body.timezone) {
            updates.push(`timezone = $${paramIndex++}`);
            values.push(body.timezone);
        }

        if (updates.length === 0) {
            return { success: true };
        }

        values.push(userId);
        await db.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
        );

        return { success: true };
    });

    // Delete account and all data
    app.delete('/me', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;

        // Delete in order due to foreign key constraints
        // This cascades to remove all user data
        await db.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM temptation_settings WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM weekly_scores WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM events WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM group_members WHERE user_id = $1', [userId]);
        await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

        // Update invite codes to show they were used by deleted user
        await db.query(
            'UPDATE invite_codes SET used_by = NULL WHERE used_by = $1',
            [userId]
        );

        // Delete groups where user is sole owner
        await db.query(
            `DELETE FROM groups WHERE creator_id = $1 
             AND NOT EXISTS (
                SELECT 1 FROM group_members 
                WHERE group_id = groups.id AND user_id != $1
             )`,
            [userId]
        );

        // Finally delete the user
        await db.query('DELETE FROM users WHERE id = $1', [userId]);

        return { success: true, message: 'Account deleted' };
    });

    // Update tracking status
    app.put('/me/tracking-status', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;
        const body = updateTrackingSchema.parse(request.body);

        await db.query(
            'UPDATE users SET tracking_status = $1 WHERE id = $2',
            [body.status, userId]
        );

        return { success: true, status: body.status };
    });

    // Create invite codes (each user can create up to 5)
    app.post('/me/invites', {
        preHandler: [(app as any).authenticate],
    }, async (request, reply) => {
        const userId = (request as any).user.id;

        // Check how many unused invites user has created
        const countResult = await db.query(
            `SELECT COUNT(*) as count FROM invite_codes
       WHERE creator_id = $1 AND used_by IS NULL`,
            [userId]
        );

        if (parseInt(countResult.rows[0].count) >= 5) {
            return reply.status(400).send({ error: 'Maximum 5 unused invite codes allowed' });
        }

        // Generate code
        const code = crypto.randomBytes(6).toString('hex').toUpperCase();

        await db.query(
            `INSERT INTO invite_codes (code, creator_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
            [code, userId]
        );

        return { code, expiresIn: '30 days' };
    });

    // Get user's invite codes
    app.get('/me/invites', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;

        const result = await db.query(
            `SELECT code, used_by IS NOT NULL as used, expires_at, created_at
       FROM invite_codes
       WHERE creator_id = $1
       ORDER BY created_at DESC`,
            [userId]
        );

        return result.rows.map(row => ({
            code: row.code,
            used: row.used,
            expiresAt: row.expires_at,
            createdAt: row.created_at,
        }));
    });

    // Register push token
    const pushTokenSchema = z.object({
        token: z.string().min(1),
        platform: z.enum(['android', 'ios']),
    });

    app.post('/me/push-token', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;
        const body = pushTokenSchema.parse(request.body);

        // Upsert the token
        await db.query(
            `INSERT INTO push_tokens (user_id, platform, token)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, platform) 
             DO UPDATE SET token = EXCLUDED.token, updated_at = NOW()`,
            [userId, body.platform, body.token]
        );

        return { success: true };
    });

    // Get temptation settings
    app.get('/me/temptation', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;

        const result = await db.query(
            `SELECT enabled, frequency_minutes, quiet_hours_start, quiet_hours_end
             FROM temptation_settings
             WHERE user_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            // Create default settings
            await db.query(
                'INSERT INTO temptation_settings (user_id) VALUES ($1)',
                [userId]
            );
            return {
                enabled: true,
                frequencyMinutes: 120,
                quietHoursStart: '22:00',
                quietHoursEnd: '08:00',
            };
        }

        const settings = result.rows[0];
        return {
            enabled: settings.enabled,
            frequencyMinutes: settings.frequency_minutes,
            quietHoursStart: settings.quiet_hours_start,
            quietHoursEnd: settings.quiet_hours_end,
        };
    });

    // Update temptation settings
    const temptationSettingsSchema = z.object({
        enabled: z.boolean().optional(),
        frequencyMinutes: z.number().min(15).max(480).optional(),
        quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    });

    app.put('/me/temptation', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;
        const body = temptationSettingsSchema.parse(request.body);

        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (body.enabled !== undefined) {
            updates.push(`enabled = $${paramIndex++}`);
            values.push(body.enabled);
        }
        if (body.frequencyMinutes !== undefined) {
            updates.push(`frequency_minutes = $${paramIndex++}`);
            values.push(body.frequencyMinutes);
        }
        if (body.quietHoursStart !== undefined) {
            updates.push(`quiet_hours_start = $${paramIndex++}`);
            values.push(body.quietHoursStart);
        }
        if (body.quietHoursEnd !== undefined) {
            updates.push(`quiet_hours_end = $${paramIndex++}`);
            values.push(body.quietHoursEnd);
        }

        if (updates.length > 0) {
            values.push(userId);
            await db.query(
                `UPDATE temptation_settings SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`,
                values
            );
        }

        return { success: true };
    });
}
