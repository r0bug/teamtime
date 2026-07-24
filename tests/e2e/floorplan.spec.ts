/**
 * @module E2E/Floorplan
 * @description Minimal end-to-end checks for the floorplan canvas page.
 *
 * Requires the seeded local dev DB (Yakima Finds plan + dev sessions from
 * the Phase 1/2 setup). Auth via the pre-minted dev session cookies.
 */
import { test, expect } from '@playwright/test';

const ADMIN_COOKIE = {
	name: 'auth_session',
	value: 'devsess-admin-000000000000000000000000',
	domain: 'localhost',
	path: '/'
};
const STAFF_COOKIE = { ...ADMIN_COOKIE, value: 'devsess-staff-000000000000000000000000' };

test.describe('Floorplan', () => {
	test('renders the canvas with all three mode tabs for admin', async ({ page, context }) => {
		await context.addCookies([ADMIN_COOKIE]);
		await page.goto('/floorplan');

		await expect(page.getByRole('heading', { name: 'Floorplan', level: 1 })).toBeVisible();
		await expect(page.locator('canvas')).toBeVisible();
		for (const m of ['view', 'edit', 'build']) {
			await expect(page.getByRole('tab', { name: m })).toBeVisible();
		}

		// Hydration applied the overlay binding once the select reads the
		// default overlay (vendor view).
		await expect(page.getByLabel('overlay')).toHaveValue('vendor_id', { timeout: 10000 });

		// The canvas must actually draw the seeded plan: sample pixels and
		// require more than one distinct color (void bg + painted cells).
		await expect
			.poll(
				() =>
					page.locator('canvas').evaluate((el) => {
						const canvas = el as HTMLCanvasElement;
						const ctx = canvas.getContext('2d')!;
						const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
						const colors = new Set<number>();
						for (let i = 0; i < data.length; i += 4096) {
							colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
						}
						return colors.size;
					}),
				{ timeout: 10000 }
			)
			.toBeGreaterThan(1);

		await page.screenshot({ path: 'test-results/floorplan-admin.png', fullPage: true });
	});

	test('staff sees view+edit but no build tab', async ({ page, context }) => {
		await context.addCookies([STAFF_COOKIE]);
		await page.goto('/floorplan');

		await expect(page.getByRole('tab', { name: 'view' })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'edit' })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'build' })).toHaveCount(0);
	});

	test('overlay switch does not error', async ({ page, context }) => {
		await context.addCookies([ADMIN_COOKIE]);
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));
		await page.goto('/floorplan');
		await page.getByLabel('overlay').selectOption('zone');
		await page.waitForTimeout(300);
		expect(errors).toEqual([]);
	});

	test('build mode reachability check reports all reachable on the seed', async ({ page, context }) => {
		await context.addCookies([ADMIN_COOKIE]);
		await page.goto('/floorplan');
		// SSR renders the tabs before hydration attaches handlers — retry the
		// click until the tab actually becomes selected.
		const buildTab = page.getByRole('tab', { name: 'build' });
		await expect(async () => {
			await buildTab.click();
			await expect(buildTab).toHaveAttribute('aria-selected', 'true', { timeout: 500 });
		}).toPass({ timeout: 10000 });
		await page.getByRole('button', { name: 'Check reachability' }).click();
		// Seeded geometry: front door reaches main+storsly+backroom (through
		// the arch); Ralph is boh and intentionally not counted.
		await expect(page.locator('text=/All \\d+ sellable cells reachable/')).toBeVisible({ timeout: 5000 });
	});
});
