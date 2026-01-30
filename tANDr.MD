# TeamTime - Test AND Report (tANDr) Configuration

**Project**: TeamTime Workforce Management Platform
**Repository**: github.com/r0bug/teamtime
**Version**: 1.0.0-alpha
**Last Updated**: 2025-12-27
**Agent Memory File**: Active

---

## Executive Summary

TeamTime is a comprehensive SvelteKit 2 + TypeScript mobile-first workforce management platform featuring:
- Time & Attendance with GPS verification
- Task Management with 7 trigger types
- AI Operations Assistants (3 agents, 27+ tools)
- Gamification System (points, levels, achievements)
- Expense Tracking & Item Pricing
- Sales Analytics & Reporting

### Codebase Metrics

| Metric | Value |
|--------|-------|
| Source Files | 321 |
| Lines of Code | ~63,000 |
| API Endpoints | 65+ |
| Frontend Pages | 71 |
| Database Tables | 71+ tables, 34 enums |
| AI Tools | 27+ |
| Unit Tests | 93 |
| E2E Tests | 7 |

---

## Testing Framework Configuration

### Unit Testing (Vitest)

**Configuration**: `/home/robug/teamtime/vitest.config.ts`

```bash
# Run all unit tests
npm run test:run

# Run with watch mode
npm run test

# Run with coverage
npm run test:coverage

# Run specific test
npm run test:run -- tests/unit/services/points-service.test.ts
```

### E2E Testing (Playwright)

**Configuration**: `/home/robug/teamtime/playwright.config.ts`

```bash
# Run E2E tests (auto-starts dev server)
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# View report
npm run test:e2e:report
```

---

## Test Categories

### 1. Unit Tests (Currently Implemented)

| Suite | File | Tests | Status |
|-------|------|-------|--------|
| Timezone Utilities | `tests/unit/utils/timezone.test.ts` | 21 | Active |
| Points Service | `tests/unit/services/points-service.test.ts` | 34 | Active |
| Achievements Service | `tests/unit/services/achievements-service.test.ts` | 26 | Active |
| AI Types | `tests/unit/ai/types.test.ts` | 12 | Active |
| **Total** | | **93** | |

### 2. E2E Tests (Currently Implemented)

| Suite | File | Tests | Status |
|-------|------|-------|--------|
| Authentication | `tests/e2e/auth.spec.ts` | 7 | Active |

### 3. API Tests (Skeleton - Need Implementation)

| Endpoint Category | Priority | Status |
|-------------------|----------|--------|
| Clock In/Out | Critical | Skeleton |
| Tasks | High | Pending |
| Pricing Decisions | High | Pending |
| Inventory Drops | Medium | Pending |
| Messages | Medium | Pending |
| ATM Withdrawals | Medium | Pending |
| Schedules/Shifts | Medium | Pending |

---

## Comprehensive Testing Procedure

### Phase 1: Environment Verification

```bash
# 1. Verify Node.js version (requires 18+)
node --version

# 2. Verify dependencies installed
npm list vitest @playwright/test

# 3. Check database connectivity
npm run db:studio  # Opens Drizzle Studio (optional)
```

### Phase 2: Unit Test Execution

```bash
# Run all unit tests with verbose output
npm run test:run -- --reporter=verbose

# Expected output: 93 tests passing in ~6 seconds
```

**Test Areas Covered**:
1. **Timezone Utilities** (`src/lib/server/utils/timezone.ts`)
   - Pacific timezone parsing
   - Day boundary calculations
   - DST handling
   - Date formatting

2. **Points Service** (`src/lib/server/services/points-service.ts`)
   - Point value constants
   - Streak multiplier calculations
   - Level progression
   - Category-specific logic

3. **Achievements Service** (`src/lib/server/services/achievements-service.ts`)
   - Default achievement definitions
   - Tier structure
   - Criteria validation
   - Category organization

4. **AI Types** (`src/lib/ai/types.ts`)
   - Agent type validation
   - Provider type validation
   - Tool interface structure
   - Context provider structure

### Phase 3: E2E Test Execution

```bash
# Run E2E tests (Playwright auto-starts dev server)
npm run test:e2e

# For debugging, run with headed browser
npm run test:e2e -- --headed
```

**Test Areas Covered**:
1. Login page accessibility
2. Invalid PIN handling
3. Protected route redirects
4. Admin route protection

### Phase 4: Build Verification

```bash
# Verify production build works
npm run build

# Run type checking
npm run check
```

### Phase 5: Database Schema Validation

```bash
# Generate any pending migrations
npm run db:generate

# Validate schema matches database
npm run db:push --dry-run
```

---

## Critical Test Areas (Priority Order)

### Priority 1: Core Business Logic

| Component | Location | Test Status |
|-----------|----------|-------------|
| Clock In/Out | `src/routes/api/clock/` | E2E only |
| Task Completion | `src/routes/api/tasks/[id]/complete/` | Pending |
| Points Awarding | `src/lib/server/services/points-service.ts` | Unit tested |
| Streak Calculations | `src/lib/server/services/points-service.ts` | Unit tested |
| Achievement Unlocking | `src/lib/server/services/achievements-service.ts` | Unit tested |

### Priority 2: AI System

| Component | Location | Test Status |
|-----------|----------|-------------|
| AI Types | `src/lib/ai/types.ts` | Unit tested |
| Tool Validation | `src/lib/ai/tools/utils/validation.ts` | Pending |
| Context Providers | `src/lib/ai/context/` | Pending |
| Office Manager Orchestrator | `src/lib/ai/office-manager/chat/orchestrator.ts` | Pending |

### Priority 3: API Endpoints

65+ endpoints organized by domain:
- `/api/clock/*` - Time tracking
- `/api/tasks/*` - Task management
- `/api/pricing-decisions/*` - Item pricing
- `/api/inventory-drops/*` - AI inventory
- `/api/conversations/*`, `/api/messages/*` - Messaging
- `/api/atm-withdrawals/*`, `/api/purchase-requests/*` - Expenses
- `/api/sales/*` - Sales data
- `/api/ai/*`, `/api/office-manager/*`, `/api/architect/*` - AI agents

### Priority 4: Services

| Service | Location | Test Status |
|---------|----------|-------------|
| Points Service | `src/lib/server/services/points-service.ts` | Tested |
| Achievements Service | `src/lib/server/services/achievements-service.ts` | Tested |
| Task Rules | `src/lib/server/services/task-rules.ts` | Pending |
| Inventory Drops | `src/lib/server/services/inventory-drops.ts` | Pending |
| Visibility Service | `src/lib/server/services/visibility-service.ts` | Pending |
| Permission Manager | `src/lib/server/services/permission-manager.ts` | Pending |
| Sales Attribution | `src/lib/server/services/sales-attribution-service.ts` | Pending |
| File Reader | `src/lib/server/services/file-reader.ts` | Pending |

---

## Test Execution Commands Summary

```bash
# Full test suite
npm run test:run && npm run test:e2e

# Unit tests only
npm run test:run

# Unit tests with coverage
npm run test:coverage

# E2E tests only
npm run test:e2e

# Type checking
npm run check

# Build verification
npm run build
```

---

## Expected Test Results

### Passing State

```
Unit Tests: 93 passed (0 failed)
E2E Tests: 7 passed (0 failed)
Build: Success
Type Check: Success
```

### Known Limitations

1. **Database-dependent tests**: Some services require database mocking
2. **API endpoint tests**: Currently skeleton, need integration setup
3. **AI tool tests**: Complex mocking required for external AI providers
4. **PWA tests**: Service worker tests not implemented

---

## Recommendations for Test Improvement

### Immediate Actions

1. Run `npm run test:run` before each commit
2. Run `npm run test:e2e` before deployments
3. Add pre-commit hook for test execution

### Short-Term Improvements

1. Add integration tests for `/api/clock/in` and `/api/clock/out`
2. Add integration tests for `/api/tasks/[id]/complete`
3. Add unit tests for task-rules service
4. Add unit tests for visibility-service

### Long-Term Enhancements

1. Set up CI/CD pipeline with test automation
2. Add visual regression testing for UI
3. Add performance testing for AI orchestration
4. Implement snapshot testing for AI prompts

---

## Test File Locations

```
/home/robug/teamtime/
├── tests/
│   ├── unit/
│   │   ├── utils/
│   │   │   └── timezone.test.ts        # 21 tests
│   │   ├── services/
│   │   │   ├── points-service.test.ts  # 34 tests
│   │   │   └── achievements-service.test.ts  # 26 tests
│   │   └── ai/
│   │       └── types.test.ts           # 12 tests
│   ├── e2e/
│   │   └── auth.spec.ts                # 7 tests
│   ├── api/
│   │   └── clock/                      # Skeleton
│   ├── fixtures/
│   │   ├── index.ts
│   │   ├── users.ts
│   │   ├── database.ts
│   │   ├── auth.ts
│   │   └── api-helpers.ts
│   ├── mocks/
│   │   ├── app-environment.ts
│   │   └── env-private.ts
│   └── setup.ts
├── vitest.config.ts
├── playwright.config.ts
└── TESTING.md
```

---

## Journal Reference

Previous tANDr.MD versions are archived at:
`/home/robug/teamtime/.claude/tANDr_journal/`

---

## Cron/Scheduled Tasks Testing

The following cron endpoints should be tested:

| Endpoint | Purpose | Frequency |
|----------|---------|-----------|
| `/api/tasks/cron` | Process scheduled tasks | Every 15 min |
| `/api/ai/cron` | Trigger AI agents | Every 15 min (business hours) |
| `/api/points/cron` | Daily sales attribution | Daily 3 AM PT |

---

## Security Testing Checklist

- [ ] Authentication flows work correctly
- [ ] Protected routes redirect to login
- [ ] Admin routes require admin role
- [ ] API endpoints validate permissions
- [ ] No secrets in committed code (pre-commit hook installed)

---

*Generated by Claude Code tANDr Agent*
*Version: 1.0.0*
