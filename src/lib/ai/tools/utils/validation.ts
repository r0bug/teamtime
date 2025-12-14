/**
 * AI Tool Validation Utilities
 *
 * Shared validation functions for AI tools to ensure proper parameter formats
 * before they hit the database.
 */

/**
 * Validates that a string is a valid UUID v4 format.
 * Returns false for null, undefined, "null", "undefined", or invalid formats.
 *
 * @param str - The string to validate
 * @returns true if valid UUID format, false otherwise
 */
export function isValidUUID(str: string | undefined | null): boolean {
	if (!str) return false;

	// Reject common string representations of null/undefined
	const lowerStr = str.toLowerCase().trim();
	if (lowerStr === 'null' || lowerStr === 'undefined' || lowerStr === 'none' || lowerStr === '') {
		return false;
	}

	// Standard UUID v4 regex pattern
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(str);
}

/**
 * Validates a user ID parameter and returns a helpful error message if invalid.
 * Use this in tool validate() functions to catch bad IDs before database queries.
 *
 * @param userId - The user ID to validate
 * @param paramName - The parameter name for error messages (default: "userId")
 * @returns { valid: true } or { valid: false, error: string }
 */
export function validateUserId(
	userId: string | undefined | null,
	paramName = 'userId'
): { valid: true } | { valid: false; error: string } {
	if (!userId) {
		return { valid: true }; // Allow undefined/null (optional field)
	}

	if (!isValidUUID(userId)) {
		// Check if it looks like a name (contains letters only or spaces)
		const looksLikeName = /^[a-zA-Z\s]+$/.test(userId);
		if (looksLikeName) {
			return {
				valid: false,
				error: `Invalid ${paramName}: "${userId}" appears to be a name, not a user ID. Use get_available_staff to look up user IDs by name.`
			};
		}

		return {
			valid: false,
			error: `Invalid ${paramName} format: "${userId}". Expected a UUID like "abc12345-1234-1234-1234-123456789abc".`
		};
	}

	return { valid: true };
}

/**
 * Validates a required user ID parameter (must be present and valid UUID).
 *
 * @param userId - The user ID to validate
 * @param paramName - The parameter name for error messages
 * @returns { valid: true } or { valid: false, error: string }
 */
export function validateRequiredUserId(
	userId: string | undefined | null,
	paramName = 'userId'
): { valid: true } | { valid: false; error: string } {
	if (!userId) {
		return {
			valid: false,
			error: `${paramName} is required. Use get_available_staff to look up user IDs.`
		};
	}

	return validateUserId(userId, paramName);
}

/**
 * Validates an array of user IDs.
 *
 * @param userIds - Array of user IDs to validate
 * @param paramName - The parameter name for error messages
 * @returns { valid: true } or { valid: false, error: string }
 */
export function validateUserIdArray(
	userIds: string[] | undefined | null,
	paramName = 'userIds'
): { valid: true } | { valid: false; error: string } {
	if (!userIds || userIds.length === 0) {
		return { valid: true }; // Allow empty array
	}

	for (let i = 0; i < userIds.length; i++) {
		const result = validateUserId(userIds[i], `${paramName}[${i}]`);
		if (!result.valid) {
			return result;
		}
	}

	return { valid: true };
}

/**
 * Validates a location ID (same format as user ID - UUID).
 *
 * @param locationId - The location ID to validate
 * @returns { valid: true } or { valid: false, error: string }
 */
export function validateLocationId(
	locationId: string | undefined | null
): { valid: true } | { valid: false; error: string } {
	if (!locationId) {
		return { valid: true }; // Allow undefined/null
	}

	if (!isValidUUID(locationId)) {
		return {
			valid: false,
			error: `Invalid locationId format: "${locationId}". Expected a UUID.`
		};
	}

	return { valid: true };
}
