import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { sendSocialNotification } from '../services/push.service.js';

// Schema definitions
const searchUsersSchema = z.object({
    query: z.string().min(2).max(50),
});

const friendRequestSchema = z.object({
    userId: z.string().uuid(),
});

const respondRequestSchema = z.object({
    action: z.enum(['accept', 'decline']),
});

export async function friendsRoutes(app: FastifyInstance) {
    // All friends routes require authentication
    const preHandler = [(app as any).authenticate];

    // ============================================
    // SEARCH USERS
    // ============================================

    // Search for users to add as friends
    app.get('/search', { preHandler }, async (request) => {
        const { query } = searchUsersSchema.parse(request.query);
        const userId = (request as any).user.id;

        // Search by username or email (case-insensitive, partial match for username, exact or partial for email)
        const result = await db.query(
            `SELECT u.id, u.username, u.platform,
                    f.status as friendship_status,
                    f.requester_id
             FROM users u
             LEFT JOIN friendships f ON (
                (f.requester_id = $1 AND f.addressee_id = u.id)
                OR (f.addressee_id = $1 AND f.requester_id = u.id)
             )
             WHERE u.id != $1 
               AND (u.username ILIKE $2 OR u.email ILIKE $2)
               AND u.is_discoverable = TRUE
             ORDER BY u.username
             LIMIT 20`,
            [userId, `%${query}%`]
        );

        return {
            users: result.rows.map(u => ({
                id: u.id,
                username: u.username,
                platform: u.platform,
                friendshipStatus: u.friendship_status || null,
                requestDirection: u.friendship_status && u.requester_id === userId ? 'outgoing' : 'incoming',
            })),
        };
    });

    // ============================================
    // FRIEND REQUESTS
    // ============================================

    // Send a friend request
    app.post('/request', { preHandler }, async (request, reply) => {
        const { userId: addresseeId } = friendRequestSchema.parse(request.body);
        const requesterId = (request as any).user.id;

        if (requesterId === addresseeId) {
            return reply.status(400).send({ error: 'Cannot send friend request to yourself' });
        }

        // Check if addressee exists
        const userResult = await db.query(
            'SELECT id FROM users WHERE id = $1',
            [addresseeId]
        );

        if (userResult.rows.length === 0) {
            return reply.status(404).send({ error: 'User not found' });
        }

        // Check for existing friendship in either direction
        const existingResult = await db.query(
            `SELECT id, status, requester_id FROM friendships 
             WHERE (requester_id = $1 AND addressee_id = $2)
                OR (requester_id = $2 AND addressee_id = $1)`,
            [requesterId, addresseeId]
        );

        if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];

            if (existing.status === 'accepted') {
                return reply.status(400).send({ error: 'Already friends' });
            }

            if (existing.status === 'blocked') {
                return reply.status(400).send({ error: 'Unable to send friend request' });
            }

            if (existing.status === 'pending') {
                // If THEY sent us a request, auto-accept it
                if (existing.requester_id === addresseeId) {
                    await db.query(
                        `UPDATE friendships SET status = 'accepted', updated_at = NOW()
                         WHERE id = $1`,
                        [existing.id]
                    );

                    // Notify them that we accepted (via mutual request)
                    const accepterResult = await db.query(
                        'SELECT username FROM users WHERE id = $1',
                        [requesterId]
                    );
                    const accepterUsername = accepterResult.rows[0]?.username || 'Someone';

                    sendSocialNotification(
                        addresseeId,
                        'You\'re Now Friends!',
                        `${accepterUsername} also sent you a request - you're now friends!`,
                        { type: 'friend_accepted', userId: requesterId }
                    ).catch(err => console.error('Failed to send mutual friend notification:', err));

                    return { message: 'Friend request accepted', status: 'accepted' };
                }
                // If WE already sent a request, just return pending
                return reply.status(400).send({ error: 'Friend request already sent' });
            }

            if (existing.status === 'declined') {
                // Allow re-sending if previously declined
                await db.query(
                    `UPDATE friendships 
                     SET status = 'pending', requester_id = $1, addressee_id = $2, updated_at = NOW()
                     WHERE id = $3`,
                    [requesterId, addresseeId, existing.id]
                );
                return { message: 'Friend request sent', status: 'pending' };
            }
        }

        // Create new friend request
        await db.query(
            `INSERT INTO friendships (requester_id, addressee_id, status)
             VALUES ($1, $2, 'pending')`,
            [requesterId, addresseeId]
        );

        // Get requester's username for notification
        const requesterResult = await db.query(
            'SELECT username FROM users WHERE id = $1',
            [requesterId]
        );
        const requesterUsername = requesterResult.rows[0]?.username || 'Someone';

        // Send push notification to addressee
        sendSocialNotification(
            addresseeId,
            'Friend Request',
            `${requesterUsername} wants to be your friend`,
            { type: 'friend_request', userId: requesterId }
        ).catch(err => console.error('Failed to send friend request notification:', err));

        return { message: 'Friend request sent', status: 'pending' };
    });

    // Get pending friend requests (incoming)
    app.get('/requests', { preHandler }, async (request) => {
        const userId = (request as any).user.id;

        const result = await db.query(
            `SELECT f.id, f.created_at,
                    u.id as user_id, u.username, u.platform
             FROM friendships f
             JOIN users u ON f.requester_id = u.id
             WHERE f.addressee_id = $1 AND f.status = 'pending'
             ORDER BY f.created_at DESC`,
            [userId]
        );

        return {
            requests: result.rows.map(r => ({
                id: r.id,
                userId: r.user_id,
                username: r.username,
                platform: r.platform,
                createdAt: r.created_at,
            })),
        };
    });

    // Get outgoing friend requests (sent by me, still pending)
    app.get('/requests/sent', { preHandler }, async (request) => {
        const userId = (request as any).user.id;

        const result = await db.query(
            `SELECT f.id, f.created_at,
                    u.id as user_id, u.username, u.platform
             FROM friendships f
             JOIN users u ON f.addressee_id = u.id
             WHERE f.requester_id = $1 AND f.status = 'pending'
             ORDER BY f.created_at DESC`,
            [userId]
        );

        return {
            requests: result.rows.map(r => ({
                id: r.id,
                userId: r.user_id,
                username: r.username,
                platform: r.platform,
                createdAt: r.created_at,
            })),
        };
    });

    // Respond to a friend request
    app.post('/requests/:id/respond', { preHandler }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const { action } = respondRequestSchema.parse(request.body);
        const userId = (request as any).user.id;

        // Get the request (must be addressed to current user)
        const requestResult = await db.query(
            `SELECT id, requester_id FROM friendships 
             WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
            [id, userId]
        );

        if (requestResult.rows.length === 0) {
            return reply.status(404).send({ error: 'Friend request not found' });
        }

        const newStatus = action === 'accept' ? 'accepted' : 'declined';

        await db.query(
            `UPDATE friendships SET status = $1, updated_at = NOW()
             WHERE id = $2`,
            [newStatus, id]
        );

        // If accepted, notify the original requester
        if (action === 'accept') {
            const requesterId = requestResult.rows[0].requester_id;
            const accepterResult = await db.query(
                'SELECT username FROM users WHERE id = $1',
                [userId]
            );
            const accepterUsername = accepterResult.rows[0]?.username || 'Someone';

            sendSocialNotification(
                requesterId,
                'Friend Request Accepted',
                `${accepterUsername} accepted your friend request`,
                { type: 'friend_accepted', userId }
            ).catch(err => console.error('Failed to send friend accepted notification:', err));
        }

        return {
            message: action === 'accept' ? 'Friend request accepted' : 'Friend request declined',
            status: newStatus,
        };
    });

    // Cancel a sent friend request
    app.delete('/requests/:id', { preHandler }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const userId = (request as any).user.id;

        const result = await db.query(
            `DELETE FROM friendships 
             WHERE id = $1 AND requester_id = $2 AND status = 'pending'
             RETURNING id`,
            [id, userId]
        );

        if (result.rowCount === 0) {
            return reply.status(404).send({ error: 'Friend request not found' });
        }

        return { message: 'Friend request cancelled' };
    });

    // ============================================
    // FRIENDS LIST & LEADERBOARD
    // ============================================

    // Get all friends
    app.get('/', { preHandler }, async (request) => {
        const userId = (request as any).user.id;

        const result = await db.query(
            `SELECT 
                u.id, u.username, u.platform,
                f.created_at as friends_since
             FROM friendships f
             JOIN users u ON (
                CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END = u.id
             )
             WHERE (f.requester_id = $1 OR f.addressee_id = $1)
               AND f.status = 'accepted'
             ORDER BY u.username`,
            [userId]
        );

        return {
            friends: result.rows.map(f => ({
                id: f.id,
                username: f.username,
                platform: f.platform,
                friendsSince: f.friends_since,
            })),
        };
    });

    // Get friends leaderboard (this week's scores)
    // Privacy: Returns scores from the last snapshot (every 4 hours) to prevent real-time tracking
    app.get('/leaderboard', { preHandler }, async (request) => {
        const userId = (request as any).user.id;

        // Calculate the current 4-hour window
        const REFRESH_INTERVAL_HOURS = 4;
        const now = new Date();
        const currentHour = now.getUTCHours();
        const windowStart = Math.floor(currentHour / REFRESH_INTERVAL_HOURS) * REFRESH_INTERVAL_HOURS;
        const snapshotTime = new Date(now);
        snapshotTime.setUTCHours(windowStart, 0, 0, 0);

        const nextUpdate = new Date(snapshotTime);
        nextUpdate.setUTCHours(nextUpdate.getUTCHours() + REFRESH_INTERVAL_HOURS);

        // Get current user + all accepted friends with their weekly scores
        const result = await db.query(
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
            )
            SELECT 
                u.id,
                u.username,
                u.platform,
                u.ghost_mode,
                COALESCE(ws.total_points, 0) as total_points,
                COALESCE(ws.streak_count, 0) as streak_count,
                COALESCE(ws.longest_streak, 0) as longest_streak,
                u.id = $1 as is_current_user
            FROM all_users au
            JOIN users u ON u.id = au.user_id
            LEFT JOIN weekly_scores ws ON ws.user_id = u.id 
                AND ws.week_start = date_trunc('week', NOW())
            ORDER BY COALESCE(ws.total_points, 0) DESC, u.username`,
            [userId]
        );

        // Calculate rank - ghost users show as Anonymous (except to themselves)
        const leaderboard = result.rows.map((row, index) => {
            const isGhost = row.ghost_mode && !row.is_current_user;
            return {
                rank: index + 1,
                id: isGhost ? null : row.id,
                username: isGhost ? 'Anonymous' : row.username,
                platform: isGhost ? null : row.platform,
                points: isGhost ? null : Number(row.total_points),
                streakCount: isGhost ? null : row.streak_count,
                longestStreak: isGhost ? null : row.longest_streak,
                isCurrentUser: row.is_current_user,
                isGhost,
            };
        });

        // Find current user's rank
        const currentUserRank = leaderboard.find(u => u.isCurrentUser)?.rank || 0;

        return {
            leaderboard,
            currentUserRank,
            totalFriends: leaderboard.length - 1, // excluding self
            lastUpdated: snapshotTime.toISOString(),
            nextUpdateAt: nextUpdate.toISOString(),
        };
    });

    // Remove a friend
    app.delete('/:id', { preHandler }, async (request, reply) => {
        const { id: friendId } = request.params as { id: string };
        const userId = (request as any).user.id;

        const result = await db.query(
            `DELETE FROM friendships 
             WHERE ((requester_id = $1 AND addressee_id = $2)
                 OR (requester_id = $2 AND addressee_id = $1))
               AND status = 'accepted'
             RETURNING id`,
            [userId, friendId]
        );

        if (result.rowCount === 0) {
            return reply.status(404).send({ error: 'Friend not found' });
        }

        return { message: 'Friend removed' };
    });

    // ============================================
    // BLOCKING
    // ============================================

    // Block a user
    app.post('/block', { preHandler }, async (request, reply) => {
        const { userId: blockedId } = friendRequestSchema.parse(request.body);
        const blockerId = (request as any).user.id;

        if (blockerId === blockedId) {
            return reply.status(400).send({ error: 'Cannot block yourself' });
        }

        // Check for existing relationship
        const existingResult = await db.query(
            `SELECT id FROM friendships 
             WHERE (requester_id = $1 AND addressee_id = $2)
                OR (requester_id = $2 AND addressee_id = $1)`,
            [blockerId, blockedId]
        );

        if (existingResult.rows.length > 0) {
            // Update existing to blocked (blocker becomes requester)
            await db.query(
                `UPDATE friendships 
                 SET status = 'blocked', requester_id = $1, addressee_id = $2, updated_at = NOW()
                 WHERE id = $3`,
                [blockerId, blockedId, existingResult.rows[0].id]
            );
        } else {
            // Create new blocked relationship
            await db.query(
                `INSERT INTO friendships (requester_id, addressee_id, status)
                 VALUES ($1, $2, 'blocked')`,
                [blockerId, blockedId]
            );
        }

        return { message: 'User blocked' };
    });

    // Unblock a user
    app.delete('/block/:id', { preHandler }, async (request, reply) => {
        const { id: blockedId } = request.params as { id: string };
        const blockerId = (request as any).user.id;

        const result = await db.query(
            `DELETE FROM friendships 
             WHERE requester_id = $1 AND addressee_id = $2 AND status = 'blocked'
             RETURNING id`,
            [blockerId, blockedId]
        );

        if (result.rowCount === 0) {
            return reply.status(404).send({ error: 'Blocked user not found' });
        }

        return { message: 'User unblocked' };
    });

    // Get blocked users
    app.get('/blocked', { preHandler }, async (request) => {
        const userId = (request as any).user.id;

        const result = await db.query(
            `SELECT u.id, u.username
             FROM friendships f
             JOIN users u ON f.addressee_id = u.id
             WHERE f.requester_id = $1 AND f.status = 'blocked'
             ORDER BY u.username`,
            [userId]
        );

        return {
            blocked: result.rows,
        };
    });
}
