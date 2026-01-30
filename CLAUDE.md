# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TeamTime** is a mobile-first workforce operations platform built with SvelteKit for field teams, estate sales crews, and retail operations. It combines time tracking, task management, inventory processing, expense tracking, team messaging, and gamification with three autonomous AI agents ("Shackled Mentats").

## Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:5173)
npm run check            # Type check with svelte-kit sync

# Database (Drizzle ORM + PostgreSQL)
npm run db:generate      # Generate migrations from schema
npm run db:push          # Apply schema changes directly
npm run db:migrate       # Run pending migrations
npm run db:studio        # Drizzle Studio GUI

# Testing
npm run test             # Vitest in watch mode
npm run test:run         # Run tests once
npm run test:coverage    # Coverage report
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:ui      # Playwright UI mode

# Build & Deploy
npm run build            # Production build
npm run preview          # Preview production build
```

**Run a single test:**
```bash
npx vitest run path/to/test.ts
npx playwright test tests/e2e/specific.test.ts
```

## Architecture

### Tech Stack
- **Frontend:** SvelteKit 2.5, Svelte 4, TypeScript, TailwindCSS, Workbox (PWA)
- **Backend:** Node.js 18+, PostgreSQL 15, Drizzle ORM, Lucia v3 auth
- **AI:** Anthropic Claude, OpenAI, Segmind (multi-provider with hot-reload config)

### Core Structure

```
src/
├── lib/
│   ├── ai/                    # AI system (3 autonomous agents)
│   │   ├── office-manager/    # Runs every 15min, 22+ tools
│   │   ├── architect/         # Ada - architecture advisor
│   │   ├── tools/             # 40+ pluggable AI tools
│   │   ├── context/           # Context providers for AI
│   │   └── providers/         # LLM integrations
│   │
│   ├── server/
│   │   ├── db/schema.ts       # 48 tables, all data models (2400+ lines)
│   │   ├── auth/              # Lucia + granular permissions
│   │   ├── services/          # Business logic layer
│   │   └── jobs/              # Background task processing
│   │
│   ├── components/            # Reusable Svelte components
│   └── utils/                 # Client utilities
│
├── routes/
│   ├── (app)/                 # Protected routes (requires auth)
│   │   ├── admin/             # 22+ admin routes
│   │   ├── tasks/             # Task management
│   │   ├── pricing/           # Item pricing workflow
│   │   ├── inventory/         # AI inventory drops
│   │   └── ...
│   │
│   ├── api/                   # REST API (64+ endpoints)
│   └── login/, logout/, etc.  # Public auth routes

tests/
├── unit/                      # Vitest unit tests
├── api/                       # API integration tests
└── e2e/                       # Playwright E2E tests
```

### Key Patterns

1. **Schema-First Development:** `src/lib/server/db/schema.ts` defines all 48 tables - read this to understand the data model

2. **Permission System:** Beyond roles, uses custom user types with granular action-level permissions. See `src/lib/server/auth/permissions.ts`

3. **AI Tool System:** Tools are defined in `src/lib/ai/tools/` with hot-reloadable config. Each tool has execute function + description for LLM

4. **Context Providers:** `src/lib/ai/context/` assembles relevant data for AI agents based on trigger keywords

5. **Service Layer:** Business logic in `src/lib/server/services/` (points, achievements, task rules, visibility)

### The Three AI Agents

| Agent | Schedule | Purpose |
|-------|----------|---------|
| **Office Manager** | Every 15min (7am-7pm) | Attendance, tasks, messaging (22+ tools) |
| **Revenue Optimizer** | Nightly | Pattern analysis, policy creation |
| **Ada (Architect)** | On-demand | Code analysis, ADR generation |

AI config lives in database + `src/lib/ai/config/`. Admin panel at `/admin/ai` for tool toggles.

### Authentication Flow

- Email + PIN with Argon2 hashing
- Email-based 2FA verification
- Session management via Lucia v3
- Permissions loaded in `hooks.server.ts` on every request

## Database

PostgreSQL with Drizzle ORM. Schema file is the source of truth:
- `src/lib/server/db/schema.ts` - All table definitions
- `drizzle/` - Generated migrations
- `drizzle.config.ts` - ORM configuration

51 tables covering: users, sessions, time entries, tasks, inventory, pricing, expenses, messaging (with group chats and threads), gamification (10 levels, 17 achievement types), AI system, audit logs.

### Group Chat & Threads

The messaging system supports:
- **Group Chats:** Admin-managed groups with member add/remove
- **Auto-Synced Groups:** Each user type automatically gets a group (syncs membership)
- **Custom Groups:** Admins can create arbitrary groups beyond user types
- **Threaded Replies:** Slack-style threads (click message to open thread panel)

Key files:
- `src/lib/server/services/group-sync.ts` - Group synchronization service
- `src/routes/(app)/admin/groups/` - Admin group management UI
- `src/routes/api/groups/` - Groups REST API
- Database tables: `groups`, `group_members`, `thread_participants`

## Environment Variables

Required in `.env`:
```
DATABASE_URL                # PostgreSQL connection string
AUTH_SECRET                 # Session encryption (32+ chars)
GOOGLE_MAPS_API_KEY        # Maps/geocoding
```

Optional for full functionality:
```
VAPID_PUBLIC_KEY/PRIVATE   # Web push notifications
SMTP_*                      # Email service
TWILIO_*                    # SMS integration
CRON_SECRET                 # AI trigger authentication
```

## Testing

- **Unit tests:** Vitest with happy-dom, `tests/unit/`
- **E2E tests:** Playwright with Chromium, `tests/e2e/`
- **Test setup:** `tests/setup.ts` for globals, `tests/mocks/` for SvelteKit mocks
- Coverage: v8 provider with HTML reports

## Key Files to Understand First

1. `src/lib/server/db/schema.ts` - Complete data model
2. `src/hooks.server.ts` - Request lifecycle, auth, permissions
3. `src/lib/ai/types.ts` - AI system interfaces
4. `README.md` - Feature overview
5. `FEATURES.md` - Detailed feature documentation

## Timezone Handling

All times are Pacific Time with DST support. Use utilities in `src/lib/server/utils/timezone.ts` for conversions.

## Security Rules - CRITICAL

### Files to NEVER Read or Commit
- `.env`, `.env.local`, `.env.production` - Contains secrets
- `.ai-keys.json` - AI provider API keys
- Any `*.pem`, `*.key` files - Private keys/certificates

### Git Safety
- **ALWAYS** create new commits, never amend unless explicitly requested
- **NEVER** force push to main/master
- **NEVER** use `--no-verify` to skip pre-commit hooks
- Run `npm run check` before committing TypeScript changes

### Dangerous Operations - REQUIRE CONFIRMATION
Stop and ask before:
- Deleting database tables or running destructive migrations
- Modifying production environment variables
- Running `rm -rf` on any directory
- Force pushing to any branch

### Code Quality
- Run `npm run check` to verify TypeScript before suggesting code is complete
- Follow existing patterns in the codebase
- Keep changes minimal - don't over-engineer or add unnecessary abstractions
