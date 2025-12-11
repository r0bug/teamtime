import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } from '$env/static/private';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { createLogger } from '$lib/server/logger';

const log = createLogger('server:email');

interface EmailOptions {
	to: string;
	subject: string;
	html: string;
	text?: string;
}

// Create transporter singleton
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
	if (!transporter && SMTP_HOST) {
		transporter = nodemailer.createTransport({
			host: SMTP_HOST,
			port: parseInt(SMTP_PORT || '587', 10),
			secure: parseInt(SMTP_PORT || '587', 10) === 465, // true for 465, false for other ports
			auth: {
				user: SMTP_USER,
				pass: SMTP_PASSWORD
			}
		});
	}
	return transporter!;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
	// In development or when SMTP is not configured, log the email instead of sending
	if (!SMTP_HOST) {
		log.info('Email (dev mode - no SMTP configured)', {
			to: options.to,
			subject: options.subject,
			bodyPreview: (options.text || options.html).substring(0, 100)
		});
		return true;
	}

	// In production with SMTP configured, send actual email
	try {
		const transport = getTransporter();

		const info = await transport.sendMail({
			from: SMTP_FROM,
			to: options.to,
			subject: options.subject,
			html: options.html,
			text: options.text || options.html.replace(/<[^>]*>/g, '') // Strip HTML as fallback
		});

		log.info('Email sent successfully', {
			messageId: info.messageId,
			to: options.to,
			subject: options.subject
		});

		return true;
	} catch (error) {
		log.error('Failed to send email', {
			error: error instanceof Error ? error.message : String(error),
			to: options.to,
			subject: options.subject
		});
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
