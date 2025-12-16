import { db } from '../db/client.js';
import { calculateStreakPoints } from '../utils/scoring.js';
import { getWeekStartForTimezone } from '../utils/time.js';

interface WeeklyScore {
    totalPoints: number;
    streakCount: number;
    longestStreak: number;
}

export async function calculateWeeklyScore(
    userId: string,
    weekStart: Date
): Promise<WeeklyScore> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get all unlock events in this week with their preceding lock events
    const eventsResult = await db.query(
        `WITH week_unlocks AS (
      SELECT id, EXTRACT(EPOCH FROM timestamp) * 1000 as timestamp
      FROM events
      WHERE user_id = $1
        AND event_type = 'unlock'
        AND timestamp >= $2
        AND timestamp < $3
      ORDER BY timestamp ASC
    ),
    preceding_locks AS (
      SELECT DISTINCT ON (u.id)
        u.id as unlock_id,
        u.timestamp as unlock_timestamp,
        EXTRACT(EPOCH FROM l.timestamp) * 1000 as lock_timestamp
      FROM week_unlocks u
      LEFT JOIN events l ON l.user_id = $1
        AND l.event_type = 'lock'
        AND l.timestamp < to_timestamp(u.timestamp / 1000)
      ORDER BY u.id, l.timestamp DESC
    )
    SELECT unlock_id, unlock_timestamp, lock_timestamp
    FROM preceding_locks
    WHERE lock_timestamp IS NOT NULL`,
        [userId, weekStart, weekEnd]
    );

    let totalPoints = 0;
    let streakCount = 0;
    let longestStreak = 0;

    for (const row of eventsResult.rows) {
        const lockTimestamp = Number(row.lock_timestamp);
        const unlockTimestamp = Number(row.unlock_timestamp);

        const points = calculateStreakPoints(lockTimestamp, unlockTimestamp);

        if (points > 0) {
            totalPoints += points;
            streakCount++;

            const duration = (unlockTimestamp - lockTimestamp) / 1000;
            longestStreak = Math.max(longestStreak, duration);
        }
    }

    return {
        totalPoints: Math.round(totalPoints * 100) / 100,
        streakCount,
        longestStreak: Math.round(longestStreak),
    };
}

export async function updateWeeklyScore(userId: string): Promise<void> {
    // Get user's timezone
    const userResult = await db.query(
        'SELECT timezone FROM users WHERE id = $1',
        [userId]
    );
    const timezone = userResult.rows[0]?.timezone || 'UTC';

    const weekStart = getWeekStartForTimezone(new Date(), timezone);
    const score = await calculateWeeklyScore(userId, weekStart);

    await db.query(
        `INSERT INTO weekly_scores (user_id, week_start, total_points, streak_count, longest_streak, calculated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, week_start) DO UPDATE SET
       total_points = $3,
       streak_count = $4,
       longest_streak = $5,
       calculated_at = NOW()`,
        [userId, weekStart, score.totalPoints, score.streakCount, score.longestStreak]
    );
}
