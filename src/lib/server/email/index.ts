import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } from '$env/static/private';

interface EmailOptions {
	to: string;
	subject: string;
	html: string;
	text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
	// In development, log the email instead of sending
	if (process.env.NODE_ENV === 'development') {
		console.log('=== EMAIL (DEV MODE) ===');
		console.log(`To: ${options.to}`);
		console.log(`Subject: ${options.subject}`);
		console.log(`Body: ${options.text || options.html}`);
		console.log('========================');
		return true;
	}

	// In production, implement actual email sending
	// This is a placeholder for nodemailer or similar
	try {
		// TODO: Implement actual email sending with nodemailer
		console.log('Email would be sent to:', options.to);
		return true;
	} catch (error) {
		console.error('Failed to send email:', error);
		return false;
	}
}

export async function send2FACode(email: string, code: string): Promise<boolean> {
	return sendEmail({
		to: email,
		subject: 'TeamTime - Your Verification Code',
		html: `
			<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
				<h2 style="color: #2563eb;">TeamTime Verification</h2>
				<p>Your verification code is:</p>
				<div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
					<span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1f2937;">${code}</span>
				</div>
				<p>This code will expire in 10 minutes.</p>
				<p style="color: #6b7280; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
			</div>
		`,
		text: `Your TeamTime verification code is: ${code}. This code will expire in 10 minutes.`
	});
}

export async function sendPinResetCode(email: string, code: string): Promise<boolean> {
	return sendEmail({
		to: email,
		subject: 'TeamTime - PIN Reset Request',
		html: `
			<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
				<h2 style="color: #2563eb;">PIN Reset Request</h2>
				<p>Use this code to reset your PIN:</p>
				<div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
					<span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1f2937;">${code}</span>
				</div>
				<p>This code will expire in 10 minutes.</p>
				<p style="color: #6b7280; font-size: 12px;">If you didn't request a PIN reset, please contact your administrator immediately.</p>
			</div>
		`,
		text: `Your TeamTime PIN reset code is: ${code}. This code will expire in 10 minutes.`
	});
}
