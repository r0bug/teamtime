# TeamTime Schema Documentation

This document describes the data schemas used throughout the TeamTime application, including both server-side database schemas and client-side storage.

## Client-Side Storage

### localStorage Keys

The application uses browser localStorage for persisting user preferences and UI state across sessions.

| Key | Type | Description | Values |
|-----|------|-------------|--------|
| `pwa-install-dismissed` | string | Tracks whether user dismissed the PWA install prompt | `'true'` if dismissed, absent if not |

#### PWA Install Prompt (`pwa-install-dismissed`)

**Purpose**: Prevents the PWA install prompt from reappearing after the user dismisses it.

**Behavior**:
- When user clicks the X button on the install prompt, this key is set to `'true'`
- On app load, the InstallPrompt component checks for this key
- If present and equals `'true'`, the prompt will not display
- Key persists indefinitely until user clears browser data

**Set by**: `src/lib/components/InstallPrompt.svelte`

**Checked by**: `src/lib/components/InstallPrompt.svelte` on mount

**Example**:
```javascript
// Dismissing the prompt
localStorage.setItem('pwa-install-dismissed', 'true');

// Checking if dismissed
const isDismissed = localStorage.getItem('pwa-install-dismissed') === 'true';
```

### Future localStorage Keys

Additional localStorage keys may be added for:
- User theme preferences
- Notification settings cache
- Offline data queue status
- UI state persistence (collapsed panels, etc.)

## Session Storage

Currently, the application does not use sessionStorage. All client-side persistence uses localStorage for cross-session availability.

## IndexedDB

Reserved for future offline functionality:
- Message queue for offline-created messages
- Clock events queue for offline clock in/out
- Cached schedule data

## Cookies

Session cookies are managed by the authentication system (Lucia). See authentication documentation for cookie handling details.

---

## Database Schema Highlights

The full database schema is defined in `src/lib/server/db/schema.ts`. Here are key additions for Group Chat & Threads:

### Groups Table

```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  linked_user_type_id UUID REFERENCES user_types(id) ON DELETE SET NULL,
  is_auto_synced BOOLEAN NOT NULL DEFAULT false,
  color TEXT DEFAULT '#6B7280',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id),
  UNIQUE(linked_user_type_id)
);
```

### Group Members Table

```sql
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',  -- 'admin' or 'member'
  is_auto_assigned BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(group_id, user_id)
);
```

### Thread Columns (Messages Table)

```sql
ALTER TABLE messages ADD COLUMN parent_message_id UUID REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN thread_reply_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN last_thread_reply_at TIMESTAMPTZ;
```

### Thread Participants Table

```sql
CREATE TABLE thread_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);
```

### Conversation Type Enum

The `conversation_type` enum now includes: `direct`, `broadcast`, `group`

---

## Shoutouts & Recognition Schema

### Shoutout Category Enum

```sql
CREATE TYPE shoutout_category AS ENUM (
  'teamwork', 'quality', 'initiative', 'customer',
  'mentoring', 'innovation', 'reliability', 'general'
);
```

### Shoutout Status Enum

```sql
CREATE TYPE shoutout_status AS ENUM ('pending', 'approved', 'rejected');
```

### Award Types Table

```sql
CREATE TABLE award_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category shoutout_category NOT NULL,
  points INTEGER NOT NULL,
  icon TEXT DEFAULT '⭐',
  color TEXT DEFAULT '#F59E0B',
  is_active BOOLEAN NOT NULL DEFAULT true,
  manager_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Shoutouts Table

```sql
CREATE TABLE shoutouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nominator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  award_type_id UUID REFERENCES award_types(id) ON DELETE SET NULL,
  category shoutout_category NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  description TEXT,
  status shoutout_status NOT NULL DEFAULT 'pending',
  is_manager_award BOOLEAN NOT NULL DEFAULT false,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT true,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shoutouts_recipient ON shoutouts(recipient_id);
CREATE INDEX idx_shoutouts_status ON shoutouts(status);
CREATE INDEX idx_shoutouts_created ON shoutouts(created_at DESC);
```

---

## Clock-Out Warnings & Demerits Schema

### Demerit Type Enum

```sql
CREATE TYPE demerit_type AS ENUM (
  'clock_out_violation', 'late_arrival', 'attendance',
  'task_performance', 'policy_violation', 'other'
);
```

### Demerit Status Enum

```sql
CREATE TYPE demerit_status AS ENUM ('active', 'appealed', 'overturned', 'expired');
```

### Demerits Table

```sql
CREATE TABLE demerits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type demerit_type NOT NULL,
  status demerit_status NOT NULL DEFAULT 'active',
  issued_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  points_deducted INTEGER NOT NULL DEFAULT 0,
  sms_notified BOOLEAN NOT NULL DEFAULT false,
  sms_result JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Clock-Out Warnings Table

```sql
CREATE TABLE clock_out_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  warning_type clock_out_warning_type NOT NULL,
  issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sms_result JSONB,
  shift_end_time TIMESTAMPTZ,
  minutes_past_shift_end INTEGER,
  reason TEXT,
  escalated_to_demerit BOOLEAN NOT NULL DEFAULT false,
  demerit_id UUID REFERENCES demerits(id) ON DELETE SET NULL,
  user_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Late Arrival Warnings Table

```sql
CREATE TABLE late_arrival_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  warning_type late_arrival_warning_type NOT NULL,
  shift_start_time TIMESTAMPTZ NOT NULL,
  minutes_late INTEGER NOT NULL,
  sms_result JSONB,
  escalated_to_demerit BOOLEAN NOT NULL DEFAULT false,
  demerit_id UUID REFERENCES demerits(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Security Module Schema

### Login Attempt Result Enum

```sql
CREATE TYPE login_attempt_result AS ENUM (
  'success', 'invalid_credentials', 'account_locked',
  'account_disabled', '2fa_required', '2fa_failed'
);
```

### Login Attempts Table

```sql
CREATE TABLE login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  result login_attempt_result NOT NULL,
  failure_reason TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Account Lockouts Table

```sql
CREATE TABLE account_lockouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL,
  unlocked_at TIMESTAMPTZ,
  unlocked_by UUID REFERENCES users(id) ON DELETE SET NULL
);
```

---

## Shift Requests Schema

### Shift Request Status Enum

```sql
CREATE TYPE shift_request_status AS ENUM ('open', 'filled', 'cancelled');
CREATE TYPE shift_response_status AS ENUM ('accepted', 'declined');
```

### Shift Requests Table

```sql
CREATE TABLE shift_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  requested_date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  status shift_request_status NOT NULL DEFAULT 'open',
  filled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Shift Request Responses Table

```sql
CREATE TABLE shift_request_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES shift_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status shift_response_status NOT NULL,
  note TEXT,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id, user_id)
);
```

---

## Staffing Analytics Schema

### Worker Pair Performance Table

```sql
CREATE TABLE worker_pair_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id_2 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  days_together INTEGER NOT NULL DEFAULT 0,
  avg_daily_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Worker Impact Metrics Table

```sql
CREATE TABLE worker_impact_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  days_present INTEGER NOT NULL DEFAULT 0,
  days_absent INTEGER NOT NULL DEFAULT 0,
  avg_sales_present NUMERIC(10,2) NOT NULL DEFAULT 0,
  avg_sales_absent NUMERIC(10,2) NOT NULL DEFAULT 0,
  impact_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  total_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  sales_per_hour NUMERIC(10,2) NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Staffing Level Metrics Table

```sql
CREATE TABLE staffing_level_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_count INTEGER NOT NULL,
  days_observed INTEGER NOT NULL DEFAULT 0,
  avg_daily_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_daily_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_daily_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  avg_retained NUMERIC(10,2) NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Day of Week Metrics Table

```sql
CREATE TABLE day_of_week_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INTEGER NOT NULL,
  days_observed INTEGER NOT NULL DEFAULT 0,
  avg_daily_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  avg_worker_count NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_retained NUMERIC(10,2) NOT NULL DEFAULT 0,
  avg_sales_per_worker NUMERIC(10,2) NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Gamification Config Schema

### Gamification Config Table

```sql
CREATE TABLE gamification_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  category TEXT NOT NULL, -- 'points', 'streaks', 'levels', 'achievements'
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## SMS Logs Schema

### SMS Logs Table

Tracks all outbound SMS delivery statuses and inbound replies/opt-outs via Twilio webhooks.

```sql
CREATE TABLE sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid TEXT UNIQUE,                    -- Twilio message SID
  direction sms_direction NOT NULL,           -- 'outbound' or 'inbound'
  status sms_status NOT NULL,                 -- 'queued','sent','delivered','undelivered','failed','received','opt_out'
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT,                                  -- Message content
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  error_code TEXT,                            -- Twilio error code
  error_message TEXT,                         -- Twilio error description
  segments INTEGER,                           -- Number of SMS segments
  price TEXT,                                 -- Cost from Twilio
  status_updated_at TIMESTAMPTZ,             -- Last status callback time
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes**: `message_sid`, `user_id`, `direction`, `created_at DESC`

---

## Sales Transactions

Individual POS line items from the NRS REST API. Enables hourly drill-down and item-level detail views on the Sales Detail page (`/sales/detail`).

```sql
CREATE TABLE sales_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ar_cash_reg_id INTEGER NOT NULL,               -- NRS register ID
  ar_cash_reg_detail_id INTEGER NOT NULL,         -- NRS line item ID (unique)
  store_id INTEGER NOT NULL,
  store_name TEXT,
  invoice_date DATE NOT NULL,                     -- Business day
  create_date_time TIMESTAMPTZ NOT NULL,          -- Exact transaction timestamp
  vendor_id INTEGER NOT NULL,
  vendor_name TEXT,
  part_id INTEGER,
  part_number TEXT,
  part_name TEXT,
  item_description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(12,2) NOT NULL,                   -- Unit price
  total_price DECIMAL(12,2) NOT NULL,             -- Qty * price
  tax DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  vendor_portion DECIMAL(12,2) NOT NULL,          -- Amount owed to vendor
  retained_amount DECIMAL(12,2) NOT NULL,         -- Store's commission
  user_name TEXT,                                 -- Cashier
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes**: `invoice_date`, `vendor_id`, `create_date_time`, unique on `ar_cash_reg_detail_id`

**Related**: `sales_snapshots` stores daily aggregates; `sales_transactions` stores the underlying line items.

## Schedule Templates

Saved weekly shift patterns that can be applied to arbitrary date ranges or materialized by a daily cron. See [FEATURES.md](./FEATURES.md) for the full workflow.

### Schedule Templates Table

```sql
CREATE TABLE schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,      -- exactly one default at a time
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ,                     -- optional window
  effective_to TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index — enforces the "one default at a time" invariant at the DB
CREATE UNIQUE INDEX schedule_templates_one_default_idx
  ON schedule_templates (is_default) WHERE is_default = true;
```

**Indexes**: `is_default` (btree), `is_default WHERE is_default = true` (partial unique)

### Schedule Template Shifts Table

```sql
CREATE TABLE schedule_template_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES schedule_templates(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,                   -- 0 = Sunday … 6 = Saturday
  start_time TEXT NOT NULL,                       -- 'HH:MM' 24h Pacific wall-clock
  end_time TEXT NOT NULL,                         -- 'HH:MM' (end < start → overnight)
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes**: `template_id`, `(template_id, day_of_week)`, `user_id`

### Shifts Table (additions)

```sql
ALTER TABLE shifts
  ADD COLUMN template_id UUID REFERENCES schedule_templates(id) ON DELETE SET NULL,
  ADD COLUMN template_shift_id UUID REFERENCES schedule_template_shifts(id) ON DELETE SET NULL;
```

Materialized shifts carry `template_id` + `template_shift_id` so drift validation can match them back to the source slot.

### Auto-Apply Configuration

Stored in `app_settings` under key `schedule_template_config`:

```json
{"enabled": true, "weeksAhead": 4, "cronLastRun": <epoch-ms>}
```

The clock cron (`/api/clock/cron`) calls `autoApplyDefaultTemplate` at most once every 24 hours when enabled; only the **default** template is materialized, gap-fill mode only (never overwrites existing shifts).

## Break Entries

Tracks individual breaks taken within a time entry. Used by the payroll timesheet to compute paid-break allowance and excess unpaid time.

```sql
CREATE TABLE break_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  break_start TIMESTAMPTZ NOT NULL,
  break_end TIMESTAMPTZ,                          -- NULL while break is in progress
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes**: `time_entry_id`, `user_id`

**Audit log**: `audit_logs.action` now accepts `break_start` and `break_end` in addition to `clock_in` / `clock_out`.

**Config**: `app_settings.break_allowance_config` holds `{minutesPer: number, perHours: number}` — e.g. `{minutesPer: 15, perHours: 4}` means employees get 15 paid minutes per 4 hours worked, scaled proportionally. Only break time exceeding the allowance is deducted from the timesheet.

---

## Vendor Management Schema

NRS POS is the source of truth for vendor identity, sales, and inventory. TeamTime stores TT-specific fields and joins back to NRS by `nrs_vendor_id`. No vendor-id FKs are added to `sales_transactions` / `sales_snapshots` — the leaderboard reads them via the existing `vendors` JSONB on `sales_snapshots`.

### Vendor Status Enum

```sql
CREATE TYPE "vendor_status" AS ENUM ('active', 'inactive', 'terminated');
```

### Vendors Table

```sql
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NRS link (source of truth)
  nrs_vendor_id INTEGER UNIQUE,

  -- TT user link (nullable: not every vendor has portal access)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Identity & contact
  display_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Contract terms (current — agreements snapshot these at sign time)
  booth_number TEXT,
  monthly_rent_cents INTEGER,
  max_discount_percent NUMERIC(5,2),

  -- Lifecycle
  status vendor_status NOT NULL DEFAULT 'inactive',
  start_date DATE,
  end_date DATE,
  notes TEXT,

  -- Onboarding & portal (Stage 2a)
  inventory_code_prefix TEXT UNIQUE,         -- 2-8 [A-Z0-9], e.g. 'SR' or 'YFMEDIA'
  portal_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  nrs_inactive BOOLEAN NOT NULL DEFAULT FALSE, -- Mirrors NRS CSV "Inactive" column

  -- Portal invitation audit (stamped by inviteVendorToPortal)
  credentials_sent_at TIMESTAMPTZ,
  credentials_sent_via TEXT,                  -- 'email' | 'sms' | 'email+sms'
  credentials_sent_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendors_status ON vendors(status);
CREATE INDEX idx_vendors_nrs_vendor_id ON vendors(nrs_vendor_id);
CREATE INDEX idx_vendors_onboarding ON vendors(onboarding_complete);
```

**Sync policy:** Identity fields (`contact_name/email/phone`, address fields) are
NRS-authoritative — `syncFromNrs` overwrites them in TT whenever NRS has a non-null
value. Empty NRS values do NOT wipe TT (guards against accidental upstream clears).
`inventory_code_prefix` is backfill-only because admin may have a legacy reason to
override (e.g. labels already printed under an old prefix).

### Users Table — Vendor Portal Additions

```sql
-- Set when admin sends temp credentials via inviteVendorToPortal; cleared
-- after the user saves a new password at /vendor/set-password.
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
```

When a vendor signs in with a temp password, the `(app)/vendor/+layout.server.ts`
gate redirects them to `/vendor/set-password` until the flag is cleared.

### Agreement Templates Table

```sql
CREATE TYPE "agreement_template_kind" AS ENUM ('primary', 'addon');

CREATE TABLE agreement_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,                        -- stable slug across versions
  title TEXT NOT NULL,
  kind agreement_template_kind NOT NULL,
  body_markdown TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  supersedes_id UUID REFERENCES agreement_templates(id) ON DELETE SET NULL,

  -- Optional per-template extra fields collected at signing.
  -- Shape: [{key, label, type: 'currency'|'text'|'number', required}]
  extra_fields_schema JSONB,

  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX idx_agreement_templates_code ON agreement_templates(code);
CREATE INDEX idx_agreement_templates_kind_active ON agreement_templates(kind, is_active);
```

**Versioning rule**: editing a template that has signed instances creates a new row (`version + 1`, `supersedes_id` = old.id, old `is_active=false`). Old `vendor_agreements` keep their original `body_snapshot` so historical records survive.

### Vendor Agreements Table

```sql
CREATE TYPE "vendor_agreement_status" AS ENUM ('signed', 'voided');

CREATE TABLE vendor_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES agreement_templates(id) ON DELETE RESTRICT,
  status vendor_agreement_status NOT NULL DEFAULT 'signed',

  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_by_name TEXT NOT NULL,                  -- vendor's printed name
  signature_data_url TEXT,                       -- base64 PNG; NULL when paper original
  paper_original_on_file BOOLEAN NOT NULL DEFAULT FALSE,

  -- Frozen snapshots so future template/vendor edits don't rewrite history
  body_snapshot TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  terms_snapshot JSONB NOT NULL,                 -- {monthlyRentCents, maxDiscountPercent, boothNumber, extraFieldValues?}

  witnessed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  voided_reason TEXT,                            -- 'superseded' | 'withdrawn' | 'terminated' | …

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_agreements_vendor ON vendor_agreements(vendor_id);
CREATE INDEX idx_vendor_agreements_vendor_template_status
  ON vendor_agreements(vendor_id, template_id, status);
```

**Supersession rule (per-(vendor, template))**: when a new agreement is signed, any prior `signed` row for the same `(vendor_id, template_id)` is voided with `voided_reason='superseded'`. Other agreements on the same vendor (different `template_id`) are untouched — that's what lets a vendor stack one primary + many add-ons concurrently.

### Vendor Groups Table

```sql
CREATE TABLE vendor_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
```

### Vendor Group Members Table

Many-to-many junction. A vendor can belong to multiple groups.

```sql
CREATE TABLE vendor_group_members (
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES vendor_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vendor_group_members_pk UNIQUE (vendor_id, group_id)
);
```

### Pending Inventory Changes Table

Vendor-proposed creates / updates / deletes against their NRS inventory. Until a confirmed NRS write API is wired, every proposal lands here as `status='pending'` and is applied manually by staff via `/admin/vendors/inventory-changes`.

```sql
CREATE TYPE "inventory_change_type" AS ENUM ('create', 'update', 'delete');
CREATE TYPE "inventory_change_status" AS ENUM ('pending', 'applied', 'rejected', 'cancelled');

CREATE TABLE pending_inventory_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  submitted_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  change_type inventory_change_type NOT NULL,
  nrs_part_id INTEGER,                           -- NULL on 'create'
  part_number TEXT NOT NULL,                     -- enforced to start with vendor.inventory_code_prefix

  payload JSONB NOT NULL,                        -- proposed values
  previous_payload JSONB,                        -- snapshot for updates

  status inventory_change_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  applied_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  nrs_apply_notes TEXT
);

CREATE INDEX idx_pending_inventory_changes_vendor ON pending_inventory_changes(vendor_id);
CREATE INDEX idx_pending_inventory_changes_status ON pending_inventory_changes(status);
CREATE INDEX idx_pending_inventory_changes_vendor_status
  ON pending_inventory_changes(vendor_id, status);
```

### Vendor User Type (seeded)

A `user_types` row with `name='Vendor'`, `based_on_role='staff'`, `priority=20`, `is_system=true` is seeded once on first deploy. The portal-enable flow assigns this `user_type_id` to the vendor's user account; the `(app)/+layout.server.ts` and `vendor/+layout.server.ts` gates check for this type and redirect non-vendor users away from `/vendor` and vendor users away from staff routes.

---

*Last updated: May 2026*
