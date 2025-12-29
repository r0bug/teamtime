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

*Last updated: December 2024*
