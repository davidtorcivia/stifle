import { db } from '../db/client.js';

/**
 * Event Cleanup Service
 * 
 * Deletes raw event data older than 14 days to protect user privacy.
 * Weekly scores are preserved for historical tracking.
 * 
 * This should be run periodically (e.g., daily via cron or on server startup).
 */

const RETENTION_DAYS = 14;

export async function cleanupOldEvents(): Promise<{ deleted: number }> {
    console.log(`🧹 Cleaning up events older than ${RETENTION_DAYS} days...`);

    const result = await db.query(
        `DELETE FROM events 
         WHERE timestamp < NOW() - INTERVAL '${RETENTION_DAYS} days'
         RETURNING id`
    );

    const deleted = result.rowCount || 0;

    if (deleted > 0) {
        console.log(`🗑️  Deleted ${deleted} old events`);
    } else {
        console.log(`✅ No old events to clean up`);
    }

    return { deleted };
}

// Run cleanup on module load (server startup)
// This is a simple approach - for production, consider a proper cron job
cleanupOldEvents().catch(err => {
    console.error('Event cleanup failed:', err);
});
