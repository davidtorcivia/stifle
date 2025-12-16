import { describe, it, expect } from 'vitest';
import { getWeekStartForTimezone, parseTimeToMinutes, isInQuietHours } from '../utils/time.js';

describe('Time Utils', () => {
    describe('getWeekStartForTimezone', () => {
        it('returns a Monday', () => {
            const weekStart = getWeekStartForTimezone(new Date('2024-12-15'), 'UTC');
            // December 15, 2024 is a Sunday, so week start should be December 9 (Monday)
            expect(weekStart.getUTCDay()).toBe(1); // Monday = 1
        });

        it('handles different timezones', () => {
            // Same moment in time, different timezones should give consistent results
            const date = new Date('2024-12-15T12:00:00Z');
            const utcWeekStart = getWeekStartForTimezone(date, 'UTC');
            const nyWeekStart = getWeekStartForTimezone(date, 'America/New_York');

            // Both should be Mondays
            expect(utcWeekStart.getUTCDay()).toBe(1);
            // NY might have a different Monday depending on local time
        });

        it('handles week boundary (Monday)', () => {
            // Monday December 16, 2024
            const monday = new Date('2024-12-16T10:00:00Z');
            const weekStart = getWeekStartForTimezone(monday, 'UTC');

            // Should be the same Monday
            expect(weekStart.getUTCDate()).toBe(16);
        });

        it('handles week boundary (Sunday)', () => {
            // Sunday December 15, 2024
            const sunday = new Date('2024-12-15T10:00:00Z');
            const weekStart = getWeekStartForTimezone(sunday, 'UTC');

            // Should be the previous Monday (December 9)
            expect(weekStart.getUTCDate()).toBe(9);
        });
    });

    describe('parseTimeToMinutes', () => {
        it('parses midnight', () => {
            expect(parseTimeToMinutes('00:00')).toBe(0);
        });

        it('parses noon', () => {
            expect(parseTimeToMinutes('12:00')).toBe(720);
        });

        it('parses end of day', () => {
            expect(parseTimeToMinutes('23:59')).toBe(1439);
        });

        it('parses arbitrary time', () => {
            expect(parseTimeToMinutes('14:30')).toBe(870);
        });
    });

    describe('isInQuietHours', () => {
        it('returns false when quiet hours not set', () => {
            const now = new Date('2024-12-15T23:00:00Z');
            expect(isInQuietHours(now, null, null, 'UTC')).toBe(false);
        });

        it('returns true during normal quiet hours', () => {
            const now = new Date('2024-12-15T23:30:00Z');
            expect(isInQuietHours(now, '22:00', '07:00', 'UTC')).toBe(true);
        });

        it('returns false outside quiet hours', () => {
            const now = new Date('2024-12-15T14:00:00Z');
            expect(isInQuietHours(now, '22:00', '07:00', 'UTC')).toBe(false);
        });

        it('handles overnight quiet hours (before midnight)', () => {
            const now = new Date('2024-12-15T23:00:00Z');
            expect(isInQuietHours(now, '22:00', '07:00', 'UTC')).toBe(true);
        });

        it('handles overnight quiet hours (after midnight)', () => {
            const now = new Date('2024-12-15T05:00:00Z');
            expect(isInQuietHours(now, '22:00', '07:00', 'UTC')).toBe(true);
        });

        it('returns false at boundary end time', () => {
            const now = new Date('2024-12-15T07:00:00Z');
            expect(isInQuietHours(now, '22:00', '07:00', 'UTC')).toBe(false);
        });
    });
});
