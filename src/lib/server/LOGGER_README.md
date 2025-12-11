# Structured Logging with Pino

This directory contains a comprehensive structured logging solution for the TeamTime application using [Pino](https://github.com/pinojs/pino), a high-performance JSON logger.

## Installation

Before using the logger, install the required dependencies:

```bash
npm install pino pino-pretty
```

Or if you use yarn:

```bash
yarn add pino pino-pretty
```

## Quick Start

### Basic Usage

```typescript
import { logger, createLogger } from '$lib/server/logger';

// Use the root logger
logger.info('Application started');

// Create a module-specific logger
const log = createLogger('auth');
log.info('User logged in', { userId: '123' });
log.error('Failed to authenticate', { error: err.message });
```

## Features

### 1. Environment-Based Configuration

The logger automatically configures itself based on the `NODE_ENV` environment variable:

- **Development**: Pretty-printed, colorized output for easy reading
- **Production**: JSON-formatted output optimized for log aggregation systems

### 2. Log Levels

The logger supports the following log levels (in order of severity):

- `trace` - Very detailed debugging information
- `debug` - Debugging information
- `info` - Informational messages
- `warn` - Warning messages
- `error` - Error messages
- `fatal` - Fatal error messages

Set the log level via the `LOG_LEVEL` environment variable:

```bash
# .env
LOG_LEVEL=debug
```

### 3. Automatic Secret Redaction

The logger automatically redacts sensitive information from logs:

- Passwords
- Tokens
- API keys
- Secrets
- Authorization headers
- And more...

These fields will be replaced with `[REDACTED]` in the log output.

### 4. Child Loggers

Create child loggers for specific modules to add context to all log entries:

```typescript
const authLog = createLogger('auth');
authLog.info('Processing login', { username: 'john' });
// Output: {"level":"INFO","module":"auth","msg":"Processing login","username":"john"}
```

### 5. Request Logging

Create request-specific loggers to track the entire lifecycle of a request:

```typescript
import { createRequestLogger } from '$lib/server/logger';

export async function load({ request }) {
	const log = createRequestLogger('api', crypto.randomUUID(), {
		path: request.url,
		method: request.method,
	});

	log.info('Request received');
	// ... process request ...
	log.info('Request completed', { statusCode: 200 });
}
```

### 6. Error Logging Helper

Use the `logError` helper to log errors with full stack traces:

```typescript
import { createLogger, logError } from '$lib/server/logger';

const log = createLogger('database');

try {
	await db.query('...');
} catch (err) {
	logError(log, err as Error, {
		query: '...',
		userId: '123',
	});
}
```

## Usage Examples

### In SvelteKit Load Functions

```typescript
// src/routes/users/[id]/+page.server.ts
import { createRequestLogger, logError } from '$lib/server/logger';
import { error } from '@sveltejs/kit';

export async function load({ params, request }) {
	const log = createRequestLogger('users-page', crypto.randomUUID(), {
		userId: params.id,
		path: request.url,
	});

	log.info('Loading user page');

	try {
		const user = await db.users.findById(params.id);

		if (!user) {
			log.warn('User not found', { userId: params.id });
			throw error(404, 'User not found');
		}

		log.info('User page loaded', { userId: params.id });
		return { user };
	} catch (err) {
		logError(log, err as Error, { userId: params.id });
		throw err;
	}
}
```

### In API Endpoints

```typescript
// src/routes/api/users/+server.ts
import { createRequestLogger, logError } from '$lib/server/logger';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
	const log = createRequestLogger('users-api', crypto.randomUUID(), {
		method: 'POST',
		path: '/api/users',
	});

	log.info('Creating new user');

	try {
		const data = await request.json();
		log.debug('Request data received', { email: data.email });

		const user = await createUser(data);

		log.info('User created successfully', { userId: user.id });
		return json(user, { status: 201 });
	} catch (err) {
		logError(log, err as Error);
		return json({ error: 'Failed to create user' }, { status: 500 });
	}
}
```

### In Service Classes

```typescript
// src/lib/server/services/user-service.ts
import { createLogger, logError } from '$lib/server/logger';

export class UserService {
	private log = createLogger('user-service');

	async createUser(data: CreateUserData) {
		this.log.info('Creating user', { email: data.email });

		try {
			const user = await this.db.users.create(data);

			this.log.info('User created', {
				userId: user.id,
				email: user.email,
			});

			return user;
		} catch (err) {
			logError(this.log, err as Error, { email: data.email });
			throw err;
		}
	}

	async deleteUser(userId: string) {
		this.log.warn('Deleting user', { userId });

		try {
			await this.db.users.delete(userId);
			this.log.info('User deleted', { userId });
		} catch (err) {
			logError(this.log, err as Error, { userId });
			throw err;
		}
	}
}
```

### In Background Jobs

```typescript
// src/lib/server/jobs/sync-inventory.ts
import { createLogger, logError } from '$lib/server/logger';

export async function syncInventory() {
	const log = createLogger('inventory-sync');
	const jobId = crypto.randomUUID();
	const startTime = Date.now();

	log.info('Starting inventory sync', { jobId });

	try {
		const items = await fetchExternalInventory();
		log.debug('Fetched items', { count: items.length });

		const updated = await updateLocalInventory(items);

		const duration = Date.now() - startTime;
		log.info('Inventory sync completed', {
			jobId,
			itemsUpdated: updated,
			duration,
		});
	} catch (err) {
		const duration = Date.now() - startTime;
		logError(log, err as Error, { jobId, duration });

		log.error('Inventory sync failed', {
			jobId,
			duration,
			willRetry: true,
		});

		throw err;
	}
}
```

### Performance Monitoring

```typescript
import { createLogger } from '$lib/server/logger';

const perfLog = createLogger('performance');

export async function slowOperation() {
	const operationId = crypto.randomUUID();
	const startTime = Date.now();

	perfLog.info('Operation started', {
		operationId,
		operation: 'data-processing',
	});

	try {
		const result = await processData();

		const duration = Date.now() - startTime;
		perfLog.info('Operation completed', {
			operationId,
			duration,
			recordsProcessed: result.count,
		});

		return result;
	} catch (err) {
		const duration = Date.now() - startTime;
		logError(perfLog, err as Error, {
			operationId,
			duration,
		});
		throw err;
	}
}
```

### Security Audit Logging

```typescript
import { createLogger } from '$lib/server/logger';

const securityLog = createLogger('security');

export function logSecurityEvent(event: SecurityEvent) {
	if (event.severity === 'high') {
		securityLog.error('Security violation', {
			event: event.type,
			userId: event.userId,
			resource: event.resource,
			action: event.action,
			blocked: event.blocked,
			timestamp: event.timestamp,
		});
	} else if (event.severity === 'medium') {
		securityLog.warn('Security warning', {
			event: event.type,
			userId: event.userId,
			details: event.details,
		});
	} else {
		securityLog.info('Security event', {
			event: event.type,
			userId: event.userId,
		});
	}
}
```

## Configuration

### Environment Variables

```bash
# .env

# Log level (trace, debug, info, warn, error, fatal)
LOG_LEVEL=info

# Environment (affects output format)
NODE_ENV=production
```

### Customizing the Logger

If you need to customize the logger configuration, edit `src/lib/server/logger.ts`:

```typescript
// Add custom serializers
const logger = pino({
	...createLoggerConfig(),
	serializers: {
		user: (user) => {
			return {
				id: user.id,
				email: user.email,
				// Don't log sensitive fields
			};
		},
	},
});
```

## Best Practices

### 1. Use Module-Specific Loggers

Always create a logger for your module:

```typescript
const log = createLogger('my-module');
```

This makes it easy to filter logs by module in production.

### 2. Log Structured Data

Use objects for structured data instead of string interpolation:

```typescript
// Good
log.info('User created', { userId: user.id, email: user.email });

// Bad
log.info(`User created: ${user.id} - ${user.email}`);
```

### 3. Include Context

Always include relevant context in your logs:

```typescript
log.error('Database query failed', {
	query: 'SELECT * FROM users',
	error: err.message,
	userId: userId,
	timestamp: new Date().toISOString(),
});
```

### 4. Use Appropriate Log Levels

- `error`: Use for actual errors that need attention
- `warn`: Use for concerning situations that aren't errors
- `info`: Use for normal operational messages
- `debug`: Use for detailed debugging information

### 5. Don't Log Sensitive Data

The logger will automatically redact common sensitive fields, but be mindful of logging:

- Passwords
- Credit card numbers
- Personal identification numbers
- Any other PII or sensitive data

### 6. Performance Considerations

If generating log data is expensive, check the log level first:

```typescript
if (log.isLevelEnabled('debug')) {
	const expensiveData = generateComplexDebugInfo();
	log.debug('Complex debug info', expensiveData);
}
```

## Output Examples

### Development Output (Pretty Print)

```
[10:30:45.123] INFO (auth): User logged in
    userId: "123"
    sessionId: "abc-def-ghi"
    ip: "192.168.1.1"
```

### Production Output (JSON)

```json
{
	"level": "INFO",
	"time": "2024-12-11T10:30:45.123Z",
	"module": "auth",
	"msg": "User logged in",
	"userId": "123",
	"sessionId": "abc-def-ghi",
	"ip": "192.168.1.1"
}
```

## Integration with Log Aggregation

The JSON output in production is designed to work seamlessly with log aggregation systems like:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Splunk**
- **Datadog**
- **New Relic**
- **CloudWatch Logs**
- **Papertrail**

Simply configure your log shipper to collect logs from your application's stdout/stderr.

## Troubleshooting

### Logs not appearing

Check your `LOG_LEVEL` environment variable. If it's set too high, lower-level logs won't appear.

### Pretty print not working in development

Ensure `pino-pretty` is installed:

```bash
npm install pino-pretty
```

### Want to change log format

Edit the `createLoggerConfig()` function in `src/lib/server/logger.ts` to customize the output format.

## Additional Resources

- [Pino Documentation](https://getpino.io/)
- [Pino Best Practices](https://getpino.io/#/docs/best-practices)
- [Pino API Reference](https://getpino.io/#/docs/api)

## Files in this Module

- `logger.ts` - Main logger implementation
- `logger.example.ts` - Comprehensive usage examples
- `LOGGER_README.md` - This documentation file
