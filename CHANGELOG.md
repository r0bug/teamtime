# Changelog

All notable changes to the TeamTime project will be documented in this file.

## [1.3.0] - 2026-07-24

### Floorplan (Booth Map)
- Cell-based spatial store (`/floorplan`): the sales floor as a sparse grid of 1 ft² cells; a booth is the set of cells sharing a `vendor_id`, so booth size is always a derived count
- Three-mode canvas editor (View / Edit / Build) with cell/rect/wall/fill tools, eyedropper, per-stroke undo, zoom-pan, and door-reachability check
- Vendor pools, picker curation, custom vendor colors; NRS/TeamTime connectors with a flag-only sync cron and a derived count cache
- **Saved layout snapshots** — save the whole floor as a named layout and revert; restore auto-backs-up the pre-restore state first (itself revertible), auto-backups pruned to 10
- New tables: `floorplan_plans`, `floorplan_cell_attrs`, `floorplan_attr_defs`, `floorplan_connectors`, `floorplan_cell_count_cache`, `floorplan_pools`, `floorplan_snapshots`

### Payroll Export → NRS
- New `/admin/payroll` screen: TeamTime is now the clock of record for payroll. Per-employee Regular + Overtime hours for a pay period, computed from clock records with the break allowance; overtime split by WA rule (>40 h per Sun–Sat workweek, per week)
- Staff↔NRS employee mapping via new `users.nrs_employee_id` (name-suggested from the NRS `employee/list` API); CSV export; graceful when NRS is unreachable
- New shared `pay-period-service` (current + recent periods for semi-monthly/weekly/monthly), `payroll-export-service`, and `getEmployees()` in the NRS client
- NRS has no payroll-write API, so this is an export the clerk keys/imports; Holiday/PTO/Sick stay manual until paid leave is modeled

### Scheduling
- **Fixed:** staff schedule week navigation now round-trips to the server, so next/previous week loads its shifts (was client-only paging that showed empty days); added a "Today" button
- Scheduling selectors are **staff-only** — vendor-type users excluded across admin schedule, manage, and templates; staff who also sell as vendors stay schedulable; shift-create actions reject vendor users server-side
- Dashboard **"My Shifts"** card — each staff member's past (with worked hours) and upcoming shifts for the current pay period

### Vendor Newsletters
- Block-composed staff→vendor mailings (`/admin/vendors/newsletters`) with markdown/tips/sales-chart/leaderboard/shoutouts/events blocks, draft→sent lifecycle, scheduled + monthly-recurring sends, per-vendor delivery log; vendors read at `/vendor/newsletters`
- New tables: `vendor_newsletters`, `vendor_newsletter_sends`

### Build / Tooling
- **Migration workflow repaired** — `db:generate`/`db:migrate` work again (drizzle-kit 0.20 command names); the drizzle meta snapshot was re-baselined against `schema.ts` (old files archived under `drizzle/legacy/`); `db:migrate` now applies `drizzle/NNNN_*.sql` tracked per-database in a `_migrations` table (`--baseline` records without running). Generated migration SQL is now versioned in git (root cause of prior schema drift: `/drizzle/*.sql` was gitignored)

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
