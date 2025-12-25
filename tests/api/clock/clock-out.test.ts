/**
 * @module Tests/API/ClockOut
 * @description Tests for POST /api/clock/out endpoint.
 *
 * The clock-out endpoint:
 * - Requires authentication
 * - Requires an active clock-in entry
 * - Updates time entry with clock-out time and optional GPS
 * - Triggers clock_out task assignment rules
 * - Triggers last_clock_out rules if last person at location
 * - Awards gamification points
 * - Checks for achievements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../../../../src/routes/api/clock/out/+server';
import {
	createMockRequestEvent,
	createAuthenticatedLocals,
	createUnauthenticatedLocals
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
				clockOut: new Date()
			}
		]),
		update: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis()
	},
	timeEntries: { userId: 'userId', clockOut: 'clockOut', id: 'id' },
	taskTemplates: { isActive: 'isActive', triggerEvent: 'triggerEvent' },
	tasks: {}
}));

// Mock task rules service
vi.mock('$lib/server/services/task-rules', () => ({
	processRulesForTrigger: vi.fn().mockResolvedValue(undefined),
	isLastClockOutAtLocation: vi.fn().mockResolvedValue(false)
}));

// Mock points service
vi.mock('$lib/server/services/points-service', () => ({
	awardClockOutPoints: vi.fn().mockResolvedValue({ points: 10, action: 'clock_out' })
}));

// Mock achievements service
vi.mock('$lib/server/services/achievements-service', () => ({
	checkAndAwardAchievements: vi.fn().mockResolvedValue([])
}));

describe('POST /api/clock/out', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Authentication', () => {
		it('should return 401 for unauthenticated requests', async () => {
			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/out', {
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
		it('should return 400 when not clocked in', async () => {
			// Mock that user has no active entry
			const { db } = await import('$lib/server/db');
			vi.mocked(db.limit).mockResolvedValueOnce([]);

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/out', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				locals: createAuthenticatedLocals('staff')
			});

			const response = await POST(event as any);
			expect(response.status).toBe(400);

			const data = await response.json();
			expect(data.error).toBe('Not clocked in');
		});

		it('should accept clock-out without GPS data', async () => {
			const { db } = await import('$lib/server/db');
			// Has active entry
			vi.mocked(db.limit).mockResolvedValueOnce([
				{
					id: 'active-entry-id',
					userId: 'test-user-id',
					clockIn: new Date(),
					clockOut: null,
					locationId: null
				}
			]);
			// No triggered templates
			vi.mocked(db.where).mockResolvedValueOnce([]);

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/out', {
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

		it('should accept clock-out with GPS data', async () => {
			const { db } = await import('$lib/server/db');
			// Has active entry
			vi.mocked(db.limit).mockResolvedValueOnce([
				{
					id: 'active-entry-id',
					userId: 'test-user-id',
					clockIn: new Date(),
					clockOut: null,
					locationId: null
				}
			]);
			// No triggered templates
			vi.mocked(db.where).mockResolvedValueOnce([]);

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/out', {
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
		});
	});

	describe('Business Logic', () => {
		it('should return points awarded on successful clock-out', async () => {
			const { db } = await import('$lib/server/db');
			vi.mocked(db.limit).mockResolvedValueOnce([
				{
					id: 'active-entry-id',
					userId: 'test-user-id',
					clockIn: new Date(),
					clockOut: null,
					locationId: null
				}
			]);
			vi.mocked(db.where).mockResolvedValueOnce([]);

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/out', {
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
			expect(data.points.action).toBe('clock_out');
		});

		it('should process clock_out task rules', async () => {
			const { db } = await import('$lib/server/db');
			vi.mocked(db.limit).mockResolvedValueOnce([
				{
					id: 'active-entry-id',
					userId: 'test-user-id',
					clockIn: new Date(),
					clockOut: null,
					locationId: null
				}
			]);
			vi.mocked(db.where).mockResolvedValueOnce([]);

			const { processRulesForTrigger } = await import('$lib/server/services/task-rules');

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/out', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				locals: createAuthenticatedLocals('staff')
			});

			await POST(event as any);

			expect(processRulesForTrigger).toHaveBeenCalledWith('clock_out', expect.any(Object));
		});

		it('should check for last_clock_out when at a location', async () => {
			const { db } = await import('$lib/server/db');
			vi.mocked(db.limit).mockResolvedValueOnce([
				{
					id: 'active-entry-id',
					userId: 'test-user-id',
					clockIn: new Date(),
					clockOut: null,
					locationId: 'location-123' // Has a location
				}
			]);
			vi.mocked(db.where).mockResolvedValueOnce([]);

			const { isLastClockOutAtLocation } = await import('$lib/server/services/task-rules');

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/out', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				locals: createAuthenticatedLocals('staff')
			});

			await POST(event as any);

			expect(isLastClockOutAtLocation).toHaveBeenCalled();
		});
	});

	describe('Response Format', () => {
		it('should return proper JSON structure on success', async () => {
			const { db } = await import('$lib/server/db');
			vi.mocked(db.limit).mockResolvedValueOnce([
				{
					id: 'active-entry-id',
					userId: 'test-user-id',
					clockIn: new Date(),
					clockOut: null,
					locationId: null
				}
			]);
			vi.mocked(db.where).mockResolvedValueOnce([]);

			const event = createMockRequestEvent({
				request: new Request('http://localhost/api/clock/out', {
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
