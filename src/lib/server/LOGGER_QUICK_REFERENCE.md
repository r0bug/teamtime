# Logger Quick Reference Card

Fast reference for using the Pino structured logger in TeamTime.

## Installation

```bash
npm install pino pino-pretty
```

## Import

```typescript
import { logger, createLogger, logError, createRequestLogger } from '$lib/server/logger';
```

## Basic Usage

```typescript
// Create a module logger
const log = createLogger('module-name');

// Log messages
log.trace('Very detailed debug');
log.debug('Debug information');
log.info('Informational message');
log.warn('Warning message');
log.error('Error message');
log.fatal('Fatal error');
```

## Log Levels

From lowest to highest priority:

1. `trace` - Very detailed debugging
2. `debug` - Debugging information
3. `info` - Normal operations ⭐ (default in production)
4. `warn` - Warnings
5. `error` - Errors
6. `fatal` - Fatal errors

## Common Patterns

### Pattern 1: Module Logger

```typescript
const log = createLogger('user-service');
log.info('User created', { userId: '123', email: 'user@example.com' });
```

### Pattern 2: Error Logging

```typescript
try {
	await operation();
} catch (err) {
	logError(log, err as Error, { context: 'additional data' });
}
```

### Pattern 3: Request Logger

```typescript
export async function GET({ request }) {
	const log = createRequestLogger('api', crypto.randomUUID(), {
		path: request.url,
		method: 'GET',
	});

	log.info('Request received');
	// ... handle request ...
	log.info('Request completed', { statusCode: 200 });
}
```

### Pattern 4: Service Class

```typescript
class MyService {
	private log = createLogger('my-service');

	async doSomething() {
		this.log.info('Starting operation');
		// ... do work ...
		this.log.info('Operation complete');
	}
}
```

## SvelteKit Integration

### API Endpoint

```typescript
// src/routes/api/resource/+server.ts
import { createRequestLogger, logError } from '$lib/server/logger';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
	const log = createRequestLogger('resource-api', crypto.randomUUID());

	log.info('Creating resource');

	try {
		const data = await request.json();
		const result = await createResource(data);

		log.info('Resource created', { id: result.id });
		return json(result, { status: 201 });
	} catch (err) {
		logError(log, err as Error);
		return json({ error: 'Failed' }, { status: 500 });
	}
}
```

### Page Load

```typescript
// src/routes/resource/[id]/+page.server.ts
import { createRequestLogger, logError } from '$lib/server/logger';
import { error } from '@sveltejs/kit';

export async function load({ params, request }) {
	const log = createRequestLogger('resource-page', crypto.randomUUID(), {
		resourceId: params.id,
	});

	log.info('Loading resource');

	try {
		const resource = await fetchResource(params.id);
		if (!resource) {
			log.warn('Resource not found', { id: params.id });
			throw error(404, 'Not found');
		}

		log.info('Resource loaded');
		return { resource };
	} catch (err) {
		logError(log, err as Error, { resourceId: params.id });
		throw err;
	}
}
```

## Best Practices

### ✅ DO

```typescript
// Use structured data
log.info('User login', { userId: '123', ip: '192.168.1.1' });

// Create module-specific loggers
const log = createLogger('auth');

// Include context
log.error('Failed to save', { userId, operation: 'update' });

// Use appropriate log levels
log.debug('Detailed debug info');
log.info('Normal operation');
log.error('Actual error');
```

### ❌ DON'T

```typescript
// Don't use string interpolation
log.info(`User ${userId} logged in`); // ❌

// Don't use console.log
console.log('Something happened'); // ❌

// Don't log sensitive data
log.info('Login', { password: '...' }); // ❌ (auto-redacted anyway)

// Don't use wrong log levels
log.error('Normal operation'); // ❌
log.info('Critical error'); // ❌
```

## Environment Configuration

### Development (.env)

```bash
NODE_ENV=development
LOG_LEVEL=debug
```

Output: Pretty-printed, colorized

### Production (.env)

```bash
NODE_ENV=production
LOG_LEVEL=info
```

Output: JSON formatted

## Structured Logging

```typescript
// Simple
log.info('Event occurred');

// With context
log.info('Event occurred', { eventType: 'login', userId: '123' });

// Complex data
log.info('Order processed', {
	orderId: 'ORDER-123',
	items: [
		{ sku: 'ITEM-1', qty: 2 },
		{ sku: 'ITEM-2', qty: 1 },
	],
	total: 99.99,
	timestamp: new Date().toISOString(),
});
```

## Performance Monitoring

```typescript
const startTime = Date.now();
const operationId = crypto.randomUUID();

log.info('Operation started', { operationId });

try {
	await doWork();

	const duration = Date.now() - startTime;
	log.info('Operation completed', { operationId, duration });
} catch (err) {
	const duration = Date.now() - startTime;
	logError(log, err as Error, { operationId, duration });
}
```

## Auto-Redacted Fields

These fields are automatically redacted:

- `password`
- `token`
- `apiKey`
- `secret`
- `authorization`
- `AUTH_SECRET`
- `SMTP_PASSWORD`
- `TWILIO_AUTH_TOKEN`
- And nested versions (e.g., `user.password`)

Output: `[REDACTED]`

## Child Loggers

```typescript
const baseLog = createLogger('module');

// Add operation-specific context
const opLog = baseLog.child({
	operation: 'import',
	operationId: crypto.randomUUID(),
});

opLog.info('Starting import'); // Includes operation context
opLog.info('Import complete'); // Still includes operation context
```

## Examples by Use Case

### Database Query

```typescript
const log = createLogger('database');

log.debug('Executing query', { query: sql, params });
const result = await db.query(sql, params);
log.debug('Query complete', { rowCount: result.rows.length });
```

### Authentication

```typescript
const log = createLogger('auth');

log.info('Login attempt', { username, ip });
// ... verify credentials ...
log.info('Login successful', { userId, role });
```

### Background Job

```typescript
const log = createLogger('sync-job');
const jobId = crypto.randomUUID();

log.info('Job started', { jobId, type: 'inventory' });
// ... do work ...
log.info('Job completed', { jobId, itemsProcessed: 150 });
```

### Security Event

```typescript
const log = createLogger('security');

log.warn('Failed login attempts', {
	username,
	ip,
	attemptCount: 5,
	action: 'blocked',
});
```

### API Request

```typescript
const log = createRequestLogger('api', crypto.randomUUID());

log.info('Request received', { method: 'POST', path: '/api/users' });
log.debug('Processing request', { bodySize: 1024 });
log.info('Response sent', { statusCode: 201, responseTime: 45 });
```

## Testing

Run the test suite:

```bash
npx tsx src/lib/server/logger.test.ts
```

## Common Commands

```bash
# Install
npm install pino pino-pretty

# Test
npx tsx src/lib/server/logger.test.ts

# Check if installed
npm list pino pino-pretty

# View production format
NODE_ENV=production npx tsx src/lib/server/logger.test.ts
```

## Output Examples

### Development

```
[12:30:45.123] INFO (user-service): User created
    userId: "123"
    email: "user@example.com"
```

### Production

```json
{
	"level": "INFO",
	"time": "2024-12-11T12:30:45.123Z",
	"module": "user-service",
	"msg": "User created",
	"userId": "123",
	"email": "user@example.com"
}
```

## Need More Help?

- **Full documentation**: `src/lib/server/LOGGER_README.md`
- **Examples**: `src/lib/server/logger.example.ts`
- **Migration guide**: `src/lib/server/LOGGER_MIGRATION.md`
- **Pino docs**: https://getpino.io/

## Key Exports

```typescript
// From '$lib/server/logger'
export const logger: Logger; // Root logger
export function createLogger(moduleName: string): Logger; // Module logger
export function logError(logger, error, context?): void; // Error helper
export function createRequestLogger(module, requestId, context?): Logger; // Request logger
export const LogLevels: { TRACE, DEBUG, INFO, WARN, ERROR, FATAL }; // Constants
```

---

**Remember:** Always use structured data, never string interpolation!

✅ `log.info('User login', { userId })`
❌ `log.info(`User ${userId} logged in`)`
