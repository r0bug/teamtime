# PLAN: Shift Coverage & Trade (Call-Out via SMS)

**Status:** Phase 1 implemented (not yet deployed — PM2 still serving the previous build)
**Module:** `shift_coverage`
**Depends on:** existing Twilio SMS stack, `shifts`, `users`, `/api/clock/cron`

---

## 1. Summary

Staff who can't work a shift open a request in TeamTime ("I'm sick" / "I need to
trade"). A manager reviews it, picks eligible coworkers from a generated list,
and blasts an SMS asking who can pick it up. The first person to text back a
claim code gets the shift, the schedule updates, and everyone else is told it's
covered.

The whole point is **speed on a same-day call-out**, so the claim path is SMS
first (staff won't open the app at 6am) with a web fallback.

---

## 2. What already exists (don't rebuild it)

Reconnaissance findings — several pieces are already in place:

| Piece | Where | State |
|---|---|---|
| `shift_requests` table | `schema.ts:3045` | **Exists in schema AND live DB, 0 rows, referenced by zero application code.** Dead schema from an earlier pass. |
| `shift_request_responses` table | `schema.ts:3061` | Same — exists, unused, has a `unique(requestId, userId)` constraint already. |
| `shift_request` notification type | `notificationTypeEnum`, `schema.ts:65` | Already in the enum. No migration needed for in-app notifications. |
| Outbound SMS | `src/lib/server/twilio.ts` | `sendSMS()` is the single choke point: validates E.164, blocks inactive users, logs to `sms_logs`, registers a status callback. |
| Inbound SMS webhook | `src/routes/api/sms/webhook/inbound/+server.ts` | Validates Twilio signature, resolves user by phone, logs, then hands managers to the Office Manager AI. **Clock-out reply parsing has been removed** (see §3) — the generic reply space is now free. |
| Staff/vendor separation | `user-classification-service.ts` | `getSchedulableStaff()` already excludes Vendor-type users. Use it — do not hand-roll the filter. |
| 15-min cron | `/api/clock/cron` (crontab, business hours) | Already runs `checkOverdueClockOuts`, `checkLateArrivals`, `processPendingJobs`. **Piggyback here — no new crontab line.** |
| Module toggles | `admin/modules/+page.server.ts` `DEFAULT_MODULES` | Add one entry. |

**Decision: extend the existing `shift_requests` tables rather than create new
ones.** They're empty and structurally close to what's needed.

### ⚠️ Schema drift to be careful about

The live DB's `shift_requests` has a `tenant_id` column (with a default) that
does **not** appear in `schema.ts` on `main` — it came from the multi-tenant
branch in `~/teamtime-mt`. `tenantId` appears **zero** times in main's
`schema.ts`. Consequence: use `npm run db:generate` + `db:migrate` and read the
generated SQL before applying. **Never `db:push`** here — it would try to drop
`tenant_id`. (CLAUDE.md already says to avoid push; this is a concrete reason.)

---

## 3. SMS reply routing

### 3.1 Done already: clock-out nags removed

The clock-out warning system used to own the generic SMS reply space — bare
`YES` meant "clock me out", and any bare time (`"5:30"`) was parsed as a
clock-out correction. That directly collided with coverage claims.

**This has been removed.** Specifically:

- The ~260-line clock-out reply branch is gone from the inbound webhook, along
  with `parseTimeReply()` (`src/lib/server/utils/parse-time-reply.ts`, deleted —
  it had no other caller) and the nag/reply SMS templates.
- All three nag SMS (`nag1`/`nag2`/`nag3`/`autoReminder`) no longer send.
- **Auto clock-out was decoupled from the nag count.** It previously fired only
  at `nagCount >= 2`, so deleting the nags would have silently disabled it and
  left forgotten entries open indefinitely. It now fires purely on elapsed time
  (`AUTO_CLOCK_OUT_MINUTES: 180`), preserving the original ~3hr timing and
  still clocking out at the *shift end time*, not `now`.
- Demerit escalation, point deduction, manager `forceClockOut()`, and the
  late-arrival warning system (which has its own separate `SMS_MESSAGES`) are
  all untouched.

**Side effect, worth knowing:** demerits will now be issued less often, and
correctly. `getWarningCount()` counts every warning in a 30-day window against a
threshold of 2. The old nag sequence wrote *three* warnings per incident
(nag1 + nag2 + nag3), so `3 >= 2` meant **one forgotten clock-out always tripped
a demerit on its own**. One incident now writes one warning, so it takes two
separate incidents — which is what the service's own docblock always claimed the
policy was ("2 warnings in 30 days = pending demerit"). Demerits remain
`pending` for manager review either way, so nothing punitive changed.

### 3.2 Still required: order the claim branch ahead of the Office Manager AI

Removing the nags fixed the clock-out collision but **not** the second one. The
webhook still routes *any* text from a manager or admin straight into the Office
Manager LLM, fire-and-forget:

```ts
if (userRow?.isActive && isManager(...)) {
    handleOfficeManagerInbound(...);   // swallows everything
    return twimlEmpty();
}
```

A manager or shift lead invited to cover a shift would have their `YES` sent to
the AI instead of claiming the shift. So the claim branch must still be inserted
**before** that block:

```
if (userId && !isOptOut) {
    const claim = parseClaimReply(body);           // pure, unit-testable
    if (claim) {
        const match = await resolveClaim(userId, claim);
        if (match.resolved)  return twiml(await handleClaim(...));
        if (match.ambiguous) return twiml('Which shift? Reply YES <code>. Open: 4F2K, 9QR1');
        // not an invitee → fall through to the office-manager branch
    }
}
```

Note the webhook's `twiml()` / `escapeXml()` helpers were removed with the
clock-out branch (nothing else replied with a message body). The claim branch
reintroduces them.

### 3.3 Keywords

With the reply space free, **bare `YES` and `NO` now work** — that is the whole
benefit of the removal, and it matters because it is what staff will type
without being told.

- Claim: `YES`, `TAKE`, `COVER`, `I CAN`, `GOT IT`
- Decline: `NO`, `PASS`, `CAN'T`

Claim codes are still generated and still accepted (`YES 4F2K`), because they
remain necessary for disambiguation: a bare `YES` only resolves when the user has
exactly **one** open invite. Two or more → reply with the ambiguity prompt above
rather than guessing. Broadcasts to a single open shift can therefore say the
friendlier "Reply YES", and only mention the code when the recipient has more
than one live invite.

## 4. Data model

### 4.1 Enum changes

```ts
// extend existing — ALTER TYPE ... ADD VALUE (non-destructive, but note that
// added enum values can't be used in the same transaction in older PG; the
// generated migration should ADD VALUE in its own statement)
shiftRequestStatusEnum: + 'pending_approval', 'expired', 'denied'
shiftResponseStatusEnum: unchanged ('accepted', 'declined')

// new
shiftRequestTypeEnum = pgEnum('shift_request_type',
  ['sick', 'personal', 'appointment', 'trade', 'open_shift'])
shiftRecipientDeliveryEnum = pgEnum('shift_recipient_delivery',
  ['pending', 'sent', 'failed', 'skipped'])
```

### 4.2 `shift_requests` — added columns

| Column | Type | Purpose |
|---|---|---|
| `request_type` | enum, default `'open_shift'` | Sick / personal / trade / manager-opened shift |
| `requested_by` | uuid → users | The staffer who can't work it. Distinct from `created_by`, which stays "who typed it in" (a manager can file on someone's behalf from a phone call). |
| `reason` | text | Staff's note ("food poisoning") — manager-visible, never included in the broadcast SMS. |
| `claim_code` | text | 4-char code, `A–Z0–9` minus lookalikes (`0/O`, `1/I`). Unique among non-terminal requests, not globally. |
| `respond_by` | timestamptz | Deadline. Default `min(startTime - 30min, now + 4h)`. |
| `broadcast_at` / `broadcast_by` | timestamptz / uuid | When and by whom the SMS went out. |
| `filled_at` | timestamptz | Claim timestamp. |
| `auto_apply` | boolean, default true | Whether claiming reassigns the shift immediately or just records intent for manager confirmation. |
| `offered_shift_id` | uuid → shifts | Phase 2 (trade): the shift the requester takes in exchange. |
| `manager_note` | text | Denial reason / internal note. |

`title` becomes derived (`"Sick — Wed 9/17 10a–4p"`) rather than user-entered.

### 4.3 New table: `shift_request_recipients`

`shift_request_responses` only records people who *replied*. We also need the
invited set — to render "3 of 8 responded", to chase non-responders, and to
verify that a texter was actually invited.

```ts
shiftRequestRecipients = pgTable('shift_request_recipients', {
  id, requestId → shift_requests (cascade),
  userId → users (cascade),
  phone: text,                       // snapshot at send time
  deliveryStatus: enum default 'pending',
  smsLogId → sms_logs (set null),
  eligibilityNotes: jsonb,           // why they were flagged, frozen at send
  remindedAt: timestamptz,
  sentAt, createdAt
}, unique(requestId, userId))
```

### 4.4 `shift_request_responses` — added columns

`viaSms` boolean, `smsLogId` → sms_logs. The unique constraint already prevents
double-responding.

---

## 5. Service layer

New: `src/lib/server/services/shift-coverage-service.ts`

### 5.1 `getEligibleStaff(requestId)`

Returns every candidate annotated, rather than a filtered list — the manager
sees who was excluded and why, and can override soft blocks.

```ts
{ userId, name, phone, eligible: boolean,
  hardBlocks: string[],   // cannot be selected
  warnings:   string[] }  // selectable, shown as a chip
```

| Check | Class | Note |
|---|---|---|
| Inactive user | hard | `sendSMS` blocks these anyway — filter early so the manager isn't misled |
| Vendor user type | hard | via `getSchedulableStaff()` |
| Is the requester | hard | |
| No phone / not E.164-parseable | hard | `formatPhoneToE164()` returns null |
| Opted out of SMS | hard | most recent `sms_logs` row for them with `status='opt_out'` |
| Overlapping shift already scheduled | hard | show the conflicting shift's times |
| Would exceed weekly hour cap | warning | cap from `app_settings`, default 40 |
| Closing yesterday → opening today | warning | short turnaround |
| Declined a coverage request in last 7 days | warning | informational only |

### 5.2 `broadcastRequest(requestId, userIds, message, deadline, actorId)`

Transitions `pending_approval → open`, generates the claim code, inserts
`shift_request_recipients` rows, then sends. Send loop is sequential (matches
`scheduled-sms-processor.ts`) and records per-recipient delivery. A single
recipient failure must not abort the batch.

### 5.3 `claimShift(requestId, userId, via)` — race-safe

Multiple people will text `TAKE` within seconds of each other. The claim must be
decided by the database, not by a read-then-write:

```sql
UPDATE shift_requests
   SET status = 'filled', filled_by = $userId, filled_at = now(), updated_at = now()
 WHERE id = $requestId AND status = 'open'
RETURNING id;
```

Zero rows returned → someone else won; reply "Already covered, thanks!". This is
the only correct ordering — check-then-update would hand the same shift to two
people.

**Re-validate at claim time, not just at broadcast time.** Minutes have passed
and the schedule may have changed: re-run the overlapping-shift check before the
UPDATE. If the claimer picked up a conflicting shift in the meantime, reject
with an explanatory SMS and leave the request open.

If `auto_apply`, reassign in the same transaction:
`UPDATE shifts SET user_id = $claimer WHERE id = $shiftId`, write an
`audit_logs` entry, notify requester + manager + claimer.

### 5.4 `expireStaleRequests()` / `remindNonResponders()`

Called from `/api/clock/cron`. Expires past `respond_by` and escalates to the
manager ("nobody picked up the 10am — still uncovered"). Note the crontab only
runs this during business hours; that's acceptable since it's shift-hours work,
but it means a 5am call-out isn't auto-expired until the cron window opens.

---

## 6. UI

### 6.1 Staff — `/schedule`

- A persistent **"Can't work a shift?"** button near "My Upcoming Shifts", plus
  a per-shift overflow action on each of the user's own shift cards.
- Modal: pick shift (defaults to today's or tomorrow's — matching the stated
  workflow) → reason (Sick / Personal / Appointment / Want to trade) → optional
  note → confirm screen showing exactly which shift is being given up → submit.
- Confirmation copy sets expectations: *"A manager will review and text the team.
  You'll get a text when someone picks it up."*
- **"My requests"** list with live status (Pending review / Out to 6 staff /
  Covered by Dana / Expired).

### 6.2 Staff — `/schedule/coverage/[code]`

Web claim fallback for anyone who'd rather tap than text. Same `claimShift()`
path, so the same race guard applies. Costs nothing extra since the code exists.

### 6.3 Admin — `/admin/shift-coverage` (the new admin element)

Three sections:

**Needs action** (`pending_approval`)
- Request card: requester, shift date/time/location, type, their note, and a
  prominent **time-until-shift** countdown — that's the urgency signal.
- **Eligible staff selector** — the core widget. Checkbox list, all eligible
  pre-checked. Each row: name, phone presence, warning chips ("38h this week",
  "closed last night"). Hard-blocked staff render greyed with the reason and are
  not checkable.
- Editable message preview with a **segment counter**. The
  `"Yakima Finds Communiqué: "` header from `twilio.ts` is prepended to every
  message and eats ~25 characters — show the real composed length, not the
  textarea length.
- Deadline picker, and an estimated-cost line ("8 texts").
- Actions: **Send to N staff** · **Assign directly…** · **Deny**.

**Out for coverage** (`open`)
- Response tally, per-recipient delivery status (sent/failed), countdown,
  **Remind non-responders**, **Assign manually**, **Cancel**.

**Recent** — filled/expired/cancelled with who took it.

Plus: a tile on `/admin` with a pending-count badge, next to the existing
Schedule tile.

### 6.4 Admin — surfacing missing phones

The feature hard-depends on staff having phones. Add a "staff without a phone
number" warning to `/admin/shift-coverage` (and ideally `/admin/users`), since
those people are silently unreachable.

---

## 7. SMS copy

Keep every message to one segment where possible. The header is always prepended.

| Event | Body |
|---|---|
| Broadcast (one open invite) | `Shift open Wed 9/17 10am-4pm @ Main. Reply YES to claim (first reply wins) or NO to pass.` |
| Broadcast (recipient has 2+) | `Shift open Wed 9/17 10am-4pm @ Main. Reply YES 4F2K to claim (first reply wins) or NO 4F2K.` |
| Claim won | `You've got it — Wed 9/17 10am-4pm @ Main. It's on your schedule.` |
| Claim lost | `Thanks! That shift was already covered.` |
| Conflict | `You're already scheduled 9am-3pm Wed, so that one would overlap. Talk to a manager.` |
| Requester update | `Dana picked up your Wed 10am-4pm shift. You're covered.` |
| Manager, filled | `Dana took the Wed 10am-4pm (Sam out sick).` |
| Manager, expired | `No one picked up Wed 10am-4pm. Still uncovered.` |

The staff member's reason ("food poisoning") is **never** broadcast — manager-only.

---

## 8. Config

`app_settings` keys, editable from the admin page:

- `shift_coverage_enabled`
- `shift_coverage_require_approval` (default `true` — matches the stated
  workflow where the office manager sends the blast)
- `shift_coverage_auto_apply` (default `true`)
- `shift_coverage_default_deadline_hours` (default `4`)
- `shift_coverage_max_weekly_hours` (default `40`)

Add `{ key: 'module_shift_coverage', name: 'Shift Coverage', … }` to
`DEFAULT_MODULES`.

---

## 9. Phasing

**Phase 1 — Call-out & pickup (the described workflow). ✅ BUILT.** Schema
migration (`drizzle/0003_serious_captain_midlands.sql`, applied),
`shift-coverage-service.ts`, staff request modal on `/schedule`, admin queue +
eligible-staff selector + broadcast at `/admin/shift-coverage`, SMS claim branch
in the webhook, race-safe claim, auto-apply, expiry via `/api/clock/cron`, web
claim page at `/schedule/coverage/[code]`.

The concurrency guarantee was verified against real PostgreSQL in a throwaway
schema: 25 trials x 12 simultaneous claimants produced exactly one winner every
time, while the naive read-then-write it replaced produced 12 winners in a
single trial.

**Phase 2 — True trades.** Two-sided swap via `offered_shift_id`: responder
picks which of their own shifts to give back, both shifts move atomically,
manager confirms (a trade moves two schedules, so it should not auto-apply).

**Phase 3 — Automation.** Optional auto-broadcast without manager review for
`sick` inside N hours of shift start; tiered escalation (closest/most-qualified
first, widen after 15 min); an Office Manager AI tool so a manager can text
*"send Sam's Wednesday shift out to everyone"*.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| **Office Manager AI swallowing a manager's claim** | Claim branch ordered ahead of the office-manager branch, falling through cleanly on non-match. (The clock-out half of this collision is already removed.) §3 |
| **Double-booking on simultaneous claims** | Conditional `UPDATE … WHERE status='open'`, decided by the DB. §5.3 |
| **Stale eligibility** | Re-validate conflicts at claim time, not just at broadcast. |
| **`tenant_id` schema drift** between `main` and `~/teamtime-mt` | `db:generate` + read the SQL + `db:migrate`. Never `db:push`. §2 |
| **Opted-out staff are invisibly unreachable** | Surface opt-out and missing-phone state in the selector. |
| **SMS cost / spam fatigue** | Manager selects recipients (not blanket blast), segment + cost preview, one reminder maximum. |
| Enum `ADD VALUE` migration ordering | Emit `ALTER TYPE … ADD VALUE` as standalone statements in the generated migration. |

---

## 11. Testing

- **Unit:** `parseClaimReply` (bare `YES`/`NO`, code forms, casing,
  punctuation, non-matches that must fall through); bare `YES` with two open
  invites returns ambiguous rather than picking one; eligibility rules incl.
  overlap and opt-out; claim-code generation excludes lookalike characters.
- **Concurrency:** two simultaneous `claimShift()` calls → exactly one winner.
  This is the single most important test in the plan.
- **Webhook regression:** a manager's ordinary text still reaches the Office
  Manager AI, while a manager who *is* an invited recipient has their `YES`
  claimed instead of sent to the LLM.
- **Auto clock-out regression:** an entry left open past
  `AUTO_CLOCK_OUT_MINUTES` is still closed at its shift end time with no SMS,
  and produces exactly one warning even if the cron runs repeatedly.
- **E2E:** staff files request → manager broadcasts → claim via web → schedule
  reflects the new assignee.
