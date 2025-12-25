/**
 * @module Mocks/EnvPrivate
 * @description Mock for $env/static/private SvelteKit module
 */

export const DATABASE_URL = 'postgresql://test:test@localhost:5432/teamtime_test';
export const AUTH_SECRET = 'test-auth-secret-at-least-32-characters-long';
export const GOOGLE_MAPS_API_KEY = 'test-google-maps-key';
export const VAPID_PUBLIC_KEY = 'test-vapid-public';
export const VAPID_PRIVATE_KEY = 'test-vapid-private';
export const SMTP_HOST = 'localhost';
export const SMTP_PORT = '1025';
export const SMTP_USER = 'test';
export const SMTP_PASSWORD = 'test';
export const SMTP_FROM_EMAIL = 'test@example.com';
export const SMTP_FROM_NAME = 'TeamTime Test';
export const TWILIO_ACCOUNT_SID = 'test-twilio-sid';
export const TWILIO_AUTH_TOKEN = 'test-twilio-token';
export const TWILIO_PHONE_NUMBER = '+15551234567';
export const ANTHROPIC_API_KEY = 'test-anthropic-key';
export const OPENAI_API_KEY = 'test-openai-key';
export const SEGMIND_API_KEY = 'test-segmind-key';
export const CRON_SECRET = 'test-cron-secret';
