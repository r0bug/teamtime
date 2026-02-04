/**
 * HTML Sanitization Utilities
 *
 * Provides XSS protection for user-generated content.
 * Server-side sanitization to ensure malicious content is never stored.
 */

// Characters that need HTML entity encoding
const htmlEntities: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#x27;',
	'/': '&#x2F;',
	'`': '&#x60;',
	'=': '&#x3D;'
};

// Regex patterns for common XSS vectors
const xssPatterns = [
	// Script tags and event handlers
	/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
	/javascript:/gi,
	/vbscript:/gi,
	/on\w+\s*=/gi,
	// Data URIs with script content
	/data:(?:text\/html|application\/javascript)/gi,
	// Expression() for older IE
	/expression\s*\(/gi,
	// SVG event handlers
	/<svg[^>]*onload/gi,
	// Embedded objects
	/<embed\b/gi,
	/<object\b/gi,
	/<iframe\b/gi,
	// Form hijacking
	/<form\b/gi,
	// Meta refresh
	/<meta[^>]*http-equiv/gi
];

/**
 * Escape HTML entities to prevent XSS
 * @param str Input string
 * @returns HTML-escaped string safe for rendering
 */
export function escapeHtml(str: string): string {
	if (!str || typeof str !== 'string') return '';
	return str.replace(/[&<>"'`=/]/g, (char) => htmlEntities[char] || char);
}

/**
 * Strip HTML tags entirely from a string
 * @param str Input string potentially containing HTML
 * @returns Plain text with all tags removed
 */
export function stripHtml(str: string): string {
	if (!str || typeof str !== 'string') return '';
	return str.replace(/<[^>]*>/g, '');
}

/**
 * Remove potentially dangerous XSS vectors while preserving safe content
 * More permissive than escapeHtml - allows some formatting but removes dangerous patterns
 * @param str Input string
 * @returns Sanitized string with XSS vectors removed
 */
export function sanitizeXss(str: string): string {
	if (!str || typeof str !== 'string') return '';

	let result = str;

	// Remove null bytes
	result = result.replace(/\0/g, '');

	// Remove each XSS pattern
	for (const pattern of xssPatterns) {
		result = result.replace(pattern, '');
	}

	// Remove any remaining potentially dangerous attributes
	// This catches things like onclick, onerror, etc. that might have been missed
	result = result.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
	result = result.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');

	return result;
}

/**
 * Sanitize user input for safe storage and display
 * This is the primary function to use for most user-generated content
 * @param str Input string from user
 * @param options Sanitization options
 * @returns Sanitized string
 */
export function sanitizeUserInput(
	str: string,
	options: {
		maxLength?: number;
		allowNewlines?: boolean;
		stripHtml?: boolean;
		trim?: boolean;
	} = {}
): string {
	const { maxLength = 10000, allowNewlines = true, stripHtml: shouldStripHtml = false, trim = true } = options;

	if (!str || typeof str !== 'string') return '';

	let result = str;

	// Trim whitespace
	if (trim) {
		result = result.trim();
	}

	// Strip HTML if requested, otherwise sanitize for XSS
	if (shouldStripHtml) {
		result = stripHtml(result);
	} else {
		result = sanitizeXss(result);
	}

	// Handle newlines
	if (!allowNewlines) {
		result = result.replace(/[\r\n]+/g, ' ');
	}

	// Truncate to max length
	if (result.length > maxLength) {
		result = result.slice(0, maxLength);
	}

	return result;
}

/**
 * Sanitize a message body for the messaging system
 * Allows basic formatting but removes dangerous content
 */
export function sanitizeMessage(body: string): string {
	return sanitizeUserInput(body, {
		maxLength: 50000,
		allowNewlines: true,
		stripHtml: false
	});
}

/**
 * Sanitize a task title or short description
 * More restrictive - strips all HTML
 */
export function sanitizeTitle(title: string): string {
	return sanitizeUserInput(title, {
		maxLength: 500,
		allowNewlines: false,
		stripHtml: true
	});
}

/**
 * Sanitize a task or item description
 * Allows some formatting but sanitizes XSS
 */
export function sanitizeDescription(description: string): string {
	return sanitizeUserInput(description, {
		maxLength: 10000,
		allowNewlines: true,
		stripHtml: false
	});
}

/**
 * Sanitize a username or display name
 * Very restrictive - alphanumeric, spaces, and common punctuation only
 */
export function sanitizeName(name: string): string {
	if (!name || typeof name !== 'string') return '';

	return name
		.trim()
		.replace(/[<>'"&;]/g, '') // Remove dangerous chars
		.replace(/\s+/g, ' ') // Normalize whitespace
		.slice(0, 100);
}

/**
 * Sanitize an email address
 * Basic validation and normalization
 */
export function sanitizeEmail(email: string): string {
	if (!email || typeof email !== 'string') return '';

	return email.trim().toLowerCase().replace(/[<>'"&;]/g, '').slice(0, 254);
}

/**
 * Sanitize a URL to prevent javascript: and data: URI attacks
 */
export function sanitizeUrl(url: string): string {
	if (!url || typeof url !== 'string') return '';

	const trimmed = url.trim();

	// Check for dangerous protocols
	const lowerUrl = trimmed.toLowerCase();
	if (
		lowerUrl.startsWith('javascript:') ||
		lowerUrl.startsWith('vbscript:') ||
		lowerUrl.startsWith('data:text/html') ||
		lowerUrl.startsWith('data:application/javascript')
	) {
		return '';
	}

	// Allow http, https, mailto, tel, and relative URLs
	if (
		lowerUrl.startsWith('http://') ||
		lowerUrl.startsWith('https://') ||
		lowerUrl.startsWith('mailto:') ||
		lowerUrl.startsWith('tel:') ||
		lowerUrl.startsWith('/') ||
		!lowerUrl.includes(':')
	) {
		return trimmed.slice(0, 2048);
	}

	return '';
}

/**
 * Validate and sanitize JSON to prevent prototype pollution
 */
export function sanitizeJson<T extends Record<string, unknown>>(obj: T): T {
	const dangerous = ['__proto__', 'constructor', 'prototype'];

	function clean(value: unknown): unknown {
		if (value === null || value === undefined) return value;
		if (typeof value !== 'object') return value;

		if (Array.isArray(value)) {
			return value.map(clean);
		}

		const result: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
			if (!dangerous.includes(key)) {
				result[key] = clean(val);
			}
		}
		return result;
	}

	return clean(obj) as T;
}
