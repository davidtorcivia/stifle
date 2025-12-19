import { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { z } from 'zod';

const waitlistSchema = z.object({
    email: z.string().email(),
});

export async function waitlistRoutes(app: FastifyInstance) {
    // Add email to waitlist
    app.post('/', async (request, reply) => {
        const { email } = waitlistSchema.parse(request.body);

        const normalizedEmail = email.toLowerCase().trim();

        try {
            // Try to insert, ignore if already exists
            const result = await db.query(
                `INSERT INTO waitlist (email, created_at) 
                 VALUES ($1, NOW()) 
                 ON CONFLICT (email) DO NOTHING
                 RETURNING id`,
                [normalizedEmail]
            );

            if (result.rowCount === 0) {
                return reply.status(200).send({
                    message: 'Already on the list',
                    alreadyExists: true
                });
            }

            return { message: 'Added to waitlist', success: true };
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to join waitlist' });
        }
    });

    // Get waitlist count (public, for social proof)
    app.get('/count', async () => {
        const result = await db.query('SELECT COUNT(*) FROM waitlist');
        return { count: parseInt(result.rows[0].count, 10) };
    });
}
