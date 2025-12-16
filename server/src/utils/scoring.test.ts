import { describe, it, expect } from 'vitest';
import { calculateStreakPoints, formatDuration } from '../utils/scoring.js';

describe('Scoring Utils', () => {
    describe('calculateStreakPoints', () => {
        it('returns 0 for streaks under 60 seconds', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 30_000); // 30 seconds
            expect(points).toBe(0);
        });

        it('returns 0 for exactly 60 seconds (minimum not exceeded)', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 60_000); // exactly 60 seconds
            expect(points).toBe(0);
        });

        it('calculates points for 5 minutes', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 5 * 60 * 1000);
            // log(5) * 10 ≈ 16.09
            expect(points).toBeCloseTo(16.09, 1);
        });

        it('calculates points for 30 minutes', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 30 * 60 * 1000);
            // log(30) * 10 ≈ 34.01
            expect(points).toBeCloseTo(34.01, 1);
        });

        it('calculates points for 1 hour', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 60 * 60 * 1000);
            // log(60) * 10 ≈ 40.94
            expect(points).toBeCloseTo(40.94, 1);
        });

        it('calculates points for 8 hours', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 8 * 60 * 60 * 1000);
            // log(480) * 10 ≈ 61.77
            expect(points).toBeCloseTo(61.77, 1);
        });

        it('returns higher points for longer streaks (logarithmic scaling)', () => {
            const base = Date.now();
            const points5min = calculateStreakPoints(base, base + 5 * 60 * 1000);
            const points1hour = calculateStreakPoints(base, base + 60 * 60 * 1000);
            const points8hours = calculateStreakPoints(base, base + 8 * 60 * 60 * 1000);

            expect(points1hour).toBeGreaterThan(points5min);
            expect(points8hours).toBeGreaterThan(points1hour);

            // Verify diminishing returns (logarithmic)
            const ratio1 = points1hour / points5min;
            const ratio2 = points8hours / points1hour;
            expect(ratio1).toBeGreaterThan(ratio2); // First doubling gives more relative gain
        });

        it('handles negative duration gracefully', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp - 1000);
            expect(points).toBe(0);
        });
    });

    describe('formatDuration', () => {
        it('formats seconds only', () => {
            expect(formatDuration(45)).toBe('45s');
        });

        it('formats minutes only', () => {
            expect(formatDuration(120)).toBe('2m');
        });

        it('formats hours and minutes', () => {
            expect(formatDuration(3661)).toBe('1h 1m');
        });

        it('formats exactly 1 hour', () => {
            expect(formatDuration(3600)).toBe('1h 0m');
        });

        it('formats large values', () => {
            expect(formatDuration(36000)).toBe('10h 0m');
        });
    });
});
