import { buildApp } from './app.js';
import { config } from './config.js';
import { db } from './db/client.js';

import { scheduleWeeklySummaries } from './services/temptation.service.js';

async function main() {
    // Test database connection
    try {
        await db.query('SELECT 1');
        console.log('✅ Database connected');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }

    const app = await buildApp();

    try {
        await app.listen({ port: config.PORT, host: config.HOST });
        console.log(`🚀 Server running at http://${config.HOST}:${config.PORT}`);

        // Start background schedulers (non-blocking with timeout)
        console.log('📅 Initializing background schedulers...');

        // Don't block server start on scheduler initialization
        const schedulerTimeout = 30000; // 30 second timeout
        Promise.race([
            scheduleWeeklySummaries(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Scheduler initialization timed out')), schedulerTimeout)
            )
        ])
            .then(() => console.log('✅ Background schedulers initialized'))
            .catch(err => console.error('⚠️ Scheduler initialization failed (server still running):', err));

        // Run every hour to catch new users or missed intervals
        setInterval(() => {
            scheduleWeeklySummaries().catch(err =>
                console.error('Failed to run scheduled weekly summaries:', err)
            );
        }, 60 * 60 * 1000);

        console.log('✅ Server fully started');

    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();
