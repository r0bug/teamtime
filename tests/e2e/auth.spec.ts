/**
 * @module E2E/Auth
 * @description End-to-end tests for authentication flows.
 *
 * Tests cover:
 * - Login page accessibility
 * - PIN authentication
 * - Session management
 * - Logout functionality
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
	test('login page should be accessible', async ({ page }) => {
		await page.goto('/login');

		// Should see login form
		await expect(page.locator('form')).toBeVisible();

		// Should have PIN input
		await expect(page.locator('input[type="password"], input[name="pin"]')).toBeVisible();
	});

	test('should show error for invalid PIN', async ({ page }) => {
		await page.goto('/login');

		// Enter invalid PIN
		const pinInput = page.locator('input[type="password"], input[name="pin"]');
		await pinInput.fill('0000');

		// Submit form
		await page.locator('button[type="submit"]').click();

		// Should see error message (wait for it to appear)
		await expect(page.locator('text=Invalid, text=error, text=failed').first()).toBeVisible({
			timeout: 5000
		});
	});

	test('login page should have proper title', async ({ page }) => {
		await page.goto('/login');

		// Check page title or heading
		await expect(page).toHaveTitle(/TeamTime|Login/i);
	});

	test('should redirect unauthenticated users to login', async ({ page }) => {
		// Try to access protected page
		await page.goto('/');

		// Should redirect to login
		await expect(page).toHaveURL(/login/);
	});
});

test.describe('Protected Routes', () => {
	test('dashboard should require authentication', async ({ page }) => {
		await page.goto('/');

		// Should be redirected to login
		const url = page.url();
		expect(url).toContain('login');
	});

	test('admin routes should require authentication', async ({ page }) => {
		await page.goto('/admin');

		// Should be redirected to login or show unauthorized
		const url = page.url();
		expect(url).toMatch(/login|unauthorized/);
	});

	test('tasks page should require authentication', async ({ page }) => {
		await page.goto('/tasks');

		// Should be redirected to login
		await expect(page).toHaveURL(/login/);
	});
});
