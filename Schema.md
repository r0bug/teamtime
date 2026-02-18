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

*Last updated: February 2026*
