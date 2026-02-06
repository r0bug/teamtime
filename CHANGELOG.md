# Changelog

All notable changes to the TeamTime project will be documented in this file.

## [1.2.0] - 2026-02-06

### Admin Workflow Improvements (Phase 6)
- Added bulk pricing grading — select multiple ungraded items and apply grades in one action (up to 50 at a time)
- Added floating action bar with grade sliders, overall grade preview, and points preview
- New `POST /api/admin/pricing/bulk-grade` endpoint with full points/stats/achievements integration
- Added auto till count setup wizard on cash counts admin page — one-click rule creation for clock-in cash count tasks
- Added enable/disable/delete controls for existing auto-assignment rules
- Added 7 preset templates for task assignment rules (Opening/Closing Till, First-In/Last-Out, Mid-Shift Check, Daily Scheduled, Post-Task Follow-Up)
- Preset cards pre-fill trigger type, assignment type, task type, and sensible defaults
- Increased pricing grading queue limit from 50 to 100

## [1.1.0] - 2026-02-06

### AI Agent Optimization (Phase 0)
- Added pre-flight triage gating to Office Manager — skips LLM calls when nothing is actionable (~60-80% token savings on empty runs)
- Added trigger-based context loading — only loads relevant context providers based on what triggered the run
- Added context caching across iterations — prevents redundant context assembly in multi-step actions
- Reduced max iterations from 5 to 3 for Office Manager
- Revenue Optimizer now runs conditionally — skips if < 3 time entries in last 24h or already ran within 7 days
- Revenue Optimizer context limit reduced from 8000 to 3000 tokens
- Added memory write cap (max 3 per run) for Revenue Optimizer
- Architect smart tier selection — expanded quick patterns, most queries now use 1 model instead of 3
- Shared tool results in deliberate mode — review model receives primary model's tool outputs
- Added `aiTokenUsage` table and `/admin/ai/usage` dashboard for monitoring token spend
- Added `lastReadAt` column to `aiMemory` table for tracking memory consumption

### Safety Net & Infrastructure (Phase 1)
- Created automated backup system (`scripts/backup.sh`) with pg_dump + rsync to remote
- Created disaster recovery script (`scripts/restore.sh`)
- Added `/api/health` endpoint (DB connectivity, disk space, uptime)
- Added GitHub Actions CI/CD pipeline (type check, test, build)
- Added structured request logging in `hooks.server.ts` (method, path, status, duration)

### Spec Alignment (Phase 2)
- Implemented module enable/disable system — admins toggle modules in settings, navigation hides disabled modules
- Added CSV/JSON export system (`/api/export/[type]`) for time entries and tasks with date range filtering
- Added broadcast shift request workflow — managers create requests, staff accept/decline
- Schema: `shiftRequests` and `shiftRequestResponses` tables with full API endpoints

### Industry Standards & Code Quality (Phase 3)
- Fixed type safety: added `userTypeId` to Lucia's `DatabaseUserAttributes`, removed `as any` cast in permissions
- Created centralized error handler (`src/lib/server/error-handler.ts`)
- Added client-side error handling (`src/hooks.client.ts`)
- Added `gamificationConfig` table for database-driven game mechanics
- Created gamification admin page (`/admin/gamification`) for editing point values, streak multipliers, and level thresholds
- Added bulk operations API for tasks (`/api/tasks/bulk`) and users (`/api/admin/users/bulk`)

### Ergonomic Usability (Phase 4)
- Added global search command palette (Ctrl+K / Cmd+K) with unified search across users, tasks, messages
- Added keyboard shortcut system with two-key sequences (g+h, g+t, g+m, g+s, g+l)
- Added shortcut help overlay (press ? to show)
- Added connection status indicator (offline banner + reconnection toast)
- Added configurable skeleton loader component (text/card/list types)
- Added swipeable card component for mobile gestures
- Added token usage link to admin AI navigation section

### Documentation (Phase 5)
- Updated CLAUDE.md with accurate table counts (93), endpoint counts (100+), and new infrastructure docs
- Created CHANGELOG.md

### Database Migrations
- `0017_magical_captain_cross.sql` — aiTokenUsage table, aiMemory.lastReadAt column
- `0018_noisy_bug.sql` — shiftRequests, shiftRequestResponses, gamificationConfig tables

## [1.0.0-alpha] - Previous

Initial release with core functionality:
- Time tracking with clock in/out and geolocation
- Task management with templates and recurring rules
- Team messaging with group chats and threads
- Gamification with 10 levels, 17 achievement types, and leaderboard
- Three AI agents (Office Manager, Revenue Optimizer, Architect)
- Expense tracking with ATM withdrawal allocations
- Inventory processing with AI-powered drops
- Schedule management
- Admin dashboard with user management, audit logs, and analytics
