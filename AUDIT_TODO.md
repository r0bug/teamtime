# Clock-Out & Attendance System — Audit TODO

Generated: 2026-03-12

---

## Critical

*(none remaining)*

---

## High

*(none remaining)*

---

## Medium

*(none remaining)*

---

## Low

*(none remaining)*

---

## Already Fixed (2026-03-12)

- [x] **Missing cron entry for `/api/clock/cron`** — Added to crontab
- [x] **Schema mismatch: `user_reply` and `replied_at` columns** — Added to DB
- [x] **Shift lookup found today's upcoming shift instead of yesterday's** — Changed to clock-in-relative 2-hour window

## Already Fixed (2026-04-16)

- [x] **Operational hours timezone bug in Office Manager** — swapped `getHours()/getDay()` → `getPacificHour()/getPacificWeekday()` in `office-manager.ts:201-203`
- [x] **Missing try/catch around cron services** — wrapped `checkOverdueClockOuts` and `checkLateArrivals` in independent try/catch in `cron/+server.ts`
- [x] **Non-deterministic admin selection** — added `.orderBy(asc(users.createdAt))` in `cron/+server.ts`
- [x] **SMS nag2 rounds hours misleadingly** — swapped `Math.round` → `toFixed(1).replace(/\.0$/, '')` in `clock-out-warning-service.ts`
- [x] **Missing database indexes** — transferred `time_entries` and `users` ownership from postgres → teamtime via `sudo -u postgres psql -c "ALTER TABLE ... OWNER TO teamtime"`, then created `time_entries_user_id_idx` and `users_phone_idx` as the app user
- [x] **Race condition between AI Office Manager and Clock Cron** — `clock_user` tool now queries `clock_out_warnings` for entries with a row in the last 30 minutes and skips, preventing duplicate SMS / points / audit records
- [x] **Shift lookup misses early/late clock-ins (>2 hours off)** — added fallback that finds the nearest shift on the same Pacific day when the ±2hr window misses
- [x] **Nag timing compression for no-shift users** — synthetic shift end is now `clockIn + config.maxHoursClockedIn` (was hard-coded `+ 8h`) so Nag 1/2 stay ~60min apart
- [x] **Fallback system user ID may cause FK violation** — created real `system@teamtime.local` user row (role=admin, is_active=false); cron resolves by email with oldest-admin fallback, returns 500 if neither exists
- [x] **`requiresConfirmation` flag bypassed in cron mode** — removed the declaration (dead config); cooldowns still enforced via `cooldown.perUser`
- [x] **`rateLimit.maxPerHour` never enforced** — removed the declaration from `clock_user` tool (dead config, no orchestrator reads it)
- [x] **Late arrival time-entry matching too broad for split shifts** — narrowed leftJoin to `${shifts.startTime} ± interval '2 hours'` (was day-match)
- [x] **16-hour forgotten clock-out threshold in AI is a dead letter** — lowered to 5 hours to act as a safety net when clock-cron fails to auto-close an entry
