/**
 * Parse a time from an SMS reply and return a Date for today (Pacific time).
 *
 * Supported formats:
 * - "5:30 PM", "5:30pm", "5:30 pm"
 * - "17:30"
 * - "530", "530pm"
 * - "5 PM", "5pm"
 * - "left at 3:30", "left at 3", "clocked out at 5pm"
 * - "3:30", "3:45" (assumes PM if during business hours)
 * - Just a number: "5" (assumes PM if 1-11)
 *
 * Returns null if unable to parse.
 * The returned Date is in UTC, representing the parsed Pacific time on today's date.
 */

import { getPacificDateParts, createPacificDateTime, toPacificDateString } from './timezone';

export function parseTimeReply(body: string): Date | null {
	// Normalize input
	let text = body.trim().toLowerCase();

	// Ignore yes/y confirmations — handled separately
	if (/^(yes|y|yeah|yep|yup|ok|okay)$/i.test(text)) {
		return null;
	}

	// Strip common prefix phrases
	text = text
		.replace(/^(i\s+)?(left|clocked\s*out|headed\s*out|got\s*off|signed\s*off|out)\s+(at\s+)?/i, '')
		.replace(/^(at\s+)/i, '')
		.trim();

	let hour: number | null = null;
	let minute = 0;
	let meridian: 'am' | 'pm' | null = null;

	// Pattern 1: standard time — "5:30 PM", "5:30pm", "17:30"
	const standardMatch = text.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
	if (standardMatch) {
		hour = parseInt(standardMatch[1], 10);
		minute = parseInt(standardMatch[2], 10);
		meridian = (standardMatch[3] as 'am' | 'pm') || null;
	}

	// Pattern 2: compact time — "530", "530pm", "1730"
	if (hour === null) {
		const compactMatch = text.match(/^(\d{3,4})\s*(am|pm)?$/);
		if (compactMatch) {
			const digits = compactMatch[1];
			if (digits.length === 3) {
				hour = parseInt(digits[0], 10);
				minute = parseInt(digits.slice(1), 10);
			} else {
				hour = parseInt(digits.slice(0, 2), 10);
				minute = parseInt(digits.slice(2), 10);
			}
			meridian = (compactMatch[2] as 'am' | 'pm') || null;
		}
	}

	// Pattern 3: hour with meridian — "5 PM", "5pm"
	if (hour === null) {
		const hourMeridianMatch = text.match(/^(\d{1,2})\s*(am|pm)$/);
		if (hourMeridianMatch) {
			hour = parseInt(hourMeridianMatch[1], 10);
			meridian = hourMeridianMatch[2] as 'am' | 'pm';
		}
	}

	// Pattern 4: bare number — "5" (assume PM if 1-11)
	if (hour === null) {
		const bareMatch = text.match(/^(\d{1,2})$/);
		if (bareMatch) {
			hour = parseInt(bareMatch[1], 10);
			// Only accept bare numbers in the range 1-12
			if (hour < 1 || hour > 12) {
				return null;
			}
			// Assume PM for typical work hours
			if (hour >= 1 && hour <= 11) {
				meridian = 'pm';
			}
		}
	}

	// If nothing matched, give up
	if (hour === null) {
		return null;
	}

	// Validate minute
	if (minute < 0 || minute > 59) {
		return null;
	}

	// Convert to 24-hour format
	if (meridian === 'pm' && hour < 12) {
		hour += 12;
	} else if (meridian === 'am' && hour === 12) {
		hour = 0;
	}

	// If no meridian and hour looks like 24h (13-23), use as-is
	// If no meridian and hour is 1-6, assume PM (business hours heuristic)
	if (meridian === null) {
		if (hour >= 1 && hour <= 6) {
			hour += 12;
		}
		// 7-12 without meridian: could be AM or PM
		// 7-11 during typical work hours, assume PM for afternoon
		// But 7-11 could also be morning — we keep as-is (7:00-11:59)
		// This means "7:30" = 7:30 AM, "1:30" = 1:30 PM
		// 13-23 stays as-is (already 24h)
	}

	// Validate hour
	if (hour < 0 || hour > 23) {
		return null;
	}

	// Build the date for today in Pacific time
	const now = new Date();
	const todayStr = toPacificDateString(now);
	const result = createPacificDateTime(todayStr, hour, minute);

	// Reject times in the future (with 5 min tolerance for clock skew)
	const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
	if (result > fiveMinutesFromNow) {
		return null;
	}

	return result;
}
