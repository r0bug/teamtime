import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'crypto';

const ARGON2_OPTIONS = {
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1
};

export async function hashPin(pin: string): Promise<string> {
	return await hash(pin, ARGON2_OPTIONS);
}

export async function verifyPin(pin: string, hashedPin: string): Promise<boolean> {
	try {
		return await verify(hashedPin, pin);
	} catch {
		return false;
	}
}

export function generatePin(): string {
	return randomInt(100000, 1000000).toString();
}

export function generate2FACode(): string {
	return randomInt(100000, 1000000).toString();
}

export function validatePinFormat(pin: string): boolean {
	return /^\d{4,8}$/.test(pin);
}
