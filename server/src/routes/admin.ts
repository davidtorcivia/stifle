import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { adminPreHandler, logAdminAction, getClientIp } from '../utils/adminAuth.js';
import crypto from 'crypto';

// Schema definitions
const paginationSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});

const userSearchSchema = z.object({
    search: z.string().optional(),
    role: z.enum(['user', 'admin', 'all']).default('all'),
    trackingStatus: z.enum(['pending', 'verified', 'broken', 'all']).default('all'),
}).merge(paginationSchema);

const updateUserSchema = z.object({
    role: z.enum(['user', 'admin']).optional(),
    trackingStatus: z.enum(['pending', 'verified', 'broken']).optional(),
    username: z.string().min(3).max(30).optional(),
    email: z.string().email().optional(),
});

const createInviteSchema = z.object({
    count: z.number().min(1).max(50).default(5),
    expiresInDays: z.number().min(1).max(365).default(90),
});

const updateSettingsSchema = z.object({
    smtp: z.object({
        host: z.string(),
        port: z.number(),
        user: z.string(),
        pass: z.string(),
        from: z.string().email(),
        enabled: z.boolean(),
    }).optional(),
    backup: z.object({
        autoEnabled: z.boolean(),
        keepLast: z.number().min(1).max(100),
        scheduleHour: z.number().min(0).max(23),
    }).optional(),
    app: z.object({
        registrationOpen: z.boolean(),
        maintenanceMode: z.boolean(),
    }).optional(),
});

export async function adminRoutes(app: FastifyInstance) {
    const preHandler = adminPreHandler(app);

    // ============================================
    // DASHBOARD
    // ============================================

    app.get('/dashboard', { preHandler }, async (request) => {
        // Total users
        const usersResult = await db.query('SELECT COUNT(*) as count FROM users');
        const totalUsers = parseInt(usersResult.rows[0].count);

        // Active users (synced in last 7 days)
        const activeResult = await db.query(`
            SELECT COUNT(DISTINCT user_id) as count FROM events
            WHERE created_at >= NOW() - INTERVAL '7 days'
        `);
        const activeUsers = parseInt(activeResult.rows[0].count);

        // Events today
        const eventsResult = await db.query(`
            SELECT COUNT(*) as count FROM events
            WHERE created_at >= date_trunc('day', NOW())
        `);
        const eventsToday = parseInt(eventsResult.rows[0].count);

        // Total groups
        const groupsResult = await db.query('SELECT COUNT(*) as count FROM groups');
        const totalGroups = parseInt(groupsResult.rows[0].count);

        // Pending invites
        const invitesResult = await db.query(`
            SELECT COUNT(*) as count FROM invite_codes
            WHERE used_by IS NULL AND expires_at > NOW()
        `);
        const pendingInvites = parseInt(invitesResult.rows[0].count);

        // Users by platform
        const platformResult = await db.query(`
            SELECT platform, COUNT(*) as count FROM users GROUP BY platform
        `);
        const usersByPlatform = Object.fromEntries(
            platformResult.rows.map(r => [r.platform, parseInt(r.count)])
        );

        // Recent signups (last 7 days)
        const signupsResult = await db.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM users
            WHERE created_at >= NOW() - INTERVAL '7 days'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);
        const recentSignups = signupsResult.rows;

        // Scoring statistics
        // Total points all time
        const totalPointsResult = await db.query(`
            SELECT COALESCE(SUM(total_points), 0) as total FROM weekly_scores
        `);
        const totalPointsAllTime = Number(totalPointsResult.rows[0].total);

        // Points this week
        const weekPointsResult = await db.query(`
            SELECT COALESCE(SUM(total_points), 0) as total FROM weekly_scores
            WHERE week_start = date_trunc('week', NOW())
        `);
        const pointsThisWeek = Number(weekPointsResult.rows[0].total);

        // Points per day (last 7 days) - derived from weekly scores by day
        const pointsPerDayResult = await db.query(`
            SELECT DATE(ws.calculated_at) as date, SUM(ws.total_points) as total
            FROM weekly_scores ws
            WHERE ws.calculated_at >= NOW() - INTERVAL '7 days'
            GROUP BY DATE(ws.calculated_at)
            ORDER BY date DESC
        `);
        const pointsPerDay = pointsPerDayResult.rows.map(r => ({
            date: r.date,
            points: Number(r.total),
        }));

        // Users by tracking status
        const trackingStatusResult = await db.query(`
            SELECT tracking_status, COUNT(*) as count FROM users GROUP BY tracking_status
        `);
        const usersByTrackingStatus = Object.fromEntries(
            trackingStatusResult.rows.map(r => [r.tracking_status, parseInt(r.count)])
        );

        return {
            totalUsers,
            activeUsers,
            eventsToday,
            totalGroups,
            pendingInvites,
            usersByPlatform,
            usersByTrackingStatus,
            recentSignups,
            scoring: {
                totalPointsAllTime,
                pointsThisWeek,
                pointsPerDay,
            },
        };
    });

    // ============================================
    // USER MANAGEMENT
    // ============================================

    // List users with pagination and filters
    app.get('/users', { preHandler }, async (request) => {
        const query = userSearchSchema.parse(request.query);
        const offset = (query.page - 1) * query.limit;

        let whereClause = 'WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;

        if (query.search) {
            whereClause += ` AND (username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
            params.push(`%${query.search}%`);
            paramIndex++;
        }

        if (query.role !== 'all') {
            whereClause += ` AND role = $${paramIndex}`;
            params.push(query.role);
            paramIndex++;
        }

        if (query.trackingStatus !== 'all') {
            whereClause += ` AND tracking_status = $${paramIndex}`;
            params.push(query.trackingStatus);
            paramIndex++;
        }

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) as count FROM users ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get users
        params.push(query.limit, offset);
        const usersResult = await db.query(
            `SELECT id, username, email, role, platform, tracking_status, created_at
             FROM users ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            params
        );

        return {
            users: usersResult.rows.map(u => ({
                id: u.id,
                username: u.username,
                email: u.email,
                role: u.role,
                platform: u.platform,
                trackingStatus: u.tracking_status,
                createdAt: u.created_at,
            })),
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        };
    });

    // Get single user details
    app.get('/users/:id', { preHandler }, async (request, reply) => {
        const { id } = request.params as { id: string };

        const userResult = await db.query(
            `SELECT id, username, email, role, platform, tracking_status, timezone, device_id, created_at
             FROM users WHERE id = $1`,
            [id]
        );

        if (userResult.rows.length === 0) {
            return reply.status(404).send({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // Get user's groups
        const groupsResult = await db.query(
            `SELECT g.id, g.name, gm.role, gm.joined_at
             FROM groups g
             JOIN group_members gm ON g.id = gm.group_id
             WHERE gm.user_id = $1`,
            [id]
        );

        // Get user's weekly score
        const scoreResult = await db.query(
            `SELECT total_points, streak_count FROM weekly_scores
             WHERE user_id = $1 ORDER BY week_start DESC LIMIT 1`,
            [id]
        );

        // Get event count
        const eventCountResult = await db.query(
            'SELECT COUNT(*) as count FROM events WHERE user_id = $1',
            [id]
        );

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            platform: user.platform,
            trackingStatus: user.tracking_status,
            timezone: user.timezone,
            deviceId: user.device_id,
            createdAt: user.created_at,
            groups: groupsResult.rows,
            currentWeekScore: scoreResult.rows[0] || { total_points: 0, streak_count: 0 },
            totalEvents: parseInt(eventCountResult.rows[0].count),
        };
    });

    // Update user
    app.put('/users/:id', { preHandler }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = updateUserSchema.parse(request.body);
        const adminId = (request as any).user.id;

        // Get target user info
        const targetUser = await db.query(
            'SELECT role, created_at FROM users WHERE id = $1',
            [id]
        );

        if (targetUser.rows.length === 0) {
            return reply.status(404).send({ error: 'User not found' });
        }

        const targetRole = targetUser.rows[0].role;
        const targetCreatedAt = targetUser.rows[0].created_at;

        // Get admin user info
        const adminUser = await db.query(
            'SELECT created_at FROM users WHERE id = $1',
            [adminId]
        );
        const adminCreatedAt = adminUser.rows[0].created_at;

        // Don't allow admin to demote themselves
        if (body.role === 'user' && id === adminId) {
            return reply.status(400).send({ error: 'Cannot demote yourself' });
        }

        // Don't allow editing other admins (unless you're an earlier admin)
        if (targetRole === 'admin' && id !== adminId) {
            if (new Date(adminCreatedAt) >= new Date(targetCreatedAt)) {
                return reply.status(403).send({ error: 'Cannot modify an admin who joined before you' });
            }
        }

        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (body.role) {
            updates.push(`role = $${paramIndex++}`);
            values.push(body.role);
        }
        if (body.trackingStatus) {
            updates.push(`tracking_status = $${paramIndex++}`);
            values.push(body.trackingStatus);
        }
        if (body.username) {
            updates.push(`username = $${paramIndex++}`);
            values.push(body.username);
        }
        if (body.email) {
            // Check if email is taken
            const existing = await db.query(
                'SELECT id FROM users WHERE email = $1 AND id != $2',
                [body.email, id]
            );
            if (existing.rows.length > 0) {
                return reply.status(409).send({ error: 'Email already taken' });
            }
            updates.push(`email = $${paramIndex++}`);
            values.push(body.email);
        }

        if (updates.length === 0) {
            return { success: true };
        }

        values.push(id);
        await db.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
        );

        await logAdminAction(adminId, 'user.update', 'user', id, body, getClientIp(request));

        return { success: true };
    });

    // Delete user
    app.delete('/users/:id', { preHandler }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const adminId = (request as any).user.id;

        // Don't allow admin to delete themselves
        if (id === adminId) {
            return reply.status(400).send({ error: 'Cannot delete yourself' });
        }

        // Get user info before deletion for audit log and hierarchy check
        const userResult = await db.query(
            'SELECT username, email, role, created_at FROM users WHERE id = $1',
            [id]
        );

        if (userResult.rows.length === 0) {
            return reply.status(404).send({ error: 'User not found' });
        }

        const targetUser = userResult.rows[0];

        // If target is admin, check hierarchy - only earlier admins can delete later admins
        if (targetUser.role === 'admin') {
            const adminUser = await db.query(
                'SELECT created_at FROM users WHERE id = $1',
                [adminId]
            );
            const adminCreatedAt = adminUser.rows[0].created_at;

            if (new Date(adminCreatedAt) >= new Date(targetUser.created_at)) {
                return reply.status(403).send({ error: 'Cannot delete an admin who joined before you' });
            }
        }

        // Delete user (cascades to related tables)
        await db.query('DELETE FROM users WHERE id = $1', [id]);

        await logAdminAction(adminId, 'user.delete', 'user', id, {
            username: targetUser.username,
            email: targetUser.email,
        }, getClientIp(request));

        return { success: true };
    });

    // Create user (admin can create without invite code)
    const createUserSchema = z.object({
        username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
        email: z.string().email(),
        password: z.string().min(8),
        platform: z.enum(['ios', 'android']),
        role: z.enum(['user', 'admin']).default('user'),
    });

    app.post('/users', { preHandler }, async (request, reply) => {
        const body = createUserSchema.parse(request.body);
        const adminId = (request as any).user.id;

        // Check if user exists
        const existingUser = await db.query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [body.email, body.username]
        );

        if (existingUser.rows.length > 0) {
            return reply.status(409).send({ error: 'Email or username already taken' });
        }

        // Hash password
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(body.password, salt, 64).toString('hex');
        const passwordHash = `${salt}:${hash}`;

        // Create user
        const userResult = await db.query(
            `INSERT INTO users (username, email, password_hash, platform, role, tracking_status)
             VALUES ($1, $2, $3, $4, $5, 'pending')
             RETURNING id`,
            [body.username, body.email, passwordHash, body.platform, body.role]
        );

        const userId = userResult.rows[0].id;

        // Create default temptation settings
        await db.query(
            'INSERT INTO temptation_settings (user_id) VALUES ($1)',
            [userId]
        );

        await logAdminAction(adminId, 'user.create', 'user', userId, {
            username: body.username,
            email: body.email,
            role: body.role,
        }, getClientIp(request));

        return { success: true, id: userId };
    });

    // Reset user password
    const resetPasswordSchema = z.object({
        password: z.string().min(8),
    });

    app.post('/users/:id/reset-password', { preHandler }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = resetPasswordSchema.parse(request.body);
        const adminId = (request as any).user.id;

        // Check user exists
        const userResult = await db.query(
            'SELECT username FROM users WHERE id = $1',
            [id]
        );

        if (userResult.rows.length === 0) {
            return reply.status(404).send({ error: 'User not found' });
        }

        // Hash new password
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(body.password, salt, 64).toString('hex');
        const passwordHash = `${salt}:${hash}`;

        // Update password
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [passwordHash, id]
        );

        // Revoke all refresh tokens (force re-login)
        await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);

        await logAdminAction(adminId, 'user.reset_password', 'user', id, {
            username: userResult.rows[0].username,
        }, getClientIp(request));

        return { success: true };
    });

    // ============================================
    // INVITE CODE MANAGEMENT
    // ============================================

    // List all invite codes
    app.get('/invites', { preHandler }, async (request) => {
        const query = paginationSchema.parse(request.query);
        const offset = (query.page - 1) * query.limit;

        const countResult = await db.query('SELECT COUNT(*) as count FROM invite_codes');
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(
            `SELECT ic.code, ic.expires_at, ic.created_at, ic.used_by,
                    creator.username as creator_username,
                    used.username as used_by_username
             FROM invite_codes ic
             JOIN users creator ON ic.creator_id = creator.id
             LEFT JOIN users used ON ic.used_by = used.id
             ORDER BY ic.created_at DESC
             LIMIT $1 OFFSET $2`,
            [query.limit, offset]
        );

        return {
            invites: result.rows.map(r => ({
                code: r.code,
                creatorUsername: r.creator_username,
                usedByUsername: r.used_by_username,
                isUsed: !!r.used_by,
                isExpired: new Date(r.expires_at) < new Date(),
                expiresAt: r.expires_at,
                createdAt: r.created_at,
            })),
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        };
    });

    // Create invite codes
    app.post('/invites', { preHandler }, async (request) => {
        const body = createInviteSchema.parse(request.body);
        const adminId = (request as any).user.id;

        const codes: string[] = [];
        for (let i = 0; i < body.count; i++) {
            const code = crypto.randomBytes(6).toString('hex').toUpperCase();
            await db.query(
                `INSERT INTO invite_codes (code, creator_id, expires_at)
                 VALUES ($1, $2, NOW() + INTERVAL '${body.expiresInDays} days')`,
                [code, adminId]
            );
            codes.push(code);
        }

        await logAdminAction(adminId, 'invites.create', 'invite_codes', undefined, {
            count: body.count,
            expiresInDays: body.expiresInDays,
        }, getClientIp(request));

        return { codes };
    });

    // Revoke invite code
    app.delete('/invites/:code', { preHandler }, async (request, reply) => {
        const { code } = request.params as { code: string };
        const adminId = (request as any).user.id;

        const result = await db.query(
            'DELETE FROM invite_codes WHERE code = $1 AND used_by IS NULL RETURNING code',
            [code]
        );

        if (result.rowCount === 0) {
            return reply.status(404).send({ error: 'Invite code not found or already used' });
        }

        await logAdminAction(adminId, 'invites.revoke', 'invite_codes', undefined, { code }, getClientIp(request));

        return { success: true };
    });

    // ============================================
    // GROUP MANAGEMENT
    // ============================================

    app.get('/groups', { preHandler }, async (request) => {
        const query = paginationSchema.parse(request.query);
        const offset = (query.page - 1) * query.limit;

        const countResult = await db.query('SELECT COUNT(*) as count FROM groups');
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(
            `SELECT g.id, g.name, g.description, g.is_private, g.invite_code, g.created_at,
                    u.username as creator_username,
                    COUNT(gm.user_id) as member_count
             FROM groups g
             JOIN users u ON g.creator_id = u.id
             LEFT JOIN group_members gm ON g.id = gm.group_id
             GROUP BY g.id, u.username
             ORDER BY g.created_at DESC
             LIMIT $1 OFFSET $2`,
            [query.limit, offset]
        );

        return {
            groups: result.rows.map(r => ({
                id: r.id,
                name: r.name,
                description: r.description,
                isPrivate: r.is_private,
                inviteCode: r.invite_code,
                creatorUsername: r.creator_username,
                memberCount: parseInt(r.member_count),
                createdAt: r.created_at,
            })),
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        };
    });

    app.delete('/groups/:id', { preHandler }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const adminId = (request as any).user.id;

        const groupResult = await db.query(
            'SELECT name FROM groups WHERE id = $1',
            [id]
        );

        if (groupResult.rows.length === 0) {
            return reply.status(404).send({ error: 'Group not found' });
        }

        await db.query('DELETE FROM groups WHERE id = $1', [id]);

        await logAdminAction(adminId, 'group.delete', 'group', id, {
            name: groupResult.rows[0].name,
        }, getClientIp(request));

        return { success: true };
    });

    // ============================================
    // APP SETTINGS
    // ============================================

    app.get('/settings', { preHandler }, async () => {
        const result = await db.query('SELECT key, value FROM app_settings');

        const settings: Record<string, any> = {};
        for (const row of result.rows) {
            settings[row.key] = row.value;
        }

        return settings;
    });

    app.put('/settings', { preHandler }, async (request) => {
        const body = updateSettingsSchema.parse(request.body);
        const adminId = (request as any).user.id;

        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined) {
                await db.query(
                    `INSERT INTO app_settings (key, value, updated_at)
                     VALUES ($1, $2, NOW())
                     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
                    [key, JSON.stringify(value)]
                );
            }
        }

        await logAdminAction(adminId, 'settings.update', 'app_settings', undefined, body, getClientIp(request));

        return { success: true };
    });

    // ============================================
    // AUDIT LOG
    // ============================================

    app.get('/audit-log', { preHandler }, async (request) => {
        const query = paginationSchema.parse(request.query);
        const offset = (query.page - 1) * query.limit;

        const countResult = await db.query('SELECT COUNT(*) as count FROM audit_log');
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(
            `SELECT al.id, al.action, al.target_type, al.target_id, al.details, al.ip_address, al.created_at,
                    u.username as admin_username
             FROM audit_log al
             JOIN users u ON al.admin_id = u.id
             ORDER BY al.created_at DESC
             LIMIT $1 OFFSET $2`,
            [query.limit, offset]
        );

        return {
            entries: result.rows.map(r => ({
                id: r.id,
                action: r.action,
                targetType: r.target_type,
                targetId: r.target_id,
                details: r.details,
                ipAddress: r.ip_address,
                adminUsername: r.admin_username,
                createdAt: r.created_at,
            })),
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        };
    });

    // ============================================
    // BACKUPS (Placeholder - full implementation needs pg_dump)
    // ============================================

    app.get('/backups', { preHandler }, async (request) => {
        const query = paginationSchema.parse(request.query);
        const offset = (query.page - 1) * query.limit;

        const countResult = await db.query('SELECT COUNT(*) as count FROM backups');
        const total = parseInt(countResult.rows[0].count);

        const result = await db.query(
            `SELECT id, filename, size_bytes, type, status, created_at, completed_at
             FROM backups
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [query.limit, offset]
        );

        return {
            backups: result.rows.map(r => ({
                id: r.id,
                filename: r.filename,
                sizeBytes: parseInt(r.size_bytes),
                type: r.type,
                status: r.status,
                createdAt: r.created_at,
                completedAt: r.completed_at,
            })),
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        };
    });

    app.post('/backups', { preHandler }, async (request) => {
        const adminId = (request as any).user.id;
        const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql.gz`;

        // Create backup record (actual backup logic would be async via BullMQ)
        const result = await db.query(
            `INSERT INTO backups (filename, type, created_by)
             VALUES ($1, 'manual', $2)
             RETURNING id`,
            [filename, adminId]
        );

        await logAdminAction(adminId, 'backup.create', 'backup', result.rows[0].id, {
            filename,
        }, getClientIp(request));

        // TODO: Queue actual pg_dump job via BullMQ
        // For now, just mark as completed (placeholder)
        await db.query(
            `UPDATE backups SET status = 'completed', completed_at = NOW() WHERE id = $1`,
            [result.rows[0].id]
        );

        return {
            id: result.rows[0].id,
            filename,
            message: 'Backup initiated',
        };
    });

    app.delete('/backups/:id', { preHandler }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const adminId = (request as any).user.id;

        const result = await db.query(
            'DELETE FROM backups WHERE id = $1 RETURNING filename',
            [id]
        );

        if (result.rowCount === 0) {
            return reply.status(404).send({ error: 'Backup not found' });
        }

        // TODO: Also delete actual file from disk

        await logAdminAction(adminId, 'backup.delete', 'backup', id, {
            filename: result.rows[0].filename,
        }, getClientIp(request));

        return { success: true };
    });
}
