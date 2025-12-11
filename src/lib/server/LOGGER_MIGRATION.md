# Logger Migration Guide

This guide helps you migrate existing code to use the new structured logging system.

## Installation

First, install the required dependencies:

```bash
npm install pino pino-pretty
```

## Migration Steps

### Step 1: Replace console.log with logger

**Before:**
```typescript
console.log('User logged in:', userId);
console.error('Error occurred:', error);
```

**After:**
```typescript
import { createLogger } from '$lib/server/logger';

const log = createLogger('your-module-name');

log.info('User logged in', { userId });
log.error('Error occurred', { error: error.message });
```

### Step 2: Convert string interpolation to structured logging

**Before:**
```typescript
console.log(`Processing order ${orderId} for user ${userId}`);
```

**After:**
```typescript
log.info('Processing order', { orderId, userId });
```

### Step 3: Add context to error logging

**Before:**
```typescript
try {
	await someOperation();
} catch (error) {
	console.error('Operation failed:', error);
}
```

**After:**
```typescript
import { logError } from '$lib/server/logger';

try {
	await someOperation();
} catch (error) {
	logError(log, error as Error, {
		operation: 'someOperation',
		userId,
		additionalContext: 'any relevant data',
	});
}
```

### Step 4: Add request tracking in SvelteKit routes

**Before:**
```typescript
// src/routes/api/users/+server.ts
export async function GET({ params }) {
	console.log('Fetching user:', params.id);

	try {
		const user = await db.users.find(params.id);
		return json(user);
	} catch (error) {
		console.error('Error fetching user:', error);
		return json({ error: 'Not found' }, { status: 404 });
	}
}
```

**After:**
```typescript
import { createRequestLogger, logError } from '$lib/server/logger';
import { json } from '@sveltejs/kit';

export async function GET({ params, request }) {
	const log = createRequestLogger('users-api', crypto.randomUUID(), {
		userId: params.id,
		method: 'GET',
	});

	log.info('Fetching user');

	try {
		const user = await db.users.find(params.id);
		log.info('User found');
		return json(user);
	} catch (error) {
		logError(log, error as Error, { userId: params.id });
		return json({ error: 'Not found' }, { status: 404 });
	}
}
```

### Step 5: Update service classes

**Before:**
```typescript
export class UserService {
	async createUser(data: any) {
		console.log('Creating user:', data.email);

		try {
			const user = await this.db.create(data);
			console.log('User created:', user.id);
			return user;
		} catch (error) {
			console.error('Failed to create user:', error);
			throw error;
		}
	}
}
```

**After:**
```typescript
import { createLogger, logError } from '$lib/server/logger';

export class UserService {
	private log = createLogger('user-service');

	async createUser(data: any) {
		this.log.info('Creating user', { email: data.email });

		try {
			const user = await this.db.create(data);
			this.log.info('User created', { userId: user.id });
			return user;
		} catch (error) {
			logError(this.log, error as Error, { email: data.email });
			throw error;
		}
	}
}
```

## Finding Code to Migrate

Use these commands to find code that needs migration:

### Find console.log usage
```bash
grep -r "console\.log" src/
grep -r "console\.error" src/
grep -r "console\.warn" src/
grep -r "console\.debug" src/
```

### Find all server-side files
```bash
find src/routes -name "+server.ts"
find src/routes -name "+page.server.ts"
find src/lib/server -name "*.ts"
```

## Module Naming Conventions

Use descriptive module names that indicate the component or feature:

- **Routes**: Use the route path, e.g., `'users-api'`, `'auth-page'`
- **Services**: Use the service name, e.g., `'user-service'`, `'email-service'`
- **Jobs**: Use the job type, e.g., `'inventory-sync'`, `'cleanup-job'`
- **Middleware**: Use the middleware name, e.g., `'auth-middleware'`, `'rate-limiter'`
- **Database**: Use `'database'` or specific adapter names
- **Security**: Use `'security'` or specific security features

## Common Patterns

### Pattern 1: API Endpoints

```typescript
import { createRequestLogger, logError } from '$lib/server/logger';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
	const log = createRequestLogger('resource-api', crypto.randomUUID(), {
		method: 'POST',
		path: request.url,
	});

	log.info('Creating resource');

	try {
		const data = await request.json();
		log.debug('Request payload received', { size: JSON.stringify(data).length });

		const result = await processData(data);

		log.info('Resource created', { resourceId: result.id });
		return json(result, { status: 201 });
	} catch (error) {
		logError(log, error as Error);
		return json({ error: 'Internal error' }, { status: 500 });
	}
}
```

### Pattern 2: Load Functions

```typescript
import { createRequestLogger, logError } from '$lib/server/logger';
import { error } from '@sveltejs/kit';

export async function load({ params, request }) {
	const log = createRequestLogger('resource-page', crypto.randomUUID(), {
		resourceId: params.id,
	});

	log.info('Loading resource page');

	try {
		const resource = await fetchResource(params.id);

		if (!resource) {
			log.warn('Resource not found', { resourceId: params.id });
			throw error(404, 'Resource not found');
		}

		log.info('Resource loaded');
		return { resource };
	} catch (err) {
		logError(log, err as Error, { resourceId: params.id });
		throw err;
	}
}
```

### Pattern 3: Background Jobs

```typescript
import { createLogger, logError } from '$lib/server/logger';

export async function runBackgroundJob() {
	const log = createLogger('background-job');
	const jobId = crypto.randomUUID();
	const startTime = Date.now();

	log.info('Job started', { jobId, type: 'data-sync' });

	try {
		const result = await performWork();

		const duration = Date.now() - startTime;
		log.info('Job completed', {
			jobId,
			duration,
			itemsProcessed: result.count,
		});

		return result;
	} catch (error) {
		const duration = Date.now() - startTime;
		logError(log, error as Error, { jobId, duration });

		log.error('Job failed', { jobId, duration, willRetry: true });
		throw error;
	}
}
```

### Pattern 4: Database Operations

```typescript
import { createLogger, logError } from '$lib/server/logger';

const log = createLogger('database');

export async function executeQuery(query: string, params: any[]) {
	const queryId = crypto.randomUUID();
	const startTime = Date.now();

	log.debug('Executing query', {
		queryId,
		query: query.substring(0, 100), // Log first 100 chars
		paramCount: params.length,
	});

	try {
		const result = await db.execute(query, params);

		const duration = Date.now() - startTime;
		log.debug('Query completed', {
			queryId,
			duration,
			rowCount: result.rowCount,
		});

		return result;
	} catch (error) {
		const duration = Date.now() - startTime;
		logError(log, error as Error, {
			queryId,
			query: query.substring(0, 100),
			duration,
		});
		throw error;
	}
}
```

## Existing Code Example Migration

Let's migrate some existing files in the project:

### Example: src/lib/server/services/permission-manager.ts

**Find current logging:**
```bash
grep -n "console\." src/lib/server/services/permission-manager.ts
```

**Add at the top:**
```typescript
import { createLogger, logError } from '$lib/server/logger';

const log = createLogger('permission-manager');
```

**Replace each console.log:**
```typescript
// Before
console.log('Checking permission:', action, resource);

// After
log.debug('Checking permission', { action, resource, userId });
```

### Example: src/lib/server/services/task-rules.ts

**Add at the top:**
```typescript
import { createLogger, logError } from '$lib/server/logger';

const log = createLogger('task-rules');
```

**Replace logging:**
```typescript
// Before
console.log('Evaluating task rules for:', taskId);
console.error('Rule evaluation failed:', error);

// After
log.info('Evaluating task rules', { taskId });
logError(log, error as Error, { taskId });
```

## Testing Your Migration

After migrating code, test with different log levels:

### Development testing:
```bash
# .env
NODE_ENV=development
LOG_LEVEL=debug
```

Run your application and verify you see pretty-printed, colorized logs.

### Production simulation:
```bash
# .env
NODE_ENV=production
LOG_LEVEL=info
```

Run your application and verify you see JSON-formatted logs.

## Gradual Migration Strategy

You don't need to migrate everything at once. Here's a recommended order:

1. **Critical paths first**: Auth, payment processing, data mutations
2. **API endpoints**: All `/api` routes
3. **Background jobs**: Scheduled tasks and workers
4. **Service layer**: Business logic services
5. **Utilities**: Helper functions and utilities
6. **Everything else**: Remaining console.log statements

## Checklist

- [ ] Install pino and pino-pretty
- [ ] Test logger with `logger.test.ts`
- [ ] Identify all files with console.log
- [ ] Migrate critical paths
- [ ] Migrate API endpoints
- [ ] Migrate service classes
- [ ] Update background jobs
- [ ] Test in development mode
- [ ] Test in production mode
- [ ] Remove remaining console.log statements
- [ ] Update documentation

## Getting Help

For questions or issues:

1. Check the examples in `logger.example.ts`
2. Review the documentation in `LOGGER_README.md`
3. Look at the Pino documentation: https://getpino.io/

## Next Steps

After migration:

1. Set up log aggregation (ELK, Datadog, etc.)
2. Create dashboards for monitoring
3. Set up alerts for error logs
4. Configure log rotation and retention
5. Add custom serializers for domain objects
