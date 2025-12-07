import { hash } from '@node-rs/argon2';
import postgres from 'postgres';

const ARGON2_OPTIONS = {
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1
};

async function createAdmin() {
	const sql = postgres(process.env.DATABASE_URL || 'postgresql://teamtime:teamtime_dev_password@localhost:5432/teamtime');

	const pin = '6809';
	const pinHash = await hash(pin, ARGON2_OPTIONS);

	const user = {
		email: 'john@yakimafinds.com',
		username: 'Boss',
		name: 'John',
		phone: '509-961-3050',
		role: 'admin',
		pinHash: pinHash,
		isActive: true
	};

	try {
		const result = await sql`
			INSERT INTO users (email, username, name, phone, role, pin_hash, is_active)
			VALUES (${user.email}, ${user.username}, ${user.name}, ${user.phone}, ${user.role}, ${user.pinHash}, ${user.isActive})
			RETURNING id, email, username, name, role
		`;
		console.log('Admin user created successfully:');
		console.log(result[0]);
	} catch (error) {
		if (error.code === '23505') {
			console.log('User already exists, updating...');
			const result = await sql`
				UPDATE users
				SET role = ${user.role}, pin_hash = ${user.pinHash}, phone = ${user.phone}, is_active = ${user.isActive}
				WHERE email = ${user.email}
				RETURNING id, email, username, name, role
			`;
			console.log('Admin user updated:');
			console.log(result[0]);
		} else {
			throw error;
		}
	}

	await sql.end();
}

createAdmin().catch(console.error);
