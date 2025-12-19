import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { userRoutes } from './routes/users.js';
import { groupRoutes } from './routes/groups.js';
import { friendsRoutes } from './routes/friends.js';
import { adminRoutes } from './routes/admin.js';
import { waitlistRoutes } from './routes/waitlist.js';
import './services/cleanup.service.js'; // Run event cleanup on startup

export async function buildApp() {
    const app = Fastify({
        logger: {
            level: config.NODE_ENV === 'development' ? 'info' : 'warn',
        },
    });

    // Error handler for Zod validation errors
    app.setErrorHandler((error, request, reply) => {
        // Check for ZodError by name (more reliable than instanceof across module versions)
        if (error.name === 'ZodError' || (error as any).issues) {
            const zodError = error as unknown as ZodError;
            return reply.status(400).send({
                error: 'Validation error',
                details: zodError.errors?.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                })) || [],
            });
        }

        // Default error handling
        request.log.error(error);
        return reply.status(error.statusCode || 500).send({
            error: error.message || 'Internal server error',
        });
    });

    // Plugins
    // CORS: configurable via CORS_ORIGINS env (comma-separated), allow all in dev
    let corsOrigin: boolean | string | string[];
    if (config.CORS_ORIGINS) {
        if (config.CORS_ORIGINS === '*') {
            corsOrigin = true; // Allow all
        } else {
            corsOrigin = config.CORS_ORIGINS.split(',').map(o => o.trim());
        }
    } else {
        // Default: allow all in dev, none in production (must be configured)
        corsOrigin = config.NODE_ENV === 'production' ? false : true;
    }

    await app.register(cors, {
        origin: corsOrigin,
        credentials: true,
    });

    // Rate limiting - prevent brute force attacks
    await app.register(rateLimit, {
        max: 100,            // 100 requests per window
        timeWindow: '1 minute',
        // Stricter limits applied per-route in auth.ts
    });

    await app.register(jwt, {
        secret: config.JWT_SECRET,
        sign: {
            expiresIn: config.JWT_EXPIRES_IN,
        },
    });

    // Auth decorator
    app.decorate('authenticate', async (request: any, reply: any) => {
        try {
            await request.jwtVerify();
        } catch (err) {
            reply.status(401).send({ error: 'Unauthorized' });
        }
    });

    // Health check
    app.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

    // Routes
    await app.register(authRoutes, { prefix: '/auth' });
    await app.register(eventRoutes, { prefix: '/events' });
    await app.register(userRoutes, { prefix: '/users' });
    await app.register(groupRoutes, { prefix: '/groups' });
    await app.register(friendsRoutes, { prefix: '/friends' });
    await app.register(adminRoutes, { prefix: '/admin' });
    await app.register(waitlistRoutes, { prefix: '/api/waitlist' });

    return app;
}
