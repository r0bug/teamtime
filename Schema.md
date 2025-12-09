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

*Last updated: December 2024*
