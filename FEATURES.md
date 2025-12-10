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

## Inventory Drops (AI-Powered Batch Identification)

### Overview

Inventory Drops streamline bulk item submission for AI-powered identification. Instead of pricing items one-by-one, users can upload multiple photos and let Claude AI identify individual sellable items, suggest prices, and prepare them for pricing decisions.

### User Experience

#### Creating an Inventory Drop

1. Navigate to **Inventory** → **Drops** from the main navigation
2. Click **New Drop**
3. Upload photos (up to 10) via:
   - Drag-and-drop onto the upload zone
   - Click to select files
   - Camera capture on mobile
4. Add a description of the batch (e.g., "Kitchen items from estate sale")
5. Optionally add pick notes for context
6. Submit the drop

#### AI Processing

After submission, trigger AI processing:

1. View the drop detail page
2. Click **Process with AI**
3. Claude analyzes the photos and identifies:
   - Individual sellable items
   - Suggested prices (where confident)
   - Confidence scores (0.0 - 1.0)
   - Which photos contain each item

#### Post-Processing Workflow

Once processing completes:

1. Review identified items with confidence indicators:
   - **High** (green): 0.8+ confidence
   - **Medium** (yellow): 0.5-0.8 confidence
   - **Low** (red): Below 0.5 confidence
2. Click **Create Pricing** on any item to:
   - Pre-fill description from AI identification
   - Pre-fill suggested price (if available)
   - Attach relevant photos automatically
3. Complete the pricing form with destination (Store/eBay)
4. Item flows into standard pricing/eBay workflow

### Drop Statuses

| Status | Description |
|--------|-------------|
| **Pending** | Awaiting AI processing |
| **Processing** | AI analysis in progress |
| **Completed** | Items identified, ready for pricing |
| **Failed** | Processing error (can be retried) |

### Permissions

| Role | Create Drops | View Own | View All | Process |
|------|--------------|----------|----------|---------|
| Staff | No | - | - | - |
| Purchaser | Yes | Yes | No | Yes |
| Manager | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | Yes |

### Routes

| Path | Description | Access |
|------|-------------|--------|
| `/inventory/drops` | List inventory drops | Purchaser+ |
| `/inventory/drops/new` | Create new drop | Purchaser+ |
| `/inventory/drops/[id]` | View drop, photos, items | Owner or Manager |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/inventory-drops` | GET | List drops (filtered by role) |
| `/api/inventory-drops` | POST | Create new drop with photos |
| `/api/inventory-drops/[id]` | GET | Get drop with photos and items |
| `/api/inventory-drops/[id]` | DELETE | Delete pending drop |
| `/api/inventory-drops/[id]/process` | POST | Trigger AI processing |
| `/api/inventory-drops/[id]/items/[itemId]/create-pricing` | POST | Create pricing from item |

### Database Schema

**Tables**:
- `inventory_drops` — Drop metadata and status
- `inventory_drop_photos` — Photos uploaded with drop
- `inventory_drop_items` — AI-identified items with confidence scores

**Key Fields**:
- `status` enum: pending, processing, completed, failed
- `item_count`: Number of items identified
- `processing_error`: Error message if failed
- `confidence_score`: 0.00-1.00 per item
- `source_photo_ids`: Array linking items to photos

### Implementation Files

- **Schema**: `src/lib/server/db/schema.ts` — `inventoryDrops`, `inventoryDropPhotos`, `inventoryDropItems`
- **API**: `src/routes/api/inventory-drops/`
- **UI**: `src/routes/(app)/inventory/drops/`

---

## AI Operations Assistants

### Overview

TeamTime includes three AI agents ("Shackled Mentats") that provide intelligent operations support:

1. **Office Manager** — Proactive daily operations
2. **Revenue Optimizer** — Pattern analysis and optimization
3. **Ada (Architecture Advisor)** — Interactive system design

### Office Manager

**Purpose**: Monitor attendance, track tasks, support onboarding, coordinate communication.

**Triggers**: Runs on a 15-minute cron schedule during business hours (7 AM - 7 PM).

**Available Tools**:
- `send_message` — Send direct messages to users (with cooldowns)
- `create_task` — Create follow-up tasks (with cooldowns)
- `cancel_task` — Cancel tasks with accountability tracking and user notification
- `view_schedule` — View work schedule by date and location
- `get_available_staff` — Query staff availability and clock-in status
- `send_sms` — Send SMS messages to users
- `trade_shifts` — Facilitate shift trades between users
- `create_schedule` — Create new schedule entries
- `create_recurring_task` — Create recurring task templates
- `create_cash_count_task` — Create cash count tasks
- `process_inventory_photos` — Process inventory batch photos
- Permission management tools (view, grant, change user types)

**Cooldowns** (prevent spam):
- Messages: 30 min per user, 5 min global, 10/hour max
- Tasks: 60 min per user, 10 min global, 5/hour max

**Task Cancellation Features**:
- Cancel tasks that are no longer relevant
- Track accountability (counts as missed or not)
- Automatic notification to assigned user
- Full audit logging

**Configuration** (Admin → AI → Office Manager):
- Enable/disable agent
- Set tone (helpful parent, professional, casual, formal)
- Add custom instructions
- Configure cron schedule
- Set dry-run mode for testing

### Revenue Optimizer

**Purpose**: Analyze patterns across scheduling, tasks, and expenses. Write long-term observations for the Office Manager.

**Triggers**: Runs nightly for comprehensive analysis.

**Available Tools**:
- `write_memory` — Store observations about users, locations, or global patterns
- `create_policy` — Create guidelines for the Office Manager to follow
- `send_recommendation` — Send strategic insights to administrators

**Analysis Areas**:
- Scheduling efficiency
- Task completion rates
- Attendance patterns
- Workflow optimization
- Training needs
- Cost optimization

### Ada (Architecture Advisor)

**Purpose**: Interactive AI consultant for system design decisions.

**Access**: Admin → Architect

**Features**:
- Chat-based interface for architecture discussions
- Tiered model selection:
  - **Quick**: Claude Sonnet for simple questions
  - **Standard**: Claude Opus for normal discussion
  - **Deliberate**: Multi-model (Opus + GPT-4o review + synthesis) for major decisions
- Architecture Decision Records (ADRs)
- Claude Code prompt generation for implementation

**Triggers for Multi-Model**:
- ADR creation
- Schema design discussions
- Prompt generation requests
- Explicit "deliberate" requests

### Configuration

All AI agents are configured in Admin → AI:

- Provider selection (Anthropic, OpenAI, Segmind)
- Model selection per tier
- Custom instructions
- Tone settings
- Enable/disable per agent
- Dry-run mode for testing

### Supported AI Providers

**Anthropic (Claude)**:
- Claude Opus 4 (Most Capable)
- Claude Sonnet 4 (Balanced)
- Claude 3.5 Sonnet/Haiku
- Claude 3 Opus/Sonnet/Haiku (Legacy)

**OpenAI (GPT)**:
- GPT-4o / GPT-4o Mini
- o1 / o1-mini / o1-preview (Reasoning)
- o3-mini (Latest Reasoning)
- GPT-4 Turbo / GPT-4 (Legacy)
- GPT-3.5 Turbo

**Segmind (Multi-Provider Gateway)**:
- Claude models via Segmind
- GPT-5 / GPT-5 Mini / GPT-5 Nano
- Gemini 3 Pro / 2.5 Pro / 2.5 Flash
- DeepSeek Chat / DeepSeek R1 (Reasoning)
- Llama 3.1 405B/70B/8B
- Kimi K2 (262K context)

---

*Last updated: December 2024*
