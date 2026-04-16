# Clock-Out & Attendance System — Audit TODO

Generated: 2026-03-12

---

## Critical

- [ ] **Race condition: AI Office Manager vs Clock Cron can double-process clock-outs**
  - Both `/api/ai/cron` (Office Manager) and `/api/clock/cron` can clock out the same user simultaneously
  - No mutex, advisory lock, or coordination between them
  - Clock cron sets `clockOut = shiftEndTime` (correct for payroll); AI tool sets `clockOut = now()` (hours later)
  - If both fire, user gets double SMS, double point deductions, duplicate audit records
  - **Files:** `src/lib/ai/orchestrators/office-manager.ts`, `src/lib/ai/tools/office-manager/clock-user.ts`, `src/routes/api/clock/cron/+server.ts`
  - **Fix:** Add a check in the AI `clock_user` tool to skip users who already have a recent `clock_out_warnings` record, or add a DB advisory lock in `checkOverdueClockOuts`

---

## High

*(none remaining)*

---

## Medium

- [ ] **Shift lookup misses early/late clock-ins (>2 hours off)**
  - The 2-hour window around clock-in time works for normal cases
  - If someone clocks in >2 hours early or >2 hours late, their shift isn't found
  - Fallback logic (clockIn + 8h) kicks in, which could trigger premature warnings
  - **File:** `src/lib/server/services/clock-out-warning-service.ts` lines 556-572
  - **Fix:** Widen the window or add a secondary lookup that finds the nearest shift for the user on that calendar day

- [ ] **Nag timing compression for no-shift users**
  - `maxHoursClockedIn` is 10 but synthetic shift end is `clockIn + 8h`
  - When first warning fires at 10h, `minutesPastShiftEnd` is already 120 min
  - Nag 1 and Nag 2 fire only 15 minutes apart instead of ~60 minutes
  - **File:** `src/lib/server/services/clock-out-warning-service.ts` lines 578-583
  - **Fix:** Either set synthetic shift end to `clockIn + maxHoursClockedIn` or reduce `maxHoursClockedIn` to match

- [ ] **Fallback system user ID may cause FK violation**
  - `SYSTEM_USER_ID_FALLBACK = '00000000-0000-0000-0000-000000000000'` used when no admin exists
  - If `demerits.issued_by` has a FK constraint to `users`, demerit creation will fail
  - **File:** `src/routes/api/clock/cron/+server.ts` lines 26, 66-79
  - **Fix:** Create an actual system user record in the DB, or make `issuedBy` nullable for system-generated demerits

---

## Low

- [ ] **Missing database indexes** (BLOCKED: postgres-owned tables)
  - `time_entries_user_id_idx` on `time_entries(user_id)` — defined in schema.ts but missing from DB
  - `users_phone_idx` on `users(phone)` — defined in schema.ts but missing from DB
  - Attempted 2026-04-16 as teamtime role: `ERROR: must be owner of table`
  - **Fix:** Needs sudo — either `sudo -u postgres psql <db> -c "ALTER TABLE time_entries OWNER TO teamtime; ALTER TABLE users OWNER TO teamtime;"` then run CREATE INDEX as teamtime, OR run CREATE INDEX directly as postgres role.

- [ ] **`requiresConfirmation` flag bypassed in cron mode**
  - `clock_user` tool declares `requiresConfirmation: true` (line 63)
  - Chat orchestrator enforces it; cron orchestrator ignores it entirely
  - AI can autonomously clock users in/out during cron runs with no human approval
  - **File:** `src/lib/ai/orchestrators/office-manager.ts` (~line 399)
  - **Fix:** Either enforce in cron mode or document as intentional and remove the flag

- [ ] **`rateLimit.maxPerHour` never enforced**
  - `clock_user` tool declares `maxPerHour: 20` but neither orchestrator checks it
  - Dead configuration across the entire AI tool system
  - **File:** `src/lib/ai/tools/office-manager/clock-user.ts` line 69


- [ ] **Late arrival time-entry matching too broad for split shifts**
  - Matches any time entry on or after the shift's date (midnight), not the specific shift
  - Split-shift workers could have false negatives (missed late arrival warnings)
  - **File:** `src/lib/server/services/late-arrival-warning-service.ts` ~line 338


- [ ] **16-hour forgotten clock-out threshold in AI is a dead letter**
  - Office Manager pre-flight checks for users clocked in >16 hours
  - Clock cron already auto-clocks out at ~3 hours past shift end
  - The AI threshold will almost never trigger because the clock cron handles it first
  - **File:** `src/lib/ai/orchestrators/office-manager.ts` lines 79-88
  - **Fix:** Lower to 4-6 hours to serve as a safety net, or remove if clock cron is reliable

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
