import { hash, verify } from '@node-rs/argon2';

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
	const pin = Math.floor(100000 + Math.random() * 900000).toString();
	return pin;
}

export function generate2FACode(): string {
	return Math.floor(100000 + Math.random() * 900000).toString();
}

export function validatePinFormat(pin: string): boolean {
	return /^\d{4,8}$/.test(pin);
}
