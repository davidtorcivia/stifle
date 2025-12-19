import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import crypto from 'crypto';
import { getWeekStartForTimezone } from '../utils/time.js';
import { scheduleTemptationForUser } from '../services/temptation.service.js';
import { calculateStreakPoints } from '../utils/scoring.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

// Password must have: 8+ chars, 1 uppercase, 1 lowercase, 1 number
const passwordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number');

const updateUserSchema = z.object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
    timezone: z.string().optional(),
    isDiscoverable: z.boolean().optional(),
});

const updateTrackingSchema = z.object({
    status: z.enum(['pending', 'verified', 'broken']),
});

const changePasswordSchema = z.object({
    currentPassword: z.string(),
    newPassword: passwordSchema,
});

const changeEmailSchema = z.object({
    email: z.string().email(),
    password: z.string(), // Require password confirmation for security
});

// Password hashing functions imported from utils/password.js

export async function userRoutes(app: FastifyInstance) {
    // Get current user
    app.get('/me', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;

        const result = await db.query(
            `SELECT id, username, email, timezone, platform, tracking_status, created_at, is_discoverable
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
                longestStreak: weeklyScore.longest_streak,
            },
            isDiscoverable: user.is_discoverable,
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

        // Get today's SCORING streak count (only streaks 10+ minutes)
        const todayResult = await db.query(
            `WITH today_unlocks AS (
                SELECT id, timestamp as unlock_time
                FROM events
                WHERE user_id = $1 
                  AND event_type = 'unlock'
                  AND timestamp >= date_trunc('day', NOW())
            ),
            unlock_with_lock AS (
                SELECT 
                    tu.id,
                    tu.unlock_time,
                    (
                        SELECT e.timestamp 
                        FROM events e 
                        WHERE e.user_id = $1 
                          AND e.event_type = 'lock' 
                          AND e.timestamp < tu.unlock_time
                        ORDER BY e.timestamp DESC 
                        LIMIT 1
                    ) as lock_time
                FROM today_unlocks tu
            )
            SELECT COUNT(*) as count 
            FROM unlock_with_lock
            WHERE lock_time IS NOT NULL
              AND EXTRACT(EPOCH FROM (unlock_time - lock_time)) >= 600`,
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
            // Use the SAME formula as weekly score calculation
            const lockTimestamp = new Date(row.lock_time).getTime();
            const unlockTimestamp = new Date(row.unlock_time).getTime();
            const pointsEarned = calculateStreakPoints(lockTimestamp, unlockTimestamp);

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

    // Get weekly summary for turnovers and ghost comparisons
    app.get('/me/weekly-summary', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;

        // Get user timezone
        const userResult = await db.query(
            'SELECT timezone FROM users WHERE id = $1',
            [userId]
        );
        const timezone = userResult.rows[0]?.timezone || 'UTC';
        const currentWeekStart = getWeekStartForTimezone(new Date(), timezone);

        // Calculate last week start
        const lastWeekStart = new Date(currentWeekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);

        // Get this week's score
        const thisWeekResult = await db.query(
            `SELECT COALESCE(total_points, 0) as points, COALESCE(streak_count, 0) as streaks
             FROM weekly_scores WHERE user_id = $1 AND week_start = $2`,
            [userId, currentWeekStart]
        );
        const thisWeekPoints = Number(thisWeekResult.rows[0]?.points || 0);
        const thisWeekStreaks = thisWeekResult.rows[0]?.streaks || 0;

        // Get last week's score
        const lastWeekResult = await db.query(
            `SELECT COALESCE(total_points, 0) as points
             FROM weekly_scores WHERE user_id = $1 AND week_start = $2`,
            [userId, lastWeekStart]
        );
        const lastWeekPoints = Number(lastWeekResult.rows[0]?.points || 0);

        // Get friends average (current week)
        const friendsAvgResult = await db.query(
            `WITH friend_ids AS (
                SELECT CASE 
                    WHEN f.requester_id = $1 THEN f.addressee_id 
                    ELSE f.requester_id 
                END as friend_id
                FROM friendships f
                WHERE (f.requester_id = $1 OR f.addressee_id = $1)
                  AND f.status = 'accepted'
            )
            SELECT AVG(COALESCE(ws.total_points, 0)) as avg_points,
                   COUNT(*) as friend_count
            FROM friend_ids fi
            LEFT JOIN weekly_scores ws ON ws.user_id = fi.friend_id 
                AND ws.week_start = $2`,
            [userId, currentWeekStart]
        );
        const friendsAvg = Number(friendsAvgResult.rows[0]?.avg_points || 0);
        const friendCount = parseInt(friendsAvgResult.rows[0]?.friend_count || '0');

        // Get rank among friends
        const rankResult = await db.query(
            `WITH friend_ids AS (
                SELECT CASE 
                    WHEN f.requester_id = $1 THEN f.addressee_id 
                    ELSE f.requester_id 
                END as friend_id
                FROM friendships f
                WHERE (f.requester_id = $1 OR f.addressee_id = $1)
                  AND f.status = 'accepted'
            ),
            all_users AS (
                SELECT $1 as user_id
                UNION
                SELECT friend_id FROM friend_ids
            ),
            ranked AS (
                SELECT au.user_id,
                       COALESCE(ws.total_points, 0) as points,
                       RANK() OVER (ORDER BY COALESCE(ws.total_points, 0) DESC) as rank
                FROM all_users au
                LEFT JOIN weekly_scores ws ON ws.user_id = au.user_id 
                    AND ws.week_start = $2
            )
            SELECT rank, points FROM ranked WHERE user_id = $1`,
            [userId, currentWeekStart]
        );
        const currentRank = parseInt(rankResult.rows[0]?.rank || '1');

        // Get personal best and average (all time)
        const historyResult = await db.query(
            `SELECT MAX(total_points) as best, AVG(total_points) as avg,
                    (SELECT week_start FROM weekly_scores WHERE user_id = $1 
                     ORDER BY total_points DESC LIMIT 1) as best_week
             FROM weekly_scores WHERE user_id = $1`,
            [userId]
        );
        const personalBest = Number(historyResult.rows[0]?.best || 0);
        const personalAvg = Number(historyResult.rows[0]?.avg || 0);
        const bestWeek = historyResult.rows[0]?.best_week;

        // Calculate trend (weeks improving in a row)
        const trendResult = await db.query(
            `SELECT week_start, total_points FROM weekly_scores 
             WHERE user_id = $1 
             ORDER BY week_start DESC 
             LIMIT 4`,
            [userId]
        );
        let weeksImproving = 0;
        const weeks = trendResult.rows;
        for (let i = 0; i < weeks.length - 1; i++) {
            if (Number(weeks[i].total_points) > Number(weeks[i + 1].total_points)) {
                weeksImproving++;
            } else {
                break;
            }
        }

        // Build response (only include positive comparisons)
        const response: any = {
            thisWeek: {
                points: thisWeekPoints,
                streaks: thisWeekStreaks,
                rank: currentRank,
                totalParticipants: friendCount + 1,
            },
        };

        // vs Last Week (only if we have data and it's positive or the same)
        if (lastWeekPoints > 0) {
            const diff = thisWeekPoints - lastWeekPoints;
            const percentDiff = lastWeekPoints > 0 ? (diff / lastWeekPoints) * 100 : 0;
            response.vsLastWeek = {
                pointsDiff: Math.round(diff * 100) / 100,
                percentDiff: Math.round(percentDiff * 10) / 10,
                wasImprovement: diff >= 0,
            };
        }

        // vs Friends Average (only if user has friends)
        if (friendCount > 0 && friendsAvg > 0) {
            const diff = thisWeekPoints - friendsAvg;
            const percentDiff = (diff / friendsAvg) * 100;
            response.vsFriendsAvg = {
                percentDiff: Math.round(percentDiff * 10) / 10,
                isAboveAvg: diff >= 0,
            };
        }

        // vs Personal Best
        if (personalBest > 0) {
            const isBeat = thisWeekPoints >= personalBest;
            response.vsPersonalBest = {
                bestPoints: personalBest,
                bestWeek: bestWeek,
                isBeat,
                pointsAway: isBeat ? 0 : Math.round((personalBest - thisWeekPoints) * 100) / 100,
            };
        }

        // vs Personal Average
        if (personalAvg > 0) {
            const diff = thisWeekPoints - personalAvg;
            const percentDiff = (diff / personalAvg) * 100;
            response.vsPersonalAvg = {
                avgPoints: Math.round(personalAvg * 100) / 100,
                percentDiff: Math.round(percentDiff * 10) / 10,
            };
        }

        // Positive trend only
        if (weeksImproving >= 2) {
            response.trend = {
                weeksImproving,
            };
        }

        return response;
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
            // Check if timezone was changed recently (rate limit: once per 7 days)
            const lastChangeResult = await db.query(
                `SELECT timezone_changed_at FROM users WHERE id = $1`,
                [userId]
            );

            const lastChange = lastChangeResult.rows[0]?.timezone_changed_at;
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            if (lastChange && new Date(lastChange) > sevenDaysAgo) {
                const nextAllowed = new Date(new Date(lastChange).getTime() + 7 * 24 * 60 * 60 * 1000);
                return reply.status(429).send({
                    error: 'Timezone can only be changed once per week',
                    nextAllowedAt: nextAllowed.toISOString()
                });
            }

            updates.push(`timezone = $${paramIndex++}`);
            values.push(body.timezone);
            updates.push(`timezone_changed_at = $${paramIndex++}`);
            values.push(new Date());
        }

        if (body.isDiscoverable !== undefined) {
            updates.push(`is_discoverable = $${paramIndex++}`);
            values.push(body.isDiscoverable);
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

    // Change password
    app.put('/me/password', {
        preHandler: [(app as any).authenticate],
    }, async (request, reply) => {
        const userId = (request as any).user.id;
        const body = changePasswordSchema.parse(request.body);

        // Get current password hash
        const userResult = await db.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return reply.status(404).send({ error: 'User not found' });
        }

        // Verify current password
        const validPassword = await verifyPassword(body.currentPassword, userResult.rows[0].password_hash);
        if (!validPassword) {
            return reply.status(401).send({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const newHash = await hashPassword(body.newPassword);

        // Update password
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [newHash, userId]
        );

        // Revoke all refresh tokens to force re-login on other devices
        await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

        return { success: true, message: 'Password changed successfully' };
    });

    // Change email
    app.put('/me/email', {
        preHandler: [(app as any).authenticate],
    }, async (request, reply) => {
        const userId = (request as any).user.id;
        const body = changeEmailSchema.parse(request.body);

        // Get current password hash
        const userResult = await db.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return reply.status(404).send({ error: 'User not found' });
        }

        // Verify password (required for email change security)
        const validPassword = await verifyPassword(body.password, userResult.rows[0].password_hash);
        if (!validPassword) {
            return reply.status(401).send({ error: 'Password is incorrect' });
        }

        // Check if email is taken
        const existingResult = await db.query(
            'SELECT id FROM users WHERE email = $1 AND id != $2',
            [body.email, userId]
        );

        if (existingResult.rows.length > 0) {
            return reply.status(409).send({ error: 'Email already in use' });
        }

        // Update email
        await db.query(
            'UPDATE users SET email = $1 WHERE id = $2',
            [body.email, userId]
        );

        return { success: true, message: 'Email changed successfully' };
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

            // Reschedule immediately to reflect new settings
            await scheduleTemptationForUser(userId);
        }

        return { success: true };
    });
}
