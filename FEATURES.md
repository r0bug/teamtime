# TeamTime Features Documentation

This document provides detailed information about TeamTime features, their implementation, and usage.

## Table of Contents

1. [PWA Install Prompt](#pwa-install-prompt)
2. [Mobile Navigation](#mobile-navigation)
3. [Push Notifications](#push-notifications)
4. [Item Pricing & eBay Routing](#item-pricing--ebay-routing)

---

## PWA Install Prompt

### Overview

TeamTime encourages mobile users to install the app as a Progressive Web App (PWA) for faster access and a native app-like experience. A custom install prompt banner appears on mobile devices, providing platform-specific installation guidance.

### User Experience

#### On Android/Chrome

1. When visiting on a mobile browser that supports PWA installation, a banner appears above the bottom navigation
2. The banner displays "Install TeamTime" with an app icon and "Add to your home screen for quick access" message
3. Clicking "Install App" triggers the browser's native install dialog
4. Users can accept or dismiss the native prompt
5. After accepting, the app is added to the home screen and the banner disappears

#### On iOS Safari

1. Since iOS doesn't support the `beforeinstallprompt` API, the banner shows manual instructions
2. The banner displays "Install TeamTime" with a visual share icon
3. Instructions read: "Tap [share icon] then 'Add to Home Screen'"
4. Users follow the manual process to add the app to their home screen

#### Dismissing the Prompt

- Users can tap the X button to dismiss the prompt
- Once dismissed, the prompt will not appear again on that device/browser
- Dismissal preference is stored in localStorage and persists until browser data is cleared

### Implementation Details

**Component**: `src/lib/components/InstallPrompt.svelte`

**Integration**: Imported and rendered in `src/routes/(app)/+layout.svelte`

**Key Technologies**:
- `beforeinstallprompt` event (Chromium browsers)
- `navigator.userAgent` for platform detection
- `window.matchMedia('(display-mode: standalone)')` for standalone detection
- `localStorage` for dismissal persistence

**localStorage Key**: `pwa-install-dismissed`
- Set to `'true'` when user dismisses
- Checked on component mount to determine visibility

### Display Conditions

The prompt appears when ALL of these conditions are met:
- User is on a mobile device (detected via user agent)
- App is NOT running in standalone mode (not already installed)
- User has NOT previously dismissed the prompt (no localStorage flag)

The prompt will NOT appear when ANY of these are true:
- User is on desktop (screens 1024px+ or desktop user agent)
- App is running in standalone/installed mode
- User has previously dismissed the prompt
- (Android/Chrome) The `beforeinstallprompt` event hasn't fired

### Styling

- **Position**: Fixed, 5rem from bottom (`bottom-20`) to appear above bottom nav
- **Z-index**: 50 (above content, below modals)
- **Design**: White rounded card with shadow, primary color accent
- **Responsive**: Hidden on desktop via `lg:hidden` class

### Testing

1. **Android Chrome Test**:
   - Open site in Chrome on Android
   - Verify banner appears with "Install App" button
   - Click button, verify native prompt appears
   - Accept install, verify app appears on home screen

2. **iOS Safari Test**:
   - Open site in Safari on iPhone/iPad
   - Verify banner shows share icon instructions
   - Follow instructions to add to home screen
   - Verify app opens in standalone mode

3. **Dismissal Test**:
   - View the prompt on mobile
   - Click X to dismiss
   - Refresh page, verify prompt does not reappear
   - Check localStorage for `pwa-install-dismissed` key

4. **Standalone Mode Test**:
   - Install app to home screen
   - Open from home screen icon
   - Verify prompt never appears in standalone mode

5. **Desktop Test**:
   - Open site on desktop browser
   - Verify prompt never appears regardless of window size

### Code Example

```svelte
<!-- Usage in layout -->
<script>
  import InstallPrompt from '$lib/components/InstallPrompt.svelte';
</script>

<!-- Renders above bottom navigation on mobile -->
<InstallPrompt />
```

---

## Mobile Navigation

### Overview

TeamTime provides a comprehensive mobile navigation system with full feature parity to desktop.

### Components

1. **Bottom Navigation Bar** - Fixed 5-item quick access bar
2. **Hamburger Menu** - Top-left menu icon opens slide-out panel
3. **Slide-out Panel** - Full navigation with user info, all menu items, and logout

### Implementation

- Responsive design hides desktop sidebar on mobile (`lg:hidden`)
- Touch-optimized targets (minimum 44x44px)
- Safe area insets for notched devices

---

## Push Notifications

### Overview

TeamTime supports web push notifications for real-time alerts about tasks, messages, and schedule changes.

### Supported Events

- New task assignments
- Task due/overdue reminders
- New messages
- Schedule changes
- Purchase approval decisions
- Shift reminders

### Implementation

- VAPID-based web push via service worker
- User opt-in required
- Configurable notification preferences per user

---

## Item Pricing & eBay Routing

### Overview

TeamTime includes a specialized workflow for documenting item pricing decisions and routing items to appropriate sales channels (Store or eBay). This feature supports estate sale operations where items need to be priced, documented with photos, and potentially listed online.

### User Experience

#### Creating a Pricing Decision

1. Navigate to **Pricing** from the main navigation
2. Click **Price New Item** button
3. Fill in the form:
   - **Item Description** (required) — Describe the item
   - **Price** (required) — Set the price (must be positive)
   - **Price Justification** (required, min 10 chars) — Explain why this price was chosen
   - **Destination** — Choose "Store" or "eBay"
   - **eBay Reason** (required for eBay) — Explain why item should be listed online
   - **Photos** (required) — Capture at least one photo of the item
4. GPS location is captured automatically if permission granted
5. Submit to create an immutable pricing record

#### Viewing Pricing History

- **All Users**: Can view their own pricing decisions at `/pricing`
- **Managers/Admins**: Can view all pricing decisions across all users
- Each decision shows destination badge, description, price, and date

#### eBay Workflow

When an item is marked for eBay:
1. System automatically creates an eBay listing task
2. Task includes item description, price, justification, and photos
3. Users with "Can List on eBay" permission see tasks at `/ebay/tasks`
4. Users can claim tasks and mark them completed when listed

### Permissions

| Role | View Own | View All | Create | eBay Tasks |
|------|----------|----------|--------|------------|
| Staff | Yes | No | Yes | If permission granted |
| Purchaser | Yes | No | Yes | If permission granted |
| Manager | Yes | Yes | Yes | Always |
| Admin | Yes | Yes | Yes | Always |

**Special Permission**: `canListOnEbay`
- Enabled per-user in Admin → Users → [User] → Special Permissions
- Allows user to access eBay Tasks queue
- Managers and Admins always have this access

### Admin Analytics

Managers and Admins can access pricing analytics at `/admin/pricing`:
- **Date Range Filter** — Filter by start/end date (default: last 30 days)
- **Total Stats** — Total items priced and total value
- **By Destination** — Breakdown of Store vs eBay items
- **By User** — Items priced per user with total value and averages
- **Recent Decisions** — Quick links to recent pricing decisions

### Database Schema

**Tables**:
- `pricing_decisions` — Main record with user, item, price, destination, location
- `pricing_decision_photos` — Photos attached to pricing decisions

**Key Constraints**:
- Price must be positive
- Price justification minimum 10 characters
- eBay reason required when destination is 'ebay'
- Decisions are immutable (no updatedAt field)

### Routes

| Path | Description | Access |
|------|-------------|--------|
| `/pricing` | View pricing history | All authenticated users |
| `/pricing/new` | Create new pricing decision | All authenticated users |
| `/pricing/[id]` | View pricing decision details | Owner, Manager, Admin |
| `/ebay/tasks` | View/claim eBay listing tasks | canListOnEbay permission |
| `/admin/pricing` | Pricing analytics dashboard | Manager, Admin |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pricing-decisions` | GET | List pricing decisions |
| `/api/pricing-decisions` | POST | Create pricing decision |
| `/api/pricing-decisions/[id]` | GET | Get single decision |
| `/api/ebay-tasks` | GET | List eBay tasks |
| `/api/ebay-tasks/[id]/claim` | POST | Claim an eBay task |
| `/api/ebay-tasks/[id]/complete` | POST | Mark task completed |

### Implementation Files

- **Schema**: `src/lib/server/db/schema.ts` — `pricingDecisions`, `pricingDecisionPhotos` tables
- **Migration**: `migrations/add-item-pricing-system.sql`
- **API**: `src/routes/api/pricing-decisions/`, `src/routes/api/ebay-tasks/`
- **UI**: `src/routes/(app)/pricing/`, `src/routes/(app)/ebay/tasks/`, `src/routes/(app)/admin/pricing/`

---

*Last updated: December 2024*
