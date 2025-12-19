import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../db/redis.js';
import { db } from '../db/client.js';
import { sendTemptationNotification, sendWeeklySummaryNotification } from './push.service.js';
import { isInQuietHours } from '../utils/time.js';
import { getWeekStartForTimezone } from '../utils/time.js';

/**
 * Temptation Job Scheduler
 * 
 * Manages background jobs for:
 * - Scheduled temptation reminders
 * - Weekly summary notifications
 * - Streak milestone celebrations
 * 
 * Philosophy:
 * - Respects quiet hours (no notifications during sleep)
 * - Randomized timing to feel natural, not robotic
 * - Frequency based on user preferences
 */

const TEMPTATION_QUEUE = 'temptation';
const WEEKLY_QUEUE = 'weekly';

// Create queues
export const temptationQueue = new Queue(TEMPTATION_QUEUE, {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,       // Keep last 50 failed jobs
    },
});

export const weeklyQueue = new Queue(WEEKLY_QUEUE, {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
    },
});

/**
 * Schedule a temptation notification for a user
 * 
 * Timing is randomized within the configured window to feel natural.
 */
export async function scheduleTemptationForUser(userId: string): Promise<void> {
    // Get user settings
    const settingsResult = await db.query(
        `SELECT ts.*, u.timezone
         FROM temptation_settings ts
         JOIN users u ON u.id = ts.user_id
         WHERE ts.user_id = $1`,
        [userId]
    );

    if (settingsResult.rows.length === 0) return;

    const settings = settingsResult.rows[0];

    // Skip if disabled
    if (!settings.enabled) return;

    // Calculate next notification time
    // Base interval is configured, but we add randomness to feel natural
    const baseIntervalMinutes = settings.frequency_minutes || 120; // Default 2 hours
    const randomFactor = 0.5 + Math.random(); // 0.5x to 1.5x
    const delayMinutes = Math.round(baseIntervalMinutes * randomFactor);
    const delayMs = delayMinutes * 60 * 1000;

    // Schedule the job
    await temptationQueue.add(
        'send-temptation',
        {
            userId,
            quietStart: settings.quiet_hours_start,
            quietEnd: settings.quiet_hours_end,
            timezone: settings.timezone,
        },
        {
            delay: delayMs,
            jobId: `temptation-${userId}`, // Only one pending per user
        }
    );
}

/**
 * Schedule weekly summary jobs for all active users
 * 
 * Called at the start of each week (Monday 9am in each timezone)
 */
export async function scheduleWeeklySummaries(): Promise<void> {
    console.log('  → Querying users for weekly scheduling...');

    // Get all users with their timezones
    const usersResult = await db.query(
        `SELECT id, timezone FROM users WHERE tracking_status = 'verified'`
    );

    console.log(`  → Found ${usersResult.rows.length} verified users`);

    let scheduled = 0;
    for (const user of usersResult.rows) {
        // Calculate when Monday 9am is in their timezone
        const now = new Date();
        const weekStart = getWeekStartForTimezone(now, user.timezone);
        const targetTime = new Date(weekStart);
        targetTime.setHours(9, 0, 0, 0); // 9am Monday

        // If it's already past, schedule for next week
        let delay = targetTime.getTime() - now.getTime();
        let targetWeekStart = weekStart;

        if (delay < 0) {
            delay += 7 * 24 * 60 * 60 * 1000; // Add a week
            // Ensure we use the correct week ID for the FUTURE job
            const nextWeek = new Date(weekStart);
            nextWeek.setDate(nextWeek.getDate() + 7);
            targetWeekStart = nextWeek;
        }

        const weekId = targetWeekStart.toISOString().split('T')[0];

        try {
            await weeklyQueue.add(
                'send-weekly-summary',
                { userId: user.id },
                {
                    delay,
                    jobId: `weekly-${user.id}-${weekId}`,
                }
            );
            scheduled++;
        } catch (err) {
            console.error(`  ✗ Failed to schedule for user ${user.id}:`, err);
        }
    }

    console.log(`  → Scheduled ${scheduled}/${usersResult.rows.length} weekly summary jobs`);
}

// ============================================================================
// WORKERS
// ============================================================================

/**
 * Temptation notification worker
 */
export const temptationWorker = new Worker(
    TEMPTATION_QUEUE,
    async (job: Job) => {
        const { userId, quietStart, quietEnd, timezone } = job.data;

        // Check quiet hours
        const now = new Date();
        if (isInQuietHours(now, quietStart, quietEnd, timezone)) {
            // Reschedule for after quiet hours end
            // For now, just skip - they'll get caught up later
            return { skipped: true, reason: 'quiet_hours' };
        }

        // Send the notification
        const sent = await sendTemptationNotification(userId);

        // Schedule the next one
        await scheduleTemptationForUser(userId);

        return { sent };
    },
    { connection: redis }
);

/**
 * Weekly summary worker
 */
export const weeklyWorker = new Worker(
    WEEKLY_QUEUE,
    async (job: Job) => {
        const { userId } = job.data;

        // Get user's weekly stats and best group ranking
        const statsResult = await db.query(
            `SELECT 
                ws.total_points,
                g.name as group_name,
                (
                    SELECT COUNT(*) + 1
                    FROM weekly_scores ws2
                    JOIN group_members gm2 ON gm2.user_id = ws2.user_id
                    WHERE gm2.group_id = gm.group_id
                    AND ws2.week_start = ws.week_start
                    AND ws2.total_points > ws.total_points
                ) as rank
             FROM weekly_scores ws
             LEFT JOIN group_members gm ON gm.user_id = ws.user_id
             LEFT JOIN groups g ON g.id = gm.group_id
             WHERE ws.user_id = $1
             AND ws.week_start = (
                 SELECT MAX(week_start) FROM weekly_scores WHERE user_id = $1
             )
             ORDER BY ws.total_points DESC
             LIMIT 1`,
            [userId]
        );

        if (statsResult.rows.length === 0) {
            return { sent: false, reason: 'no_stats' };
        }

        const { total_points, group_name, rank } = statsResult.rows[0];

        const sent = await sendWeeklySummaryNotification(
            userId,
            total_points,
            parseInt(rank),
            group_name
        );

        return { sent };
    },
    { connection: redis }
);

// Error handlers
temptationWorker.on('failed', (job, err) => {
    console.error(`Temptation job ${job?.id} failed:`, err);
});

weeklyWorker.on('failed', (job, err) => {
    console.error(`Weekly job ${job?.id} failed:`, err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    await temptationWorker.close();
    await weeklyWorker.close();
});
