/**
 * Centralized timezone utilities for TeamTime
 *
 * All business operations use Pacific timezone (America/Los_Angeles)
 * Server runs in UTC, so all date operations must be timezone-aware
 */

const PACIFIC_TZ = 'America/Los_Angeles';

/**
 * Get Pacific timezone offset in hours (accounts for DST)
 * PST = -8, PDT = -7
 */
export function getPacificOffset(date: Date): number {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: PACIFIC_TZ,
		timeZoneName: 'short'
	});
	const parts = formatter.formatToParts(date);
	const tzName = parts.find(p => p.type === 'timeZoneName')?.value;
	return tzName === 'PDT' ? -7 : -8;
}

/**
 * Parse a datetime-local string as Pacific time and return UTC Date
 * Input: "2024-12-15T09:00" (from datetime-local input)
 * Output: Date object in UTC representing that Pacific time
 */
export function parsePacificDatetime(datetimeLocal: string): Date {
	const [datePart, timePart] = datetimeLocal.split('T');
	const [year, month, day] = datePart.split('-').map(Number);
	const [hour, minute] = timePart.split(':').map(Number);

	// Create a temp date to determine if DST is in effect
	const tempDate = new Date(year, month - 1, day, hour, minute);
	const pacificOffset = getPacificOffset(tempDate);

	// Create UTC date by adding the Pacific offset (subtracting negative offset)
	return new Date(Date.UTC(year, month - 1, day, hour - pacificOffset, minute));
}

/**
 * Parse a date string (YYYY-MM-DD) as Pacific midnight and return UTC Date
 */
export function parsePacificDate(dateStr: string): Date {
	return parsePacificDatetime(`${dateStr}T00:00`);
}

/**
 * Parse a date string as Pacific end of day (23:59:59) and return UTC Date
 */
export function parsePacificEndOfDay(dateStr: string): Date {
	const [year, month, day] = dateStr.split('-').map(Number);
	const tempDate = new Date(year, month - 1, day, 23, 59);
	const pacificOffset = getPacificOffset(tempDate);
	return new Date(Date.UTC(year, month - 1, day, 23 - pacificOffset, 59, 59, 999));
}

/**
 * Get the current date/time parts in Pacific timezone
 */
export function getPacificDateParts(date: Date = new Date()): {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
	weekday: number;
} {
	const options: Intl.DateTimeFormatOptions = {
		timeZone: PACIFIC_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		weekday: 'short',
		hour12: false
	};
	const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
	const get = (type: string) => parts.find(p => p.type === type)?.value || '0';

	// Map weekday names to numbers (Sun=0, Mon=1, etc)
	const weekdayMap: { [key: string]: number } = {
		'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
	};

	return {
		year: parseInt(get('year')),
		month: parseInt(get('month')),
		day: parseInt(get('day')),
		hour: parseInt(get('hour')),
		minute: parseInt(get('minute')),
		second: parseInt(get('second')),
		weekday: weekdayMap[get('weekday')] ?? 0
	};
}

/**
 * Get Pacific hour (0-23) from a UTC date
 */
export function getPacificHour(date: Date = new Date()): number {
	return getPacificDateParts(date).hour;
}

/**
 * Get Pacific day of week (0=Sun, 1=Mon, etc) from a UTC date
 */
export function getPacificWeekday(date: Date = new Date()): number {
	return getPacificDateParts(date).weekday;
}

/**
 * Get start of day in Pacific (as UTC Date)
 */
export function getPacificStartOfDay(date: Date = new Date()): Date {
	const parts = getPacificDateParts(date);
	return parsePacificDatetime(
		`${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T00:00`
	);
}

/**
 * Get end of day in Pacific (as UTC Date, 23:59:59.999)
 */
export function getPacificEndOfDay(date: Date = new Date()): Date {
	const parts = getPacificDateParts(date);
	const dateStr = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
	return parsePacificEndOfDay(dateStr);
}

/**
 * Get start and end of day in Pacific (as UTC Dates)
 */
export function getPacificDayBounds(date: Date = new Date()): { start: Date; end: Date } {
	return {
		start: getPacificStartOfDay(date),
		end: getPacificEndOfDay(date)
	};
}

/**
 * Get start of week (Sunday) in Pacific (as UTC Date)
 */
export function getPacificWeekStart(date: Date = new Date()): Date {
	const parts = getPacificDateParts(date);
	// Calculate days to subtract to get to Sunday
	const daysToSubtract = parts.weekday;

	// Create a new date adjusted back to Sunday
	const year = parts.year;
	const month = parts.month;
	const day = parts.day - daysToSubtract;

	// Handle month/year boundaries
	const tempDate = new Date(year, month - 1, day);
	const adjustedParts = getPacificDateParts(tempDate);

	return parsePacificDatetime(
		`${adjustedParts.year}-${String(adjustedParts.month).padStart(2, '0')}-${String(adjustedParts.day).padStart(2, '0')}T00:00`
	);
}

/**
 * Format a UTC date for datetime-local input in Pacific timezone
 * Output: "2024-12-15T09:00" format
 */
export function toPacificDatetimeLocal(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	const options: Intl.DateTimeFormatOptions = {
		timeZone: PACIFIC_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	};
	const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(d);
	const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
	return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Format a UTC date to Pacific date string (YYYY-MM-DD)
 */
export function toPacificDateString(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	const options: Intl.DateTimeFormatOptions = {
		timeZone: PACIFIC_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	};
	const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(d);
	const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
	return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Format a UTC date to a readable Pacific time string
 * Output: "9:00 AM" format
 */
export function toPacificTimeString(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleTimeString('en-US', {
		timeZone: PACIFIC_TZ,
		hour: 'numeric',
		minute: '2-digit'
	});
}

/**
 * Format a UTC date to a readable Pacific date and time string
 * Output: "Dec 15, 2024, 9:00 AM" format
 */
export function toPacificDateTimeString(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleString('en-US', {
		timeZone: PACIFIC_TZ,
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/**
 * Check if two dates are the same day in Pacific timezone
 */
export function isSamePacificDay(date1: Date, date2: Date): boolean {
	return toPacificDateString(date1) === toPacificDateString(date2);
}

/**
 * Check if a date is today in Pacific timezone
 */
export function isPacificToday(date: Date): boolean {
	return isSamePacificDay(date, new Date());
}

/**
 * Create a Date object for a specific Pacific time on a given date
 * @param dateStr Date string in YYYY-MM-DD format
 * @param hour Hour in 24-hour format (0-23)
 * @param minute Minute (0-59)
 */
export function createPacificDateTime(dateStr: string, hour: number, minute: number = 0): Date {
	const [year, month, day] = dateStr.split('-').map(Number);
	const tempDate = new Date(year, month - 1, day, hour, minute);
	const pacificOffset = getPacificOffset(tempDate);
	return new Date(Date.UTC(year, month - 1, day, hour - pacificOffset, minute));
}

/**
 * Get Pacific timezone name for display
 */
export function getPacificTimezoneName(): string {
	const now = new Date();
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: PACIFIC_TZ,
		timeZoneName: 'short'
	});
	const parts = formatter.formatToParts(now);
	return parts.find(p => p.type === 'timeZoneName')?.value || 'PT';
}
