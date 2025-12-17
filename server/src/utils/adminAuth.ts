import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';

/**
 * Admin authentication middleware
 * Checks that the authenticated user has the 'admin' role
 */
export async function requireAdmin(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const userId = (request as any).user?.id;

    if (!userId) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
    }

    const result = await db.query(
        'SELECT role FROM users WHERE id = $1',
        [userId]
    );

    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
        reply.status(403).send({ error: 'Forbidden: Admin access required' });
        return;
    }
}

/**
 * Log an admin action to the audit log
 */
export async function logAdminAction(
    adminId: string,
    action: string,
    targetType?: string,
    targetId?: string,
    details?: Record<string, any>,
    ipAddress?: string
): Promise<void> {
    await db.query(
        `INSERT INTO audit_log (admin_id, action, target_type, target_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [adminId, action, targetType || null, targetId || null, details ? JSON.stringify(details) : null, ipAddress || null]
    );
}

/**
 * Helper to get client IP from request
 */
export function getClientIp(request: FastifyRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return request.ip || 'unknown';
}

/**
 * Admin preHandler array - combines JWT auth + admin role check
 */
export function adminPreHandler(app: FastifyInstance) {
    return [(app as any).authenticate, requireAdmin];
}
