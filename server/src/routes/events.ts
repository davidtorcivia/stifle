import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { updateWeeklyScore } from '../services/score.service.js';

const syncRequestSchema = z.object({
    events: z.array(z.object({
        id: z.string().uuid(),
        eventType: z.enum(['lock', 'unlock']),
        timestamp: z.number(),
        source: z.string(),
    })),
    lastSync: z.number(),
    clientTime: z.number(),
});

export async function eventRoutes(app: FastifyInstance) {
    // Sync events from device
    app.post('/sync', {
        preHandler: [(app as any).authenticate],
    }, async (request, reply) => {
        const userId = (request as any).user.id;
        const body = syncRequestSchema.parse(request.body);
        const now = Date.now();
        const confirmed: { clientId: string; serverId: string }[] = [];

        // Process each event
        for (const event of body.events) {
            // Reject events > 7 days old
            const maxAge = 7 * 24 * 60 * 60 * 1000;
            if (event.timestamp < now - maxAge) {
                console.log(`Rejecting old event from user ${userId}`, event.id);
                continue;
            }

            // Normalize future timestamps (clock drift)
            let timestamp = event.timestamp;
            if (timestamp > now + 60_000) {
                console.log(`Normalizing future timestamp from user ${userId}`, event.id);
                timestamp = now;
            }

            try {
                const result = await db.query(
                    `INSERT INTO events (user_id, client_id, event_type, timestamp, source)
           VALUES ($1, $2, $3, to_timestamp($4::double precision / 1000), $5)
           ON CONFLICT (user_id, client_id) DO NOTHING
           RETURNING id`,
                    [userId, event.id, event.eventType, timestamp, event.source]
                );

                if (result.rows.length > 0) {
                    confirmed.push({
                        clientId: event.id,
                        serverId: result.rows[0].id,
                    });
                }
            } catch (error) {
                console.error('Error inserting event:', error);
            }
        }

        // Fetch events the client hasn't seen (for multi-device, but we limit to one now)
        const newEventsResult = await db.query(
            `SELECT id, event_type, EXTRACT(EPOCH FROM timestamp) * 1000 as timestamp, source
       FROM events
       WHERE user_id = $1
         AND created_at > to_timestamp($2::double precision / 1000)
         AND client_id NOT IN (SELECT unnest($3::uuid[]))
       ORDER BY timestamp ASC
       LIMIT 100`,
            [userId, body.lastSync, body.events.map(e => e.id)]
        );

        // Queue score recalculation if we confirmed new events
        if (confirmed.length > 0) {
            // For now, calculate synchronously (can move to BullMQ later)
            try {
                await updateWeeklyScore(userId);
            } catch (error) {
                console.error('Error updating weekly score:', error);
            }
        }

        return {
            confirmed,
            newEvents: newEventsResult.rows.map(row => ({
                id: row.id,
                eventType: row.event_type,
                timestamp: Number(row.timestamp),
                source: row.source,
            })),
            serverTime: now,
        };
    });

    // Get current streak info
    app.get('/current', {
        preHandler: [(app as any).authenticate],
    }, async (request) => {
        const userId = (request as any).user.id;

        // Get the last event
        const lastEventResult = await db.query(
            `SELECT event_type, EXTRACT(EPOCH FROM timestamp) * 1000 as timestamp
       FROM events
       WHERE user_id = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
            [userId]
        );

        if (lastEventResult.rows.length === 0) {
            return { inStreak: false, streakStartedAt: null, currentStreakSeconds: 0 };
        }

        const lastEvent = lastEventResult.rows[0];
        const isLocked = lastEvent.event_type === 'lock';

        if (!isLocked) {
            return { inStreak: false, streakStartedAt: null, currentStreakSeconds: 0 };
        }

        const streakStartedAt = Number(lastEvent.timestamp);
        const currentStreakSeconds = Math.floor((Date.now() - streakStartedAt) / 1000);

        return {
            inStreak: true,
            streakStartedAt,
            currentStreakSeconds,
        };
    });
}
