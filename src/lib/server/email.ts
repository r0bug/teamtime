// Email service for 2FA codes
// For development: logs to console
// For production: configure with real email provider

export async function send2FACode(email: string, code: string): Promise<void> {
	// In development, just log the code
	console.log('\n========================================');
	console.log('2FA CODE FOR:', email);
	console.log('CODE:', code);
	console.log('========================================\n');

	// TODO: For production, integrate with email service like:
	// - Resend (https://resend.com)
	// - SendGrid
	// - AWS SES
	// - Nodemailer with SMTP

	// Example with Resend:
	// import { Resend } from 'resend';
	// const resend = new Resend(process.env.RESEND_API_KEY);
	// await resend.emails.send({
	//   from: 'TeamTime <noreply@yourdomain.com>',
	//   to: email,
	//   subject: 'Your TeamTime verification code',
	//   html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`
	// });
}

export async function sendPinResetEmail(email: string, resetLink: string): Promise<void> {
	console.log('\n========================================');
	console.log('PIN RESET FOR:', email);
	console.log('LINK:', resetLink);
	console.log('========================================\n');
}

export async function sendPinResetCode(email: string, code: string): Promise<void> {
	console.log('\n========================================');
	console.log('PIN RESET CODE FOR:', email);
	console.log('CODE:', code);
	console.log('========================================\n');
}
