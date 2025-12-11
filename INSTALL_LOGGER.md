# Structured Logger Installation Guide

This guide will help you install and verify the Pino structured logging system for TeamTime.

## Quick Start

### 1. Install Dependencies

```bash
npm install pino pino-pretty
```

Or with yarn:

```bash
yarn add pino pino-pretty
```

### 2. Verify Installation

After installation, verify the logger works:

```bash
# Run the test file to see the logger in action
npx tsx src/lib/server/logger.test.ts
```

You should see colorized, pretty-printed logs in your terminal.

### 3. Basic Usage

Create a simple test to verify everything works:

```typescript
// test-logger.ts
import { createLogger } from './src/lib/server/logger';

const log = createLogger('test');
log.info('Logger is working!', { status: 'success' });
```

Run it:

```bash
npx tsx test-logger.ts
```

## What's Installed

The logging system includes:

### Core Files

- **`src/lib/server/logger.ts`** - Main logger implementation
  - Exports: `logger`, `createLogger`, `logError`, `createRequestLogger`
  - Auto-configures based on NODE_ENV
  - Automatic secret redaction
  - TypeScript types included

### Documentation

- **`src/lib/server/LOGGER_README.md`** - Complete usage documentation
- **`src/lib/server/LOGGER_MIGRATION.md`** - Migration guide for existing code
- **`src/lib/server/logger.example.ts`** - 12 comprehensive examples
- **`src/lib/server/logger.test.ts`** - Integration tests

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Log level (trace, debug, info, warn, error, fatal)
# Default: 'debug' in development, 'info' in production
LOG_LEVEL=debug

# Environment (affects output format)
# Default: 'development'
NODE_ENV=development
```

### Log Levels Explained

- `trace` - Very detailed debugging (rarely used)
- `debug` - Debugging information for development
- `info` - Normal operational messages (default for production)
- `warn` - Warning messages for concerning situations
- `error` - Error messages that need attention
- `fatal` - Fatal errors that cause application shutdown

## Verification Steps

### Step 1: Check package.json

Verify pino is installed:

```bash
grep -A 2 "pino" package.json
```

You should see:

```json
"pino": "^9.x.x",
"pino-pretty": "^11.x.x"
```

### Step 2: Run Test Suite

```bash
npx tsx src/lib/server/logger.test.ts
```

Expected output (in development mode):

```
=== Test 1: Basic Logging ===
[HH:MM:SS.mmm] INFO: Application test started

=== Test 2: Module-Specific Logger ===
[HH:MM:SS.mmm] INFO (auth): User authentication attempt
    username: "testuser"
    ip: "127.0.0.1"

=== Test 3: Error Logging ===
[HH:MM:SS.mmm] ERROR (database): Simulated database connection error
    err: {
      message: "Simulated database connection error"
      stack: "Error: Simulated database..."
    }
...
```

### Step 3: Test in Your Application

Create a simple test in any server file:

```typescript
// src/routes/api/test-logger/+server.ts
import { createLogger } from '$lib/server/logger';
import { json } from '@sveltejs/kit';

const log = createLogger('test-api');

export async function GET() {
	log.info('Test endpoint called');
	log.debug('Testing debug logs', { timestamp: new Date().toISOString() });

	return json({ status: 'Logger working!' });
}
```

Access `http://localhost:5173/api/test-logger` and check your terminal for logs.

## Troubleshooting

### Issue: Module not found error

**Error:**
```
Cannot find module 'pino'
```

**Solution:**
```bash
npm install pino pino-pretty
```

### Issue: Types not found

**Error:**
```
Cannot find type definitions for 'pino'
```

**Solution:**
Pino includes its own TypeScript definitions. Make sure you have TypeScript 5.0+ installed:

```bash
npm install -D typescript@latest
```

### Issue: Pretty print not working

**Error:** Logs are in JSON format even in development

**Solution:**
1. Verify `pino-pretty` is installed: `npm list pino-pretty`
2. Check `NODE_ENV`: `echo $NODE_ENV`
3. Ensure `.env` has `NODE_ENV=development`

### Issue: Logs not appearing

**Solution:**
Check your `LOG_LEVEL` environment variable. If it's set too high (e.g., `error`), you won't see `info` or `debug` logs.

```bash
# .env
LOG_LEVEL=debug  # Set to lowest level for testing
```

## Next Steps

### 1. Review Documentation

- Read `src/lib/server/LOGGER_README.md` for complete usage guide
- Check `src/lib/server/logger.example.ts` for real-world examples

### 2. Start Using in Your Code

```typescript
import { createLogger } from '$lib/server/logger';

const log = createLogger('your-module');
log.info('Your first log message!');
```

### 3. Migrate Existing Code

Follow the migration guide in `src/lib/server/LOGGER_MIGRATION.md` to replace `console.log` statements.

### 4. Set Up Log Aggregation (Optional)

For production, consider setting up log aggregation:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Datadog**
- **New Relic**
- **CloudWatch Logs** (AWS)
- **Google Cloud Logging** (GCP)

## Production Deployment

### Before deploying to production:

1. **Set correct environment:**
   ```bash
   NODE_ENV=production
   LOG_LEVEL=info
   ```

2. **Verify JSON output:**
   ```bash
   NODE_ENV=production npx tsx src/lib/server/logger.test.ts
   ```

   You should see JSON-formatted logs:
   ```json
   {"level":"INFO","time":"2024-12-11T...","msg":"Application test started"}
   ```

3. **Configure log rotation** (optional but recommended):
   ```bash
   npm install pino-rotating-file-stream
   ```

4. **Set up monitoring:**
   - Configure alerts for `error` and `fatal` logs
   - Set up dashboards for key metrics
   - Monitor log volume

## Performance Notes

Pino is designed for high performance:

- **Fast:** 5-10x faster than other Node.js loggers
- **Async:** Non-blocking I/O
- **Low overhead:** Minimal CPU usage
- **Production-ready:** Used by major companies

The logger adds negligible overhead to your application.

## Feature Highlights

✅ **Environment-aware**: Auto-configures for dev/prod
✅ **Type-safe**: Full TypeScript support
✅ **Secure**: Automatic secret redaction
✅ **Structured**: JSON logs for easy parsing
✅ **Modular**: Child loggers for organized logging
✅ **Pretty**: Beautiful dev output with colors
✅ **Fast**: High-performance logging
✅ **Standards**: Compatible with log aggregation tools

## Support

For help:

1. Check the [Pino documentation](https://getpino.io/)
2. Review examples in `logger.example.ts`
3. Read the migration guide in `LOGGER_MIGRATION.md`

## Summary

You now have a production-ready structured logging system!

**Files created:**
- ✅ `src/lib/server/logger.ts` - Main logger
- ✅ `src/lib/server/logger.example.ts` - Examples
- ✅ `src/lib/server/logger.test.ts` - Tests
- ✅ `src/lib/server/LOGGER_README.md` - Documentation
- ✅ `src/lib/server/LOGGER_MIGRATION.md` - Migration guide
- ✅ `INSTALL_LOGGER.md` - This file

**What to do next:**
1. Install dependencies: `npm install pino pino-pretty`
2. Run tests: `npx tsx src/lib/server/logger.test.ts`
3. Start using: `import { createLogger } from '$lib/server/logger'`

Happy logging!
