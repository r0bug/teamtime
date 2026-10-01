/**
 * Parse an inbound SMS as a shift-coverage claim or decline.
 *
 * Runs BEFORE the office-manager AI branch in the inbound webhook, so it must
 * be conservative: anything it doesn't clearly recognise returns null and falls
 * through to the existing handling. A false positive here would swallow a
 * manager's ordinary text message to the AI.
 *
 * Accepted shapes (case/punctuation insensitive):
 *   "YES"            "yes!"        "Y"
 *   "YES 4F2K"       "yes, 4f2k"   "take 4F2K"
 *   "NO"             "pass"        "can't"
 *   "4F2K"           (bare code — unambiguous, so treated as a claim)
 */

export interface ClaimReply {
	intent: 'accept' | 'decline';
	/** Normalised 4-char code, or null when the reply was a bare keyword. */
	code: string | null;
}

// Multi-word forms are checked before single words so "i can't" isn't read as
// "i can". Order matters within each list.
const DECLINE_PHRASES = [
	"i can't", 'i cant', 'cannot', "can't", 'cant', 'no thanks', 'no thank you',
	'pass', 'decline', 'nope', 'no', 'n'
];
const ACCEPT_PHRASES = [
	'i can', 'i got it', 'got it', 'i will', 'ill take it', "i'll take it",
	'take it', 'take', 'cover it', 'cover', 'claim', 'yes', 'yep', 'yeah', 'yup', 'y', 'ok', 'okay'
];

// Codes exclude lookalike characters (0/O, 1/I) and MUST contain at least one
// digit. The digit is load-bearing, not cosmetic: without it, four-letter
// keywords like TAKE, PASS, YEAH and CANT are themselves valid codes, and a
// bare "PASS" would parse as a claim for code PASS instead of a decline.
const CODE_CHARS = /^[A-HJ-NP-Z2-9]{4}$/;
const CODE_HAS_DIGIT = /[2-9]/;

function isClaimCode(token: string): boolean {
	return CODE_CHARS.test(token) && CODE_HAS_DIGIT.test(token);
}

function normalise(body: string): string {
	return body
		.trim()
		.toLowerCase()
		// Drop apostrophes outright so contractions collapse to one word
		// ("can't" -> "cant"). Replacing them with a space instead would yield
		// "can t", which no longer matches the decline list.
		.replace(/['\u2019\u02bc]/g, '')
		// remaining punctuation becomes a separator
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Pull a trailing/leading 4-char claim code out of the token list. */
function extractCode(tokens: string[]): { code: string | null; rest: string[] } {
	for (let i = 0; i < tokens.length; i++) {
		const candidate = tokens[i].toUpperCase();
		if (isClaimCode(candidate)) {
			return { code: candidate, rest: [...tokens.slice(0, i), ...tokens.slice(i + 1)] };
		}
	}
	return { code: null, rest: tokens };
}

export function parseClaimReply(body: string): ClaimReply | null {
	const text = normalise(body);
	if (!text) return null;

	const { code, rest } = extractCode(text.split(' '));
	const remainder = rest.join(' ').trim();

	// A bare code with no keyword is unambiguous — treat it as a claim.
	if (code && remainder === '') {
		return { intent: 'accept', code };
	}

	// Decline is checked first: "can't" must not match the "can" in ACCEPT.
	for (const phrase of DECLINE_PHRASES) {
		if (remainder === phrase) return { intent: 'decline', code };
	}
	for (const phrase of ACCEPT_PHRASES) {
		if (remainder === phrase) return { intent: 'accept', code };
	}

	// Anything else (a sentence, an office-manager command, a question) falls
	// through untouched.
	return null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_DIGITS = '23456789';

/**
 * Generate a 4-char claim code. Always contains at least one digit so it can
 * never collide with a reply keyword (see isClaimCode).
 * Caller ensures uniqueness among live requests.
 */
export function generateClaimCode(): string {
	const chars: string[] = [];
	for (let i = 0; i < 4; i++) {
		chars.push(CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]);
	}
	if (!chars.some((c) => CODE_DIGITS.includes(c))) {
		const pos = Math.floor(Math.random() * 4);
		chars[pos] = CODE_DIGITS[Math.floor(Math.random() * CODE_DIGITS.length)];
	}
	return chars.join('');
}
