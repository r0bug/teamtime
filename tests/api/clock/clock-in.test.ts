/**
 * @module Tests/API/ClockIn
 * @description Tests for POST /api/clock/in endpoint.
 *
 * The clock-in endpoint:
 * - Requires authentication
 * - Creates a time entry with optional GPS data
 * - Matches to scheduled shifts within 30-minute window
 * - Triggers clock_in task assignment rules
 * - Awards gamification points
 * - Checks for achievements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../../../../src/routes/api/clock/in/+server';
import {
	createMockRequestEvent,
	createAuthenticatedLocals,
	createUnauthenticatedLocals,
	assertUnauthorized,
	assertBadRequest
} from '../../../fixtures';

// Mock database
vi.mock('$lib/server/db', () => ({
	db: {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue([]),
		insert: vi.fn().mockReturnThis(),
		values: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue([
			{
				id: 'test-entry-id',
				userId: 'test-user-id',
				clockIn: new Date(),
				clockOut: null
			}
		])
	},
	timeEntries: { userId: 'userId', clockOut: 'clockOut', id: 'id' },
	shifts: { userId: 'userId', startTime: 'startTime', endTime: 'endTime' },
	taskTemplates: { isActive: 'isActive', triggerEvent: 'triggerEvent' },
	tasks: {}
}));

// Mock task rules service
vi.mock('$lib/server/services/task-rules', () => ({
	processRulesForTrigger: vi.fn().mockResolvedValue(undefined),
	isFirstClockInAtLocation: vi.fn().mockResolvedValue(false)
}));

// Mock points service
vi.mock('$lib/server/services/points-service', () => ({
	awardClockInPoints: vi.fn().mockResolvedValue({ points: 10, action: 'clock_in' })
}));

// Mock achievements service
vi.mock('$lib/server/services/achievements-service', () => ({
	checkAndAwardAchievements: vi.fn().mockResolvedValue([])
}));

describe('POST /api/clock/in', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Authentication', () => {
		it('should return 401 for unauthenticated requests', async () => {
			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/in', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				locals: createUnauthenticatedLocals()
			});

			const response = await POST(event as any);
			expect(response.status).toBe(401);

			const data = await response.json();
			expect(data.error).toBe('Unauthorized');
		});
	});

	describe('Validation', () => {
		it('should return 400 when already clocked in', async () => {
			// Mock that user is already clocked in
			const { db } = await import('$lib/server/db');
			vi.mocked(db.limit).mockResolvedValueOnce([
				{ id: 'existing-entry', clockOut: null }
			]);

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/in', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				locals: createAuthenticatedLocals('staff')
			});

			const response = await POST(event as any);
			expect(response.status).toBe(400);

			const data = await response.json();
			expect(data.error).toBe('Already clocked in');
		});

		it('should accept clock-in without GPS data', async () => {
			const { db } = await import('$lib/server/db');
			// No existing entry
			vi.mocked(db.limit).mockResolvedValueOnce([]);
			// No matching shift
			vi.mocked(db.limit).mockResolvedValueOnce([]);
			// No triggered templates
			vi.mocked(db.where).mockResolvedValueOnce([]);

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/in', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				locals: createAuthenticatedLocals('staff')
			});

			const response = await POST(event as any);
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.success).toBe(true);
		});

		it('should accept clock-in with GPS data', async () => {
			const { db } = await import('$lib/server/db');
			// No existing entry
			vi.mocked(db.limit).mockResolvedValueOnce([]);
			// No matching shift
			vi.mocked(db.limit).mockResolvedValueOnce([]);
			// No triggered templates
			vi.mocked(db.where).mockResolvedValueOnce([]);

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/in', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						lat: 46.6021,
						lng: -120.5059,
						address: '123 Main St, Yakima, WA'
					})
				}),
				locals: createAuthenticatedLocals('staff')
			});

			const response = await POST(event as any);
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.success).toBe(true);
			expect(data.entry).toBeDefined();
		});
	});

	describe('Business Logic', () => {
		it('should return points awarded on successful clock-in', async () => {
			const { db } = await import('$lib/server/db');
			vi.mocked(db.limit).mockResolvedValueOnce([]); // No existing entry
			vi.mocked(db.limit).mockResolvedValueOnce([]); // No matching shift
			vi.mocked(db.where).mockResolvedValueOnce([]); // No triggered templates

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/in', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				locals: createAuthenticatedLocals('staff')
			});

			const response = await POST(event as any);
			const data = await response.json();

			expect(data.points).toBeDefined();
			expect(data.points.points).toBe(10);
			expect(data.points.action).toBe('clock_in');
		});

		it('should return achievements array (even if empty)', async () => {
			const { db } = await import('$lib/server/db');
			vi.mocked(db.limit).mockResolvedValueOnce([]); // No existing entry
			vi.mocked(db.limit).mockResolvedValueOnce([]); // No matching shift
			vi.mocked(db.where).mockResolvedValueOnce([]); // No triggered templates

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/in', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				locals: createAuthenticatedLocals('staff')
			});

			const response = await POST(event as any);
			const data = await response.json();

			expect(data.achievements).toBeDefined();
			expect(Array.isArray(data.achievements)).toBe(true);
		});

		it('should process clock_in task rules', async () => {
			const { db } = await import('$lib/server/db');
			vi.mocked(db.limit).mockResolvedValueOnce([]); // No existing entry
			vi.mocked(db.limit).mockResolvedValueOnce([]); // No matching shift
			vi.mocked(db.where).mockResolvedValueOnce([]); // No triggered templates

			const { processRulesForTrigger } = await import('$lib/server/services/task-rules');

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/in', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				locals: createAuthenticatedLocals('staff')
			});

			await POST(event as any);

			expect(processRulesForTrigger).toHaveBeenCalledWith('clock_in', expect.any(Object));
		});
	});

	describe('Response Format', () => {
		it('should return proper JSON structure on success', async () => {
			const { db } = await import('$lib/server/db');
			vi.mocked(db.limit).mockResolvedValueOnce([]); // No existing entry
			vi.mocked(db.limit).mockResolvedValueOnce([]); // No matching shift
			vi.mocked(db.where).mockResolvedValueOnce([]); // No triggered templates

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/in', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				locals: createAuthenticatedLocals('staff')
			});

			const response = await POST(event as any);
			const data = await response.json();

			expect(data).toHaveProperty('success', true);
			expect(data).toHaveProperty('entry');
			expect(data).toHaveProperty('points');
			expect(data).toHaveProperty('achievements');
		});
	});
});
