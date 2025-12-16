const BASE_MULTIPLIER = 10;
const MINIMUM_STREAK_SECONDS = 60;

/**
 * Calculate points for a streak using logarithmic scaling.
 * Longer streaks earn more points, but with diminishing returns.
 * 
 * Examples:
 * - 1 minute: 0 points (minimum not met)
 * - 5 minutes: ~16 points
 * - 30 minutes: ~34 points
 * - 1 hour: ~41 points
 * - 2 hours: ~48 points
 * - 8 hours: ~62 points
 */
export function calculateStreakPoints(
    lockTimestamp: number,
    unlockTimestamp: number
): number {
    const durationSeconds = (unlockTimestamp - lockTimestamp) / 1000;

    if (durationSeconds < MINIMUM_STREAK_SECONDS) {
        return 0;
    }

    const durationMinutes = durationSeconds / 60;
    const points = Math.log(durationMinutes) * BASE_MULTIPLIER;

    return Math.max(0, Math.round(points * 100) / 100);
}

/**
 * Format seconds into human-readable duration
 */
export function formatDuration(seconds: number): string {
    if (seconds < 60) {
        return `${seconds}s`;
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
}
