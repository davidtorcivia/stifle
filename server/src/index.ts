import { buildApp } from './app.js';
import { config } from './config.js';
import { db } from './db/client.js';

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
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();
