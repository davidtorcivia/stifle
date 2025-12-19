/**
 * Calculate points for a streak using "Points Density" scaling.
 * 
 * CORE PROBLEM SOLVED:
 * Old log/linear math meant 12 x 5min > 1 x 60min. This encouraged gaming.
 * 
 * NEW LOGIC: Super-linear growth up to 4 hours.
 * The "points per minute" increases as the streak gets longer.
 * Result: The whole is greater than the sum of its parts.
 * 1 hour (60pts) >>> 2 x 30min (24pts + 24pts = 48pts).
 * 
 * Curve:
 * - 0-10 min: 0 points (minimum threshold)
 * - 10-60 min: Ramp up from 0.5 to 1.0 pts/min
 * - 1-4 hours: Ramp up from 1.0 to 1.5 pts/min
 * - 4+ hours: Soft cap (logarithmic growth after 4h base)
 * 
 * Approximate Values:
 * - 10 min: 5 pts
 * - 20 min: 13 pts 
 * - 30 min: 24 pts
 * - 60 min: 60 pts  (1 pt/min)
 * - 2 hours: 150 pts (1.25 pts/min)
 * - 3 hours: 250 pts (1.38 pts/min)
 * - 4 hours: 360 pts (1.5 pts/min) -- PEAK EFFICIENCY
 * - 8 hours: ~420 pts (Sleep counts, but active focus is king)
 */
export function calculateStreakPoints(
    lockTimestamp: number,
    unlockTimestamp: number
): number {
    const durationSeconds = (unlockTimestamp - lockTimestamp) / 1000;
    const durationMinutes = durationSeconds / 60;

    // 1. Minimum Threshold: 10 minutes
    // Real focus takes time. 5 mins is just a bathroom break.
    if (durationMinutes < 10) {
        return 0;
    }

    let points = 0;

    // 2. Super-Linear Growth (10m - 4h)
    // Multiplier ramps up based on duration.
    if (durationMinutes <= 240) {
        // Calculate efficiency multiplier: 
        // Starts at 0.5x at 0m, reaches 1.5x at 4h (240m)
        // Formula: 0.5 + (minutes / 240)

        // However, we want 1h to be exactly 1.0x (60pts)
        // Let's use a dual-slope ramp:
        // 0-60m: 0.5x -> 1.0x
        // 60-240m: 1.0x -> 1.5x

        let multiplier;
        if (durationMinutes <= 60) {
            // Map 0-60 to 0.5-1.0
            multiplier = 0.5 + (durationMinutes / 60) * 0.5;
        } else {
            // Map 60-240 to 1.0-1.5
            const progress = (durationMinutes - 60) / 180;
            multiplier = 1.0 + (progress * 0.5);
        }

        points = durationMinutes * multiplier;
    }
    // 3. Soft Cap (4h+)
    else {
        // Base: 4 hours at peak efficiency (1.5x) = 360 pts
        const basePoints = 240 * 1.5;

        // Excess time gets diminishing returns (logarithmic)
        // We want 8h (480m) to be ~420 pts (+60 pts for 4 extra hours)
        // Sleep should be "okay" but not "winning strategy"
        const excessMinutes = durationMinutes - 240;
        const extraPoints = Math.log(excessMinutes + 1) * 15;

        points = basePoints + extraPoints;
    }

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

