import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import crypto from 'crypto';
import { getWeekStartForTimezone } from '../utils/time.js';

const createGroupSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    isPrivate: z.boolean().default(false),
});

export async function groupRoutes(app: FastifyInstance) {
    // Create a group
    app.post('/', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;
        const body = createGroupSchema.parse(request.body);

        const inviteCode = body.isPrivate
            ? crypto.randomBytes(4).toString('hex').toUpperCase()
            : null;

        const result = await db.query(
            `INSERT INTO groups (name, description, creator_id, is_private, invite_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, is_private, invite_code, created_at`,
            [body.name, body.description || null, userId, body.isPrivate, inviteCode]
        );

        const group = result.rows[0];

        // Add creator as owner
        await db.query(
            `INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
            [group.id, userId]
        );

        return {
            id: group.id,
            name: group.name,
            description: group.description,
            isPrivate: group.is_private,
            inviteCode: group.invite_code,
            createdAt: group.created_at,
        };
    });

    // Get user's groups
    app.get('/', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;

        const result = await db.query(
            `SELECT g.id, g.name, g.description, g.is_private, g.invite_code, g.created_at,
              gm.role, gm.joined_at,
              (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
       FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = $1
       ORDER BY gm.joined_at DESC`,
            [userId]
        );

        return result.rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            isPrivate: row.is_private,
            inviteCode: row.invite_code,
            createdAt: row.created_at,
            role: row.role,
            joinedAt: row.joined_at,
            memberCount: parseInt(row.member_count),
        }));
    });

    // Get group details
    app.get('/:id', {
        preHandler: [(app as any).authenticate],
    }, async (request, reply) => {
        const userId = (request as any).user.id;
        const { id } = request.params as { id: string };

        // Check membership
        const memberResult = await db.query(
            'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
            [id, userId]
        );

        if (memberResult.rows.length === 0) {
            return reply.status(403).send({ error: 'Not a member of this group' });
        }

        const groupResult = await db.query(
            `SELECT g.*, u.username as creator_username,
              (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
       FROM groups g
       JOIN users u ON u.id = g.creator_id
       WHERE g.id = $1`,
            [id]
        );

        if (groupResult.rows.length === 0) {
            return reply.status(404).send({ error: 'Group not found' });
        }

        const group = groupResult.rows[0];

        return {
            id: group.id,
            name: group.name,
            description: group.description,
            isPrivate: group.is_private,
            inviteCode: group.invite_code,
            createdAt: group.created_at,
            creator: group.creator_username,
            memberCount: parseInt(group.member_count),
            yourRole: memberResult.rows[0].role,
        };
    });

    // Join a group (by invite code)
    app.post('/join', {
        preHandler: [(app as any).authenticate],
    }, async (request, reply) => {
        const userId = (request as any).user.id;
        const { code } = request.body as { code: string };

        const groupResult = await db.query(
            'SELECT id, name, max_members FROM groups WHERE invite_code = $1',
            [code.toUpperCase()]
        );

        if (groupResult.rows.length === 0) {
            return reply.status(404).send({ error: 'Invalid invite code' });
        }

        const group = groupResult.rows[0];

        // Check if already member
        const existingMember = await db.query(
            'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
            [group.id, userId]
        );

        if (existingMember.rows.length > 0) {
            return reply.status(400).send({ error: 'Already a member' });
        }

        // Check member count
        const countResult = await db.query(
            'SELECT COUNT(*) as count FROM group_members WHERE group_id = $1',
            [group.id]
        );

        if (parseInt(countResult.rows[0].count) >= group.max_members) {
            return reply.status(400).send({ error: 'Group is full' });
        }

        await db.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
            [group.id, userId]
        );

        return { success: true, groupId: group.id, groupName: group.name };
    });

    // Leave a group
    app.delete('/:id/leave', {
        preHandler: [(app as any).authenticate],
    }, async (request, reply) => {
        const userId = (request as any).user.id;
        const { id } = request.params as { id: string };

        // Check if owner (can't leave if owner)
        const memberResult = await db.query(
            'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2',
            [id, userId]
        );

        if (memberResult.rows.length === 0) {
            return reply.status(400).send({ error: 'Not a member' });
        }

        if (memberResult.rows[0].role === 'owner') {
            return reply.status(400).send({ error: 'Owner cannot leave. Transfer ownership or delete the group.' });
        }

        await db.query(
            'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
            [id, userId]
        );

        return { success: true };
    });

    // Get group leaderboard
    // Privacy: Returns scores from the last snapshot (every 4 hours) to prevent real-time tracking
    app.get('/:id/leaderboard', {
        preHandler: [(app as any).authenticate],
    }, async (request, reply) => {
        const userId = (request as any).user.id;
        const { id } = request.params as { id: string };

        // Calculate the current 4-hour window
        const REFRESH_INTERVAL_HOURS = 4;
        const now = new Date();
        const currentHour = now.getUTCHours();
        const windowStart = Math.floor(currentHour / REFRESH_INTERVAL_HOURS) * REFRESH_INTERVAL_HOURS;
        const snapshotTime = new Date(now);
        snapshotTime.setUTCHours(windowStart, 0, 0, 0);

        const nextUpdate = new Date(snapshotTime);
        nextUpdate.setUTCHours(nextUpdate.getUTCHours() + REFRESH_INTERVAL_HOURS);

        // Verify membership
        const memberResult = await db.query(
            'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
            [id, userId]
        );

        if (memberResult.rows.length === 0) {
            return reply.status(403).send({ error: 'Not a member of this group' });
        }

        // Get week start (using Monday as start)
        const weekStart = getWeekStartForTimezone(new Date(), 'UTC');

        const result = await db.query(
            `SELECT
        u.id as user_id,
        u.username,
        u.tracking_status,
        COALESCE(ws.total_points, 0) as total_points,
        COALESCE(ws.streak_count, 0) as streak_count,
        COALESCE(ws.longest_streak, 0) as longest_streak
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      LEFT JOIN weekly_scores ws ON ws.user_id = u.id AND ws.week_start = $2
      WHERE gm.group_id = $1
      ORDER BY total_points DESC, longest_streak DESC`,
            [id, weekStart]
        );

        return {
            leaderboard: result.rows.map((row, index) => ({
                rank: index + 1,
                userId: row.user_id,
                username: row.username,
                trackingStatus: row.tracking_status,
                totalPoints: Number(row.total_points),
                streakCount: row.streak_count,
                longestStreak: row.longest_streak,
                isYou: row.user_id === userId,
            })),
            lastUpdated: snapshotTime.toISOString(),
            nextUpdateAt: nextUpdate.toISOString(),
        };
    });
}
