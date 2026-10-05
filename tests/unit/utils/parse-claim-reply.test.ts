import { describe, it, expect } from 'vitest';
import { parseClaimReply, generateClaimCode } from '$lib/server/utils/parse-claim-reply';

describe('parseClaimReply', () => {
	describe('accepts', () => {
		it.each(['YES', 'yes', 'Yes!', 'y', 'Y', 'yep', 'yeah', 'ok', 'OK'])(
			'treats %s as a bare accept',
			(body) => {
				expect(parseClaimReply(body)).toEqual({ intent: 'accept', code: null });
			}
		);

		it.each(['TAKE', 'take it', 'I can', 'got it', 'cover', 'claim'])(
			'treats %s as an accept',
			(body) => {
				expect(parseClaimReply(body)?.intent).toBe('accept');
			}
		);

		it.each(['YES 4F2K', 'yes 4f2k', 'yes, 4F2K', '4F2K yes', 'take 4F2K'])(
			'parses %s as an accept with a code',
			(body) => {
				expect(parseClaimReply(body)).toEqual({ intent: 'accept', code: '4F2K' });
			}
		);

		it('treats a bare code as an unambiguous accept', () => {
			expect(parseClaimReply('4F2K')).toEqual({ intent: 'accept', code: '4F2K' });
		});
	});

	describe('declines', () => {
		it.each(['NO', 'no', 'n', 'pass', 'nope', 'decline', 'no thanks'])(
			'treats %s as a decline',
			(body) => {
				expect(parseClaimReply(body)?.intent).toBe('decline');
			}
		);

		// The critical one: "can't" must not match the "can" accept phrase.
		it.each(["can't", 'cant', "I can't", 'cannot'])('treats %s as a decline, not an accept', (body) => {
			expect(parseClaimReply(body)?.intent).toBe('decline');
		});

		it('parses a decline with a code', () => {
			expect(parseClaimReply('NO 4F2K')).toEqual({ intent: 'decline', code: '4F2K' });
		});
	});

	describe('falls through', () => {
		// These must return null so the office-manager AI branch still sees them.
		it.each([
			'',
			'   ',
			'who is on tonight?',
			'yes please add me to the schedule for tuesday',
			'take the trash out',
			'send a message to the team',
			'1234'
		])('returns null for %p', (body) => {
			expect(parseClaimReply(body)).toBeNull();
		});

		it('ignores codes containing lookalike characters', () => {
			// 0/O/1/I are excluded from the alphabet, so these are not codes.
			expect(parseClaimReply('4O2K')).toBeNull();
			expect(parseClaimReply('4I2K')).toBeNull();
		});

		// Regression: a code must contain a digit. Without that rule these
		// four-letter keywords are themselves valid codes, and "PASS" parses
		// as a claim for code PASS rather than a decline.
		it.each(['YEAH', 'TAKE', 'PASS', 'CANT', 'CLAIM'])(
			'does not treat the keyword %s as a claim code',
			(body) => {
				expect(parseClaimReply(body)?.code ?? null).toBeNull();
			}
		);

		it('keeps keyword intent when the word could look like a code', () => {
			expect(parseClaimReply('PASS')).toEqual({ intent: 'decline', code: null });
			expect(parseClaimReply('TAKE')).toEqual({ intent: 'accept', code: null });
			expect(parseClaimReply('YEAH')).toEqual({ intent: 'accept', code: null });
		});
	});
});

describe('generateClaimCode', () => {
	it('produces a 4-char code with no lookalike characters', () => {
		for (let i = 0; i < 200; i++) {
			const code = generateClaimCode();
			expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
			expect(code).not.toMatch(/[01OI]/);
		}
	});

	it('round-trips through the parser', () => {
		for (let i = 0; i < 50; i++) {
			const code = generateClaimCode();
			expect(parseClaimReply(`YES ${code}`)).toEqual({ intent: 'accept', code });
		}
	});
});
