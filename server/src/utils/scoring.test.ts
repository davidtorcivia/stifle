import { describe, it, expect } from 'vitest';
import { calculateStreakPoints, formatDuration } from '../utils/scoring.js';

/**
 * Scoring Tests - Updated for "Points Density" formula
 * 
 * The new formula uses super-linear growth to reward longer streaks:
 * - 0-10 min: 0 points (minimum threshold)
 * - 10-60 min: 0.5x to 1.0x multiplier ramp
 * - 60-240 min: 1.0x to 1.5x multiplier ramp  
 * - 240+ min: Soft cap with logarithmic growth
 * 
 * Key values:
 * - 10 min: ~5 pts
 * - 30 min: ~24 pts
 * - 60 min: ~60 pts (1 pt/min)
 * - 2 hours: ~150 pts
 * - 4 hours: ~360 pts (peak efficiency)
 * - 8 hours: ~420 pts
 */
describe('Scoring Utils', () => {
    describe('calculateStreakPoints', () => {
        it('returns 0 for streaks under 10 minutes (minimum threshold)', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 5 * 60 * 1000); // 5 minutes
            expect(points).toBe(0);
        });

        it('returns 0 for exactly 5 minutes (below 10min threshold)', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 5 * 60 * 1000);
            expect(points).toBe(0);
        });

        it('calculates points for 10 minutes (threshold)', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 10 * 60 * 1000);
            // 10 minutes at ~0.58x multiplier = ~5.8 pts
            expect(points).toBeGreaterThan(5);
            expect(points).toBeLessThan(7);
        });

        it('calculates points for 30 minutes', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 30 * 60 * 1000);
            // 30 minutes at ~0.75x multiplier = ~22.5 pts
            expect(points).toBeGreaterThan(20);
            expect(points).toBeLessThan(28);
        });

        it('calculates points for 1 hour (baseline)', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 60 * 60 * 1000);
            // 60 minutes at 1.0x multiplier = 60 pts
            expect(points).toBe(60);
        });

        it('calculates points for 2 hours', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 2 * 60 * 60 * 1000);
            // 120 minutes at ~1.17x multiplier = ~140 pts
            expect(points).toBeGreaterThan(135);
            expect(points).toBeLessThan(155);
        });

        it('calculates points for 4 hours (peak efficiency)', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 4 * 60 * 60 * 1000);
            // 240 minutes at 1.5x multiplier = 360 pts
            expect(points).toBe(360);
        });

        it('calculates points for 8 hours (soft cap region)', () => {
            const timestamp = Date.now();
            const points = calculateStreakPoints(timestamp, timestamp + 8 * 60 * 60 * 1000);
            // 360 base + log(240+1) * 15 ≈ 360 + 82.3 = ~442 pts
            expect(points).toBeGreaterThan(435);
            expect(points).toBeLessThan(450);
        });

        it('returns higher points for longer streaks (super-linear scaling)', () => {
            const base = Date.now();
            const points30min = calculateStreakPoints(base, base + 30 * 60 * 1000);
            const points1hour = calculateStreakPoints(base, base + 60 * 60 * 1000);
            const points4hours = calculateStreakPoints(base, base + 4 * 60 * 60 * 1000);

            expect(points1hour).toBeGreaterThan(points30min);
            expect(points4hours).toBeGreaterThan(points1hour);
        });

        it('verifies 1 hour > 2x30min (anti-gaming)', () => {
            const base = Date.now();
            const points30min = calculateStreakPoints(base, base + 30 * 60 * 1000);
            const points1hour = calculateStreakPoints(base, base + 60 * 60 * 1000);

            // Key design goal: 1 hour should be worth MORE than 2 x 30min
            expect(points1hour).toBeGreaterThan(points30min * 2);
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
