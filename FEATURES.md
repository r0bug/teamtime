# TeamTime Features Documentation

This document provides detailed information about TeamTime features, their implementation, and usage.

## Table of Contents

1. [PWA Install Prompt](#pwa-install-prompt)
2. [Mobile Navigation](#mobile-navigation)
3. [Push Notifications](#push-notifications)
4. [Item Pricing & eBay Routing](#item-pricing--ebay-routing)
5. [Inventory Drops (AI-Powered)](#inventory-drops-ai-powered-batch-identification)
6. [AI Operations Assistants](#ai-operations-assistants)
7. [AI Control Panel](#ai-control-panel)
8. [Timezone Handling](#timezone-handling)
9. [Task Assignment Rules](#task-assignment-rules-automated-triggers)
10. [Privacy Policy & Terms of Service](#privacy-policy--terms-of-service)
11. [Gamification System](#gamification-system)
12. [Sales Dashboard](#sales-dashboard)
13. [Group Chat & Threads](#group-chat--threads)
14. [Shoutouts & Recognition](#shoutouts--recognition)

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
- `send_message` — Send direct messages to users or all staff (with cooldowns)
- `create_task` — Create follow-up tasks (with cooldowns)
- `cancel_task` — Cancel tasks with accountability tracking and user notification
- `view_schedule` — View work schedule by date and location
- `get_available_staff` — Query staff availability and clock-in status
- `send_sms` — Send SMS messages to users or all staff
- `trade_shifts` — Facilitate shift trades between users
- `create_schedule` — Create new schedule entries
- `delete_schedule` — Delete scheduled shifts
- `delete_duplicate_schedules` — Batch delete duplicate shifts
- `create_recurring_task` — Create recurring task templates
- `create_cash_count_task` — Create cash count tasks
- `process_inventory_photos` — Process inventory batch photos
- Permission management tools (view, grant, change user types)

**Broadcast Messaging**:
- `send_message` and `send_sms` support `toAllStaff: true` parameter
- Sends to all active non-admin staff members
- Useful for team-wide announcements and urgent notifications

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

**Technical Notes**:
- **Attendance Context**: Shows ALL currently clocked-in users regardless of when they clocked in. Users clocked in >16 hours are flagged as "likely forgot to clock out"
- **Tool Parameter Validation**: User ID parameters require valid UUIDs. AI receives helpful error messages directing it to use `get_available_staff` to look up IDs by name
- **Streaming**: Tools with no required parameters (like `get_my_permissions`) are handled correctly with empty JSON defaulting to `{}`
- **AI Continuation**: After user confirms an action, the AI automatically continues processing remaining tasks instead of stopping. This enables multi-step workflows like "delete all duplicate schedules" to proceed without manual intervention after each confirmation

### Revenue Optimizer

**Purpose**: Analyze patterns across scheduling, tasks, expenses, and sales. Write long-term observations for the Office Manager.

**Triggers**: Runs nightly at 9pm (after store closing) for comprehensive analysis.

**Available Tools**:
- `write_memory` — Store observations about users, locations, or global patterns
- `create_policy` — Create guidelines for the Office Manager to follow
- `send_recommendation` — Send strategic insights to administrators
- `analyze_sales_patterns` — Analyze sales data and staffing patterns for insights

**Sales Analysis Types** (`analyze_sales_patterns` tool):
- `daily_summary` — Sales, retained, labor cost, profit per day, sales/labor hour
- `hourly_velocity` — How fast sales accumulate throughout the day (detects peak hours)
- `labor_efficiency` — Which staff correlate with higher sales days
- `vendor_performance` — Individual vendor sales, retained, days active, avg daily
- `weekly_trends` — Week-over-week sales, profit, labor costs

**Analysis Areas**:
- Scheduling efficiency
- Task completion rates
- Attendance patterns
- Workflow optimization
- Training needs
- Cost optimization
- **Sales profitability** (retained earnings vs labor costs)
- **Vendor performance** tracking
- **Staffing correlation** with sales

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

## AI Control Panel

### Overview

The AI Control Panel provides administrators with full control over AI agent behavior without requiring code changes. Configure which tools are enabled, set keywords that trigger specific behaviors, and manage context injection rules—all through a web interface.

### Access

**URL**: Admin → AI → Tool Control (`/admin/ai`)

### Features

#### Per-Agent Configuration

Each AI agent (Office Manager, Revenue Optimizer, Architect) can be configured independently:

- **Tool Enable/Disable**: Toggle individual tools on/off
- **Tool Confirmation Override**: Change whether a tool requires user approval
- **Force Keywords**: Define keywords that force a specific tool to run
- **Context Trigger Keywords**: Define keywords that inject specific context

#### Tool Configuration

For each tool, administrators can:

1. **Enable/Disable**: Turn tools on or off without code changes
2. **View Tool Details**: See description and default configuration
3. **Add Force Keywords**: When a user message contains these keywords, the tool will be forced to execute
4. **View Keyword Count**: See how many keywords are configured

**Example Force Keywords**:
- "apply schedule", "create schedule" → forces `create_schedule` tool
- "send sms", "text message" → forces `send_sms` tool

#### Context Provider Configuration

Context providers inject relevant data into AI prompts. Configure:

1. **Enable/Disable**: Control which context is available
2. **Priority Override**: Change the order context is assembled
3. **Trigger Keywords**: Define keywords that cause context injection
4. **Custom Context**: Add custom text to always include

**Available Context Providers**:
| Provider | Description | Default Priority |
|----------|-------------|------------------|
| User Permissions | Current user's access rights | 5 |
| AI Memory | Stored observations and learnings | 10 |
| Staff Roster | Active users with IDs | 15 |
| Attendance | Clock-in/out status (includes forgotten clock-outs) | 20 |
| Tasks | Pending and recent tasks | 25 |
| Locations | Store locations | 30 |

**Example Context Keywords**:
- "schedule", "shift", "staff" → triggers Staff Roster context injection
- "task", "assignment" → triggers Tasks context injection

### Technical Implementation

#### Database Tables

| Table | Purpose |
|-------|---------|
| `ai_tool_config` | Per-tool enable/disable and settings |
| `ai_tool_keywords` | Force keywords per tool |
| `ai_context_config` | Per-provider enable/disable and priority |
| `ai_context_keywords` | Trigger keywords per provider |

#### Cache Behavior

- **30-second TTL**: Configuration changes take effect within 30 seconds
- **Hot Reload**: No server restart required
- **Fallback**: Code defaults used when no database config exists
- **Immediate Invalidation**: Admin changes clear cache instantly

#### API Integration

The configuration service is used by:
- `orchestrator.ts` — Checks force keywords before LLM calls
- `context/index.ts` — Filters and orders context providers
- Admin UI — CRUD operations via form actions

### Files

- **Service**: `src/lib/ai/services/config-service.ts`
- **Schema**: `src/lib/server/db/schema.ts` (ai_tool_*, ai_context_* tables)
- **Admin UI**: `src/routes/(app)/admin/ai/+page.svelte` (Tool Control tab)
- **Server Actions**: `src/routes/(app)/admin/ai/+page.server.ts`

### Usage Example

**Scenario**: You want "create schedule" requests to always use the `create_schedule` tool, even if the AI might otherwise just describe what it would do.

1. Go to Admin → AI → Tool Control
2. Select "Office Manager" agent
3. Find `create_schedule` tool and expand it
4. Add force keyword: "create schedule"
5. Add force keyword: "apply schedule"

Now when a user says "create a schedule for next week", the system will force the `create_schedule` tool to run.

---

## Timezone Handling

### Overview

TeamTime operates in **Pacific Time (America/Los_Angeles)** for all business operations. The server runs in UTC, but all date/time operations are converted to/from Pacific timezone automatically.

### Key Behaviors

#### Server-Side Operations

All server-side date/time operations use Pacific timezone:

- **Clock In/Out**: Times recorded in Pacific, stored as UTC
- **Task Due Dates**: "End of day" means 11:59 PM Pacific
- **Task Rules**: Time windows (e.g., "before 10 AM") evaluated in Pacific
- **Cron Jobs**: Day-of-week and hour checks use Pacific time
- **Reports**: Date range filtering uses Pacific day boundaries
- **AI Context**: All date references provided to AI in Pacific format

#### Client-Side Display

All times displayed to users are in Pacific timezone:

- Dashboard clock times
- Message timestamps
- Schedule views
- "Today" indicators

#### DST Handling

The timezone utility automatically handles Daylight Saving Time:
- **PST** (Pacific Standard Time): UTC-8 (November - March)
- **PDT** (Pacific Daylight Time): UTC-7 (March - November)

### Technical Implementation

**Centralized Utility**: `src/lib/server/utils/timezone.ts`

```typescript
// Key functions available:
parsePacificDatetime(datetimeLocal)   // Parse datetime-local as Pacific
getPacificDayBounds(date)             // Get start/end of day in Pacific
getPacificDateParts(date)             // Get year/month/day/hour/etc in Pacific
toPacificDateString(date)             // Format as "Dec 13, 2025"
toPacificTimeString(date)             // Format as "9:30 AM"
toPacificDateTimeString(date)         // Full datetime format
createPacificDateTime(dateStr, h, m)  // Create Date from Pacific components
```

### Why Pacific Time?

TeamTime was built for Yakima Finds, a business operating in Washington State (Pacific timezone). All scheduling, task rules, and business logic are designed around Pacific business hours.

### Important Notes

1. **Database Storage**: All timestamps stored in UTC (PostgreSQL default)
2. **API Responses**: Dates returned as ISO strings (UTC)
3. **Form Inputs**: `datetime-local` inputs interpreted as Pacific
4. **First Clock-In**: "First clock-in of the day" triggers at Pacific midnight, not UTC midnight

---

## Task Assignment Rules (Automated Triggers)

### Overview

Task Assignment Rules enable automatic task creation based on real-time events like clock-in/out, time worked, or scheduled times. This automates routine task assignments like opening/closing cash counts.

### Trigger Types

| Trigger | Description | When Fires |
|---------|-------------|------------|
| `clock_in` | When any user clocks in | Inline with clock-in API |
| `clock_out` | When any user clocks out | Inline with clock-out API |
| `first_clock_in` | First person at location today | Inline with clock-in API |
| `last_clock_out` | Last person leaving location | Inline with clock-out API |
| `time_into_shift` | After X hours worked | Cron (every 15 min) |
| `task_completed` | When a specific task template is completed | Inline with task completion API |
| `schedule` | Cron-based scheduled time | Cron (every 15 min) |
| `closing_shift` | At specific time for clocked-in users | Cron (every 15 min) |

### Assignment Types

| Type | Description |
|------|-------------|
| `clocked_in_user` | Assign to the user who triggered the event |
| `specific_user` | Assign to a fixed user |
| `role_rotation` | Rotate through eligible users by role |
| `location_staff` | Assign to someone clocked in at location |
| `least_tasks` | Assign to user with fewest active tasks |

### Conditions

Rules can have optional conditions:
- **Location**: Only trigger at specific location
- **Days of Week**: Only trigger on certain days (0=Sunday, 6=Saturday)
- **Time Window**: Only trigger within time range (Pacific timezone)
- **Roles**: Only apply to users with certain roles

### User Primary Location

Users can have a `primaryLocationId` set in their profile. This serves as:
- **Fallback for clock-in**: When a user clocks in without a shift or explicit location, their primary location is used
- **Location-based rules**: Ensures rules like `first_clock_in` and `closing_shift` can fire even without scheduled shifts
- **Admin setting**: Set via `/admin/users/[id]` or database directly

Location determination priority:
1. Explicit location parameter on clock-in
2. Current shift's location
3. User's primary location
4. No location (rules won't match)

### Configuration

**URL**: Admin → Tasks → Rules (`/admin/tasks/rules`)

**Create a Rule**:
1. Go to Admin → Tasks → Rules
2. Click "New Rule"
3. Select trigger type
4. Configure trigger-specific settings (e.g., time into shift hours)
5. Set conditions (location, days, time window)
6. Choose assignment type
7. Select task template OR cash count config
8. Save and enable

### Cron Setup

Rules with `schedule`, `time_into_shift`, or `closing_shift` triggers require an external cron job:

```bash
# Every 15 minutes during business hours (Pacific)
*/15 18-23 * * 1-6 curl -s "http://localhost:3000/api/tasks/cron?secret=YOUR_CRON_SECRET"
*/15 0-5 * * 0,2-6 curl -s "http://localhost:3000/api/tasks/cron?secret=YOUR_CRON_SECRET"
```

### Technical Implementation

**Files**:
- `src/lib/server/services/task-rules.ts` — Rule processing logic
- `src/routes/api/tasks/cron/+server.ts` — Cron endpoint
- `src/routes/api/clock/in/+server.ts` — Clock-in trigger integration
- `src/routes/api/clock/out/+server.ts` — Clock-out trigger integration
- `src/routes/(app)/admin/tasks/rules/` — Admin UI

**Time Window Logic**:
- All times evaluated in Pacific timezone
- `"00:00"` as end time is treated as `"23:59"` (end of day)
- Wrap-around ranges supported (e.g., `"22:00"` to `"02:00"`)

**Deduplication**:
- Scheduled tasks: Checks last 14 minutes to prevent duplicates
- Time-into-shift: One per user per rule per day
- Closing-shift: One per user per rule per day

---

## Privacy Policy & Terms of Service

### Overview

TeamTime includes built-in Privacy Policy and Terms of Service pages for A2P 10DLC SMS compliance and general legal requirements.

### Access

- **Privacy Policy**: `/privacy` (linked from login page)
- **Terms of Service**: `/terms` (linked from login page)

### A2P 10DLC Compliance

The Privacy Policy includes required disclosures for SMS messaging:
- How mobile numbers are collected (employee record)
- How mobile numbers are used (work-related notifications only)
- Statement that numbers are not shared for marketing
- Message frequency disclosure ("Message frequency varies")
- Data rate disclosure ("Message and data rates may apply")
- Opt-out instructions ("Reply STOP to unsubscribe")

### Files

- `src/routes/privacy/+page.svelte` — Privacy Policy page
- `src/routes/privacy/+page.server.ts` — Server config
- `src/routes/terms/+page.svelte` — Terms of Service page
- `src/routes/terms/+page.server.ts` — Server config

---

## Gamification System

### Overview

TeamTime includes a comprehensive gamification system designed to motivate employee performance through game theory principles. The system awards points for positive behaviors (on-time attendance, task completion, quality pricing) and applies penalties for negative behaviors (lateness, missed tasks, poor quality).

### Design Principles

1. **Variable Rewards**: Points vary by action quality, not just completion
2. **Loss Aversion**: Streaks create fear of losing progress
3. **Social Proof**: Leaderboards show peer achievements
4. **Progress Visualization**: Levels and progress bars show advancement
5. **Achievement Unlocks**: Badges provide recognition milestones
6. **Multipliers**: Consistency is rewarded exponentially

### Points Economy

#### Attendance Points

| Action | Points | Notes |
|--------|--------|-------|
| Clock in on time | +10 | Within 5 min of scheduled shift |
| Clock in early | +15 | 5-30 min before shift |
| Clock in late | -5 per 5min | Max -20 points |
| Clock out properly | +5 | No forgotten clock-out |
| Forgotten clock-out | -15 | Required admin fix |

#### Task Points

| Action | Points | Notes |
|--------|--------|-------|
| Complete task | +20 | Base completion |
| Complete before due | +10 | Bonus for early |
| Complete on time | +5 | By due date |
| Complete late | -10 | After due date |
| Add required photos | +5 | When required |
| Add required notes | +5 | When required |
| Task cancelled (your fault) | -20 | countsAsMissed = true |

#### Pricing Points (Admin Graded)

| Grade | Points | Criteria |
|-------|--------|----------|
| Excellent (4.5-5.0) | +25 | Price spot-on, thorough justification, professional photos |
| Good (3.5-4.4) | +15 | Price reasonable, adequate justification, clear photos |
| Acceptable (2.5-3.4) | +5 | Price defensible, basic justification, usable photos |
| Poor (1.0-2.4) | -10 | Price questionable, weak justification, poor photos |

#### Sales Points

| Action | Points | Notes |
|--------|--------|-------|
| Per $100 retained during shift | +5 | Proportional to hours worked |
| Top seller of day | +50 | Bonus for #1 by sales/hour |

### Streak System

Consecutive work days with on-time clock-in and no task failures build a streak:

| Streak Length | Daily Multiplier | Bonus |
|---------------|------------------|-------|
| 1-2 days | 1.0x | None |
| 3-4 days | 1.1x | +10 on day 3 |
| 5-6 days | 1.2x | +25 on day 5 |
| 7+ days | 1.3x | +50 on day 7 |
| 14+ days | 1.4x | +100 on day 14 |
| 30+ days | 1.5x | +250 on day 30 |

**Streak Breaks**: Late clock-in (>15 min), missed task, or no-show
**Streak Preservation**: Days off don't break streak (only scheduled work days count)

### Level Progression

| Level | Points Required | Title |
|-------|-----------------|-------|
| 1 | 0 | Newcomer |
| 2 | 500 | Trainee |
| 3 | 1,500 | Team Member |
| 4 | 3,500 | Reliable |
| 5 | 7,000 | Veteran |
| 6 | 12,000 | Expert |
| 7 | 20,000 | Master |
| 8 | 35,000 | Elite |
| 9 | 60,000 | Legend |
| 10 | 100,000 | Champion |

### Achievements

17 achievements across 5 categories:

#### Attendance Achievements
| Code | Name | Tier | Criteria |
|------|------|------|----------|
| FIRST_CLOCK | First Day | Bronze | First clock-in ever |
| STREAK_7 | Week Warrior | Bronze | 7-day streak |
| STREAK_30 | Monthly Master | Silver | 30-day streak |
| EARLY_BIRD | Early Bird | Bronze | 10 early arrivals |

#### Task Achievements
| Code | Name | Tier | Criteria |
|------|------|------|----------|
| TASK_10 | Getting Started | Bronze | 10 tasks completed |
| TASK_50 | Task Tackler | Silver | 50 tasks completed |
| TASK_100 | Century Club | Gold | 100 tasks completed |

#### Pricing Achievements
| Code | Name | Tier | Criteria |
|------|------|------|----------|
| FIRST_PRICE | Price Tagger | Bronze | First pricing decision |
| PRICE_50 | Pricing Pro | Silver | 50 pricing decisions |
| PRICING_MASTER | Pricing Master | Platinum | Avg grade > 4.5 with 100+ decisions |

### User-Facing Pages

#### Dashboard Gamification Widget
- Level and title display with progress bar
- Current streak with flame icon
- Today's points, weekly points, and rank
- Mini-leaderboard showing top 3
- Recent achievements badges

#### Leaderboard (`/leaderboard`)
- Weekly and monthly toggle
- User's current position card
- Full rankings with points, level, and streak
- "How to earn points" reference card

#### Achievements (`/achievements`)
- Progress summary (earned/total with percentage)
- Achievements grouped by category
- Tier badges (Bronze, Silver, Gold, Platinum)
- Earned date and lock status

### Admin Features

#### Pricing Grading (`/admin/pricing/grading`)
- Queue of ungraded pricing decisions
- Stats showing graded/ungraded counts
- Detail view with photos and justification
- Slider-based grading (1-5) for:
  - Price Accuracy (40% weight)
  - Justification Quality (30% weight)
  - Photo Quality (30% weight)
- Optional feedback field
- Points auto-calculated and awarded

### Staff Feedback Features

#### Pricing Feedback Display (`/pricing/[id]`)
Staff can view their grading results on any priced item:
- Overall grade with color-coded badge (Excellent/Good/Acceptable/Needs Improvement)
- Points awarded (+25, +15, +5, or -10)
- Individual star ratings for each criterion
- Manager feedback text (if provided)
- Grader name and date
- "Awaiting Review" notice for ungraded items

#### Pricing Performance (`/achievements`)
The Achievements page includes a "Pricing Performance" section:
- **Overview Stats**: Average grade, total graded, points earned, excellent count
- **Grade Distribution**: Visual bar chart showing percentage of each grade level
- **Category Averages**: Star ratings for Price Accuracy, Justification Quality, Photo Quality
- **Recent Grades**: Last 5 graded items with links to full details

This section only appears if the user has at least one graded pricing decision.

### Cron Jobs

**Points Cron** (`/api/points/cron`):
- Runs daily at 3 AM Pacific
- Processes yesterday's sales attribution
- Resets weekly points on Sunday
- Resets monthly points on 1st

**Setup**:
```bash
0 11 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://yourapp.com/api/points/cron
```

### Database Schema

| Table | Purpose |
|-------|---------|
| `point_transactions` | Immutable ledger of all point changes |
| `user_stats` | Aggregated stats (totals, streaks, levels) |
| `achievements` | Achievement definitions |
| `user_achievements` | Earned achievements per user |
| `pricing_grades` | Admin grades for pricing decisions |
| `leaderboard_snapshots` | Historical rankings (optional) |
| `team_goals` | Collective team goals (optional) |

### Files

- **Services**: `src/lib/server/services/points-service.ts`, `achievements-service.ts`, `sales-attribution-service.ts`
- **Pages**: `src/routes/(app)/leaderboard/`, `achievements/`, `admin/pricing/grading/`
- **Cron**: `src/routes/api/points/cron/+server.ts`
- **Schema**: `src/lib/server/db/schema.ts` (gamification tables)

---

*Last updated: December 2024*

---

## Sales Dashboard

### Overview

The Sales Dashboard provides visibility into daily sales, vendor performance, and profitability metrics. Data is automatically imported from NRS Accounting via an hourly scraper during business hours.

### Access

**URL**: `/sales` (available to all authenticated users via main navigation)

### Features

#### Summary Cards
- **Total Retained**: Sum of retained earnings for the period
- **Total Sales**: Gross sales for the period
- **Avg Daily Retained**: Average daily retained earnings
- **Avg Daily Sales**: Average gross daily sales

#### View Modes

**Daily View**:
- Interactive line chart showing Sales vs Retained over time
- Configurable date range (7, 14, or 30 days)
- Hover tooltips on data points
- Detailed table with date, sales, vendor payout, retained, and vendor count

**Weekly View**:
- Horizontal bar chart aggregating by week
- Shows total retained with gradient bars
- Displays number of days with data per week

**Vendor View**:
- Top vendors ranked by total sales
- Progress bars showing relative performance
- Shows both total sales and retained earnings per vendor

### Data Collection

**Sales Scraper** (`scraper-imports/`):
- Pulls daily vendor sales from NRS Accounting
- Runs hourly during business hours:
  - M-S: 12pm - 8pm
  - Sun: 1pm - 6pm
- Stores snapshots in `sales_snapshots` table with vendor JSONB data

**Import API**:
- `POST /api/sales/import` — Accepts scraper JSON output
- Authenticated via `CRON_SECRET` Bearer token

**Query API**:
- `GET /api/sales` — Query sales snapshots
- Supports `?date=`, `?startDate=`, `?endDate=`, `?latest=true`, `?limit=`

### Office Manager Integration

The Office Manager has access to the `view_sales` tool:
- Query any date's sales data
- Calculate profitability (retained - labor costs)
- Show top vendors, totals, vendor counts

### Files

- `src/routes/(app)/sales/+page.svelte` — Dashboard UI
- `src/routes/(app)/sales/+page.server.ts` — Server data loading
- `src/routes/api/sales/+server.ts` — Query API
- `src/routes/api/sales/import/+server.ts` — Import API
- `src/lib/ai/tools/office-manager/view-sales.ts` — Office Manager tool
- `scraper-imports/` — NRS scraper scripts and configuration

---

## Group Chat & Threads

### Overview

TeamTime includes a comprehensive group chat system with Slack-style threaded replies. Groups can be auto-synced with user types (employee categories) or created as custom groups by administrators.

### Key Features

1. **Auto-Synced Groups**: Each user type automatically gets a group chat. Membership syncs when users' types change.
2. **Custom Groups**: Admins can create arbitrary groups with manual membership control.
3. **Threaded Replies**: Click any message to open a slide-out thread panel for focused discussions.
4. **Group Conversations**: Each group has one persistent conversation that never ends.

### User Experience

#### Viewing Groups

1. Navigate to **Messages** from the main navigation
2. Groups appear in a dedicated "Group Chats" section at the top
3. Each group shows:
   - Colored avatar with first letter of group name
   - Member count
   - Last message preview
   - Unread indicator

#### Using Threads

1. In any conversation, messages with replies show a thread indicator
2. Click "View thread" or the reply count to open the thread panel
3. Thread panel slides in from the right
4. Reply within the thread to keep discussions organized
5. Thread replies don't clutter the main conversation

#### Group Management (Admin)

1. Navigate to **Admin → User Management → Groups**
2. View all groups with member counts and type indicators
3. Click **Sync User Types** to create/update groups for all user types
4. Click **+ Create Group** for custom groups
5. Manage individual group settings:
   - Edit name (custom groups only), description, and color
   - Add/remove members
   - Activate/deactivate groups
   - View the group chat directly

### Group Types

| Type | Description | Membership |
|------|-------------|------------|
| **Auto-Synced** | Linked to a user type | Automatic based on user's type |
| **Custom** | Created by admin | Manual add/remove |

### Auto-Sync Behavior

When a user's user type changes:
1. They are removed from their old type's group (if auto-assigned)
2. They are added to their new type's group (if one exists)
3. Manually-added members are not affected by sync

### Permissions

| Action | Who Can Do It |
|--------|---------------|
| View groups | Members only |
| Send messages | Members only |
| Create custom group | Admin |
| Sync user type groups | Admin |
| Add/remove members | Admin |
| Edit group settings | Admin |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/groups` | GET | List groups (user's groups or all for admin) |
| `/api/groups` | POST | Create custom group |
| `/api/groups/[id]` | GET | Get group details |
| `/api/groups/[id]` | PATCH | Update group |
| `/api/groups/[id]` | DELETE | Delete group |
| `/api/groups/[id]/members` | GET | List group members |
| `/api/groups/[id]/members` | POST | Add member |
| `/api/groups/[id]/members/[userId]` | DELETE | Remove member |
| `/api/groups/sync` | POST | Sync all user type groups |
| `/api/conversations/[id]/messages/[messageId]/thread` | GET | Get thread replies |
| `/api/conversations/[id]/messages/[messageId]/thread` | POST | Reply to thread |

### Database Schema

**New Tables**:

| Table | Purpose |
|-------|---------|
| `groups` | Group metadata with conversation link |
| `group_members` | Membership with role and auto-assign tracking |
| `thread_participants` | Thread read tracking |

**Modified Tables**:

| Table | Changes |
|-------|---------|
| `messages` | Added `parent_message_id`, `thread_reply_count`, `last_thread_reply_at` |
| `conversations` | Added `group` to type enum |

**Key Columns in `groups`**:
- `conversation_id` — Links to the group's conversation (unique)
- `linked_user_type_id` — Links to user type for auto-sync (unique, nullable)
- `is_auto_synced` — Whether membership syncs with user type
- `color` — Display color for the group avatar

**Key Columns in `group_members`**:
- `role` — 'admin' or 'member'
- `is_auto_assigned` — Whether added by sync (vs manually)
- `added_by` — Who added this member (null for auto)

### Files

**Service Layer**:
- `src/lib/server/services/group-sync.ts` — All group operations

**API Routes**:
- `src/routes/api/groups/+server.ts` — List and create
- `src/routes/api/groups/[id]/+server.ts` — CRUD operations
- `src/routes/api/groups/[id]/members/+server.ts` — Member management
- `src/routes/api/groups/[id]/members/[userId]/+server.ts` — Remove member
- `src/routes/api/groups/sync/+server.ts` — Sync trigger
- `src/routes/api/conversations/[id]/messages/[messageId]/thread/+server.ts` — Thread API

**Admin UI**:
- `src/routes/(app)/admin/groups/+page.svelte` — Group management page
- `src/routes/(app)/admin/groups/+page.server.ts` — Server actions

**User UI**:
- `src/routes/(app)/messages/+page.svelte` — Updated with Groups section
- `src/routes/(app)/messages/[id]/+page.svelte` — Thread panel integration

**Schema**:
- `src/lib/server/db/schema.ts` — `groups`, `groupMembers`, `threadParticipants` tables

**Migration**:
- `migrations/add_groups_and_threads.sql` — SQL migration file

---

## Shoutouts & Recognition

### Overview

The Shoutouts & Recognition system enables peer recognition and manager awards, integrated directly into existing workflows. Points are awarded through the gamification system when shoutouts are approved.

### Recognition Types

#### Peer Shoutouts (Require Manager Approval)
- Any staff member can nominate a coworker for recognition
- Nominations go to a manager approval queue
- Points are awarded only after manager approval
- Prevents abuse while encouraging team recognition

#### Manager Awards (Auto-Approved)
- Managers can directly award recognition
- Points are awarded immediately
- Available award types are configurable

#### AI-Generated Recognition (Auto-Approved)
- The Office Manager AI can proactively recognize patterns
- Auto-approved since AI is trusted
- Examples: streak milestones, consistent performance, going above and beyond

### Award Types

8 configurable award types with varying point values:

| Award | Category | Points | Icon | Manager Only |
|-------|----------|--------|------|--------------|
| Above & Beyond | Initiative | 100 | 🌟 | Yes |
| Customer Hero | Customer | 75 | 🦸 | Yes |
| Quality Champion | Quality | 75 | 💎 | Yes |
| Great Idea | Innovation | 100 | 💡 | Yes |
| Team Player | Teamwork | 50 | 🤝 | No |
| Helpful Mentor | Mentoring | 50 | 📚 | No |
| Reliable Rock | Reliability | 50 | 🏔️ | No |
| Quick Shoutout | General | 25 | 👏 | No |

### Workflow Integration

Recognition is embedded into existing workflows rather than a standalone page:

1. **After Task Completion** — Option to recognize the person who completed a task
2. **Pricing Grading** — Suggest shoutout when grading excellent work (5.0)
3. **Messages** — Quick shoutout button in conversation headers
4. **User Lists** — Shoutout icon next to each user in admin views
5. **Dashboard** — "Recent Recognition" widget shows public shoutouts

### Manager Approval Queue

Managers access pending nominations at `/admin/shoutouts`:

- View pending peer nominations
- See nominator, recipient, award type, and reason
- Approve (awards points) or Reject (with optional reason)
- Recent approved shoutouts display below
- Award types reference panel

### Office Manager AI Tools

The Office Manager AI has full access to the points system:

**`view_points`** — Query user points, level, streak, and leaderboard position
- Parameters: `userId` (optional), `period` (today/week/month/all)
- Read-only, no cooldowns

**`award_points`** — Award 1-500 bonus points with reason
- Parameters: `userId`, `points`, `reason`, `category`
- Rate limited: 10 per hour, 60s cooldown per user

**`give_shoutout`** — Create public recognition (auto-approved)
- Parameters: `userId`, `title`, `category`, `description`, `awardTypeId`
- Rate limited: 5 per hour, 120s cooldown per user

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/shoutouts` | GET | List shoutouts (with status filter) |
| `/api/shoutouts` | POST | Create shoutout/nomination |
| `/api/shoutouts/[id]` | GET | Get shoutout details |
| `/api/shoutouts/[id]/approve` | POST | Manager approves (awards points) |
| `/api/shoutouts/[id]/reject` | POST | Manager rejects |
| `/api/shoutouts/pending` | GET | Get pending approval queue |
| `/api/award-types` | GET | List available award types |

### Components

**`ShoutoutButton.svelte`** — Compact trigger button
- Props: `userId`, `userName`, `variant` (icon/text/full)
- Opens ShoutoutModal on click

**`ShoutoutModal.svelte`** — Recognition creation form
- Award type selector with point preview
- Title and optional description
- Shows approval requirement for peer nominations

**`RecentShoutouts.svelte`** — Recognition feed widget
- Props: `limit`, `compact`
- Displays recent public shoutouts with relative timestamps
- Shows award icon, recipient, title, nominator, and points

### Points Integration

Shoutout points use the existing gamification system:
- Category: `bonus`
- Action: `shoutout_received`
- SourceType: `shoutout`
- Streak multiplier: Not applied (bonus points are fixed)

### Database Schema

**`shoutouts` table**:
- `id`, `recipient_id`, `nominator_id`, `approved_by_id`
- `award_type_id`, `title`, `description`, `category`
- `status` (pending/approved/rejected), `is_manager_award`, `is_ai_generated`
- `points_awarded`, `is_public`, `approved_at`, `created_at`

**`award_types` table**:
- `id`, `name`, `description`, `category`
- `points`, `icon`, `color`
- `is_active`, `manager_only`, `created_at`

### Key Files

**Service**: `src/lib/server/services/shoutout-service.ts`

**API Routes**: `src/routes/api/shoutouts/`, `src/routes/api/award-types/`

**Components**: `src/lib/components/ShoutoutButton.svelte`, `ShoutoutModal.svelte`, `RecentShoutouts.svelte`

**Admin**: `src/routes/(app)/admin/shoutouts/`

**AI Tools**: `src/lib/ai/tools/office-manager/view-points.ts`, `award-points.ts`, `give-shoutout.ts`

---

*Last updated: December 2024*
