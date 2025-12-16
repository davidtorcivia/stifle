/**
 * Get the start of the week (Monday 00:00:00) for a given date and timezone.
 * 
 * @param date - The date to find the week start for
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns Date object representing Monday 00:00:00 in the given timezone
 */
export function getWeekStartForTimezone(date: Date, timezone: string): Date {
    // Format the date in the user's timezone to get local day/time
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
    });

    const parts = formatter.formatToParts(date);
    const weekday = parts.find(p => p.type === 'weekday')?.value;
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '2024');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '1');

    // Map weekday to offset from Monday
    const weekdayMap: Record<string, number> = {
        'Mon': 0,
        'Tue': 1,
        'Wed': 2,
        'Thu': 3,
        'Fri': 4,
        'Sat': 5,
        'Sun': 6,
    };

    const offset = weekdayMap[weekday || 'Mon'] || 0;

    // Create date for Monday in UTC, then adjust
    const monday = new Date(Date.UTC(year, month, day - offset, 0, 0, 0, 0));

    return monday;
}

/**
 * Parse a time string (HH:MM) into minutes since midnight
 */
export function parseTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Check if current time is within quiet hours
 */
export function isInQuietHours(
    now: Date,
    quietStart: string | null,
    quietEnd: string | null,
    timezone: string
): boolean {
    if (!quietStart || !quietEnd) {
        return false;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    const currentTime = formatter.format(now);
    const currentMinutes = parseTimeToMinutes(currentTime);
    const startMinutes = parseTimeToMinutes(quietStart);
    const endMinutes = parseTimeToMinutes(quietEnd);

    // Handle overnight quiet hours (e.g., 22:00 to 07:00)
    if (startMinutes > endMinutes) {
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
