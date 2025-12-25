# TeamTime Testing Guide

This document describes the testing infrastructure and how to run tests for the TeamTime application.

## Testing Stack

- **Unit/Integration Tests**: [Vitest](https://vitest.dev/) v4
- **E2E Tests**: [Playwright](https://playwright.dev/) v1.57
- **Coverage**: @vitest/coverage-v8

## Test Structure

```
tests/
├── unit/                    # Unit tests (pure functions, services)
│   ├── services/           # Business logic services
│   │   ├── points-service.test.ts
│   │   └── achievements-service.test.ts
│   ├── ai/                 # AI system tests
│   │   └── types.test.ts
│   └── utils/              # Utility function tests
│       └── timezone.test.ts
├── api/                    # API endpoint tests (integration)
│   └── clock/              # Time tracking API
├── e2e/                    # End-to-end tests (Playwright)
│   └── auth.spec.ts        # Authentication flows
├── fixtures/               # Test data and helpers
│   ├── index.ts           # Central exports
│   ├── users.ts           # Mock user data
│   ├── database.ts        # DB helpers
│   ├── auth.ts            # Auth mocking
│   └── api-helpers.ts     # API test utilities
├── mocks/                  # SvelteKit module mocks
│   ├── app-environment.ts
│   └── env-private.ts
└── setup.ts               # Global test setup
```

## Running Tests

### Unit Tests (Vitest)

```bash
# Run all unit tests
npm run test

# Run tests once (no watch mode)
npm run test:run

# Run with coverage
npm run test:coverage

# Run specific test file
npm run test:run -- tests/unit/services/points-service.test.ts

# Run tests matching pattern
npm run test:run -- --grep "timezone"
```

### E2E Tests (Playwright)

```bash
# Run E2E tests (requires dev server)
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# View report
npm run test:e2e:report
```

**Note**: E2E tests require the development server to be running on port 5173.

## Test Coverage

Current test counts (as of audit):
- **Unit Tests**: 93 tests across 4 suites
  - Timezone utilities: 21 tests
  - Points service: 34 tests
  - Achievements service: 26 tests
  - AI types: 12 tests
- **E2E Tests**: 7 tests (auth flows)

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { calculateLevel } from '$lib/server/services/points-service';

describe('calculateLevel', () => {
  it('should return level 1 for 0 points', () => {
    const result = calculateLevel(0);
    expect(result.level).toBe(1);
    expect(result.name).toBe('Newcomer');
  });
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test('login page should be accessible', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('form')).toBeVisible();
});
```

## Mocking

### SvelteKit Environment Variables

Mock files in `tests/mocks/` provide stub values for SvelteKit imports:

- `$env/static/private` → `tests/mocks/env-private.ts`
- `$app/environment` → `tests/mocks/app-environment.ts`

### Database Mocking

Use `createMockDb()` from fixtures for unit tests:

```typescript
import { createMockDb } from '../fixtures';

const mockDb = createMockDb();
vi.mocked(db).query.users.findFirst.mockResolvedValue(testUser);
```

## Best Practices

1. **Keep tests isolated** - Each test should be independent
2. **Use fixtures** - Centralize test data in `tests/fixtures/`
3. **Test behavior, not implementation** - Focus on what, not how
4. **Name tests descriptively** - Use "should" statements
5. **Group related tests** - Use `describe` blocks for organization

## Timezone Testing

TeamTime operates in Pacific timezone (America/Los_Angeles). When testing date operations:

```typescript
import { parsePacificDate, getPacificDayBounds } from '$lib/server/utils/timezone';

it('should parse Pacific date correctly', () => {
  const result = parsePacificDate('2024-01-15');
  expect(result.toISOString()).toBe('2024-01-15T08:00:00.000Z'); // 8 AM UTC = midnight PST
});
```

## CI/CD

Tests are designed to run in CI environments:
- `npm run test:run` exits with code 0 on success
- `npm run test:e2e` requires `--reporter=list` for CI output
- Coverage reports are generated to `./coverage/`

## Troubleshooting

### Common Issues

1. **SvelteKit import errors**: Ensure mocks are configured in `vitest.config.ts`
2. **Timeout errors**: Increase timeout in test config or individual tests
3. **E2E server not found**: Start dev server before running E2E tests

### Debug Mode

```bash
# Run Vitest in debug mode
npm run test -- --reporter=verbose

# Run Playwright with headed browser
npm run test:e2e -- --headed
```
