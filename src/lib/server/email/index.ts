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
	if (!SMTP_HOST) {
		// In development, log the email and report success so flows are testable
		// without an SMTP server. In production, missing SMTP is a misconfiguration —
		// returning true here would silently stamp credentialsSentVia='email' on
		// vendors who never received anything. Surface it as a failure instead.
		if (process.env.NODE_ENV === 'production') {
			log.error({
				to: options.to,
				subject: options.subject
			}, 'SMTP_HOST not configured in production — refusing to claim email success');
			return false;
		}
		log.info({
			to: options.to,
			subject: options.subject,
			bodyPreview: (options.text || options.html).substring(0, 100)
		}, 'Email (dev mode - no SMTP configured)');
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

		log.info({
			messageId: info.messageId,
			to: options.to,
			subject: options.subject
		}, 'Email sent successfully');

		return true;
	} catch (error) {
		log.error({
			error: error instanceof Error ? error.message : String(error),
			to: options.to,
			subject: options.subject
		}, 'Failed to send email');
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

/**
 * Send a vendor portal invitation with login URL + email + temp password.
 * The vendor will be forced to change the password on first login.
 */
export async function sendVendorPortalInvitationEmail(input: {
	to: string;
	contactName: string;
	loginUrl: string;
	tempPassword: string;
}): Promise<boolean> {
	const { to, contactName, loginUrl, tempPassword } = input;
	return sendEmail({
		to,
		subject: 'Welcome to Yakima Finds — your vendor portal login',
		html: `
			<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
				<h2 style="color: #2563eb; margin-bottom: 8px;">Your vendor portal is ready</h2>
				<p>Hi ${escapeHtml(contactName)},</p>
				<p>Sign in to manage your inventory, print tags, and view your sales.</p>
				<div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; font-family: monospace; font-size: 14px;">
					<div style="margin-bottom: 8px;"><strong>Login:</strong> <a href="${loginUrl}" style="color: #2563eb;">${loginUrl}</a></div>
					<div style="margin-bottom: 8px;"><strong>Email:</strong> ${escapeHtml(to)}</div>
					<div><strong>Password:</strong> <code style="background: white; padding: 2px 6px; border-radius: 4px;">${escapeHtml(tempPassword)}</code></div>
				</div>
				<p style="color: #6b7280; font-size: 13px;">You'll be asked to set a new password the first time you sign in.</p>
				<p style="color: #6b7280; font-size: 12px; margin-top: 24px;">If you didn't expect this email, contact the shop.<br/>— The Yakima Finds team</p>
			</div>
		`,
		text:
			`Your Yakima Finds vendor portal is ready.\n\n` +
			`Login: ${loginUrl}\n` +
			`Email: ${to}\n` +
			`Password: ${tempPassword}\n\n` +
			`You'll set a new password on first login.\n\n` +
			`If you didn't expect this email, contact the shop.\n` +
			`— The Yakima Finds team`
	});
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
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

/** Password-reset link email (vendor portal self-service recovery). */
export async function sendPasswordResetLinkEmail(email: string, resetUrl: string): Promise<boolean> {
	return sendEmail({
		to: email,
		subject: 'TeamTime - Reset your password',
		html: `
			<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
				<h2 style="color: #2563eb;">Reset your password</h2>
				<p>Tap the button below to set a new password. This link expires in 30 minutes and can be used once.</p>
				<div style="margin: 24px 0;">
					<a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Set a new password</a>
				</div>
				<p style="color:#6b7280;font-size:12px;">Or paste this link into your browser:<br>${resetUrl}</p>
				<p style="color: #6b7280; font-size: 12px;">If you didn't request this, you can ignore this email — your password won't change.</p>
			</div>
		`,
		text: `Reset your TeamTime password (link expires in 30 minutes, single use): ${resetUrl}`
	});
}
