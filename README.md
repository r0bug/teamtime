# TeamTime

**The complete mobile workforce platform for field operations, estate sales, and retail teams.**

TeamTime eliminates the friction of managing distributed teams. Clock in with GPS verification, submit purchase approvals with photos, and get AI-powered operational insights—all from your phone.

Built for Yakima Finds, refined for any business where your team works in the field.

## Why TeamTime?

Traditional workforce tools assume everyone sits at a desk. TeamTime was built for **real-world operations**:

- **Estate sale crews** pricing items on-site and requesting purchase approvals
- **Retail teams** clocking in at multiple locations with GPS verification
- **Field workers** completing photo-documented tasks and procedures
- **Managers** getting AI-powered insights without being glued to a dashboard

## Core Features

### Time & Attendance
- GPS-verified clock in/out from any device
- Real-time "who's working where" visibility
- Automatic shift matching and overtime tracking
- Export to CSV for payroll integration

### Task Management
- Assign one-off or recurring tasks with photo requirements
- Event-triggered tasks (e.g., "Opening Procedure" on first clock-in)
- **Advanced assignment rules** with 7 trigger types and 5 assignment methods
- Chain tasks (trigger new task on completion of another)
- Scheduled tasks via cron expressions
- Priority levels and due date tracking
- Completion history with location and photo evidence

### Item Pricing & eBay Routing
- Document pricing decisions with photos and justification
- Route items to store or eBay with one tap
- Auto-create eBay listing tasks for online items
- Pricing analytics by user, date range, and destination

### Inventory Drops (AI-Powered)
- Upload photos of bulk inventory
- Claude AI identifies individual items and suggests prices
- Create pricing decisions directly from AI identifications
- Confidence scoring for each identification

### Expense Tracking
- Log ATM withdrawals with location and receipt photos
- Allocate funds to products with photo documentation
- Full audit trail from withdrawal to purchase
- Manager approval workflow for large purchases

### Team Communication
- Direct messaging between any team members
- Broadcast messages to all staff
- **Group chats** with auto-sync to user types (employee categories)
- **Custom groups** created by admins with manual membership
- **Threaded replies** — Slack-style threads to keep discussions organized
- Photo attachments for "where is this item?" scenarios
- Conversation history retained for accountability

### Gamification System
- **Points economy** for attendance, tasks, pricing quality, and sales performance
- **10-level progression** from Newcomer to Champion
- **Streak system** with multipliers up to 1.5x for consistent performance
- **17 achievements** across 5 categories (attendance, tasks, pricing, sales, special)
- **Public leaderboards** (weekly/monthly) for team competition
- **Admin pricing grading** with slider-based scoring (1-5) affecting points
- **Daily sales attribution** based on shift hours worked
- **Shoutouts & Recognition** — Peer nominations (with manager approval) and manager awards
- **8 award types** with configurable point values (25-100 pts)
- Loss aversion mechanics and social proof to drive engagement

### AI Operations Assistants ("Shackled Mentats")

Three specialized AI agents run in the background:

**Office Manager** — Monitors attendance, flags missing staff, creates/cancels tasks, sends proactive messages, views schedules, manages permissions, and awards recognition. 25 tools available including points management (view_points, award_points, give_shoutout). Interactive chat interface with streaming responses and tool confirmations. Runs on a 15-minute cron schedule during business hours.

**Revenue Optimizer** — Analyzes patterns across scheduling, task completion, and expenses. Writes long-term observations and creates policies for the Office Manager to follow. 4 specialized tools. Runs nightly.

**Ada (Architecture Advisor)** — Interactive AI consultant for system design decisions. Uses tiered models (quick, standard, deliberate) and creates Architecture Decision Records. 5 tools for code analysis and documentation.

### AI Control Panel

Full administrative control over AI behavior via `/admin/ai → Tool Control`:

- **Per-Agent Tool Configuration**: Enable/disable individual tools for each mentat
- **Force Keywords**: Define keywords that force specific tools to run (e.g., "apply schedule" forces `create_schedule`)
- **Context Trigger Keywords**: Keywords that inject relevant context into the AI prompt (e.g., "staff" triggers user roster loading)
- **Hot Reload**: Configuration changes take effect within 30 seconds (no restart required)
- **Fallback Behavior**: Code defaults are used when no database configuration exists

**Supported AI Providers**:
- Anthropic (Claude 4/3.5/3 series)
- OpenAI (GPT-4o, o1, o3-mini, GPT-4/3.5)
- Segmind (Gateway to Claude, GPT-5, Gemini, DeepSeek, Llama, Kimi)

## User Roles

| Role | Access |
|------|--------|
| **Admin** | Everything: all communications, audit logs, module control, AI configuration |
| **Manager** | Scheduling, task management, purchase approvals, user management, reports |
| **Purchaser** | Field purchasing, ATM withdrawals, purchase requests, expense tracking |
| **Staff** | Clock in/out, assigned tasks, messaging, personal schedule |

## Mobile Experience

TeamTime is **mobile-first**. The same URL works on desktop, but the experience is optimized for phones:

- **Bottom navigation** for quick access to Home, Schedule, Tasks, Messages, Expenses
- **Hamburger menu** slides out full navigation including admin features
- **PWA install** prompts on Android/iOS for home screen access
- **Offline-tolerant** with queued sync for clock events and messages

### Install to Home Screen

**Android/Chrome**: Custom banner intercepts the browser install prompt—one tap to add.

**iOS Safari**: Visual instructions guide users through Share → Add to Home Screen.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | SvelteKit 2, TailwindCSS, TypeScript |
| Backend | Node.js, PostgreSQL 15 |
| ORM | Drizzle with type-safe queries |
| Auth | Lucia v3 with PIN/password + optional 2FA |
| AI | Anthropic Claude, OpenAI GPT, Segmind (multi-provider) |
| PWA | Service Worker with Workbox patterns |
| Timezone | Pacific Time (America/Los_Angeles) - DST-aware |

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database URL and API keys

# Push database schema
npm run db:push

# Start development server
npm run dev
```

## Production Deployment

```bash
# Build for production
npm run build

# Start with PM2 (recommended)
pm2 start ecosystem.config.cjs

# Or start directly
node build
```

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/teamtime
AUTH_SECRET=your-32-char-secret

# Optional - GPS features
GOOGLE_MAPS_API_KEY=your-api-key

# Optional - Push notifications
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# Optional - AI features (can also configure in admin UI)
# API keys are stored in .ai-keys.json and managed via Admin → AI → API Keys
# Supported providers: Anthropic, OpenAI, Segmind
```

## Project Structure

```
src/
├── lib/
│   ├── server/         # Auth, database, email services, timezone utils
│   ├── components/     # Reusable Svelte components
│   ├── ai/             # AI orchestrators, tools, context providers
│   └── utils/          # Date formatting, geolocation helpers
├── routes/
│   ├── (app)/          # Authenticated pages
│   │   ├── admin/      # Manager/admin dashboards
│   │   ├── tasks/      # Task management
│   │   ├── pricing/    # Item pricing workflow
│   │   ├── inventory/  # AI-powered inventory drops
│   │   ├── expenses/   # ATM withdrawals and allocations
│   │   ├── messages/   # Team communication
│   │   └── schedule/   # Shift viewing and management
│   ├── api/            # REST endpoints
│   └── login/          # Authentication pages
└── static/             # PWA manifest, icons
```

## API Overview

TeamTime exposes **70+ REST endpoints** organized by domain:

- `/api/clock/in`, `/api/clock/out` — Time tracking (triggers task rules + points)
- `/api/tasks`, `/api/tasks/[id]/complete` — Task management (awards points)
- `/api/tasks/cron` — Scheduled task processing (call every 15 min)
- `/api/pricing-decisions` — Item pricing with photos
- `/api/inventory-drops`, `/api/inventory-drops/[id]/process` — AI inventory
- `/api/atm-withdrawals`, `/api/purchase-requests` — Expense tracking
- `/api/conversations`, `/api/messages` — Team messaging
- `/api/ai/cron` — AI agent triggers
- `/api/architect/chats` — Architecture advisor
- `/api/points/cron` — Daily gamification processing (sales attribution, resets)

All endpoints require authentication except static files. Role-based authorization is enforced at the API layer.

## Documentation

- **[Spec.md](./Spec.md)** — Complete functional specification
- **[FEATURES.md](./FEATURES.md)** — Detailed feature documentation
- **[src/lib/ai/architect/README.md](./src/lib/ai/architect/README.md)** — Architecture Advisor docs

## Database

53 tables organized across domains:

- **Core**: users, sessions, locations, shifts, time_entries
- **Tasks**: task_templates, tasks, task_completions, task_photos, task_assignment_rules
- **Pricing**: pricing_decisions, pricing_decision_photos, pricing_grades
- **Inventory**: inventory_drops, inventory_drop_photos, inventory_drop_items
- **Expenses**: atm_withdrawals, withdrawal_allocations, purchase_requests
- **Messaging**: conversations, messages, message_photos, groups, group_members, thread_participants
- **Gamification**: point_transactions, user_stats, achievements, user_achievements, leaderboard_snapshots, team_goals, shoutouts, award_types
- **AI System**: ai_config, ai_actions, ai_memory, ai_policy_notes, ai_tool_config, ai_tool_keywords, ai_context_config, ai_context_keywords
- **Admin**: app_settings, audit_logs, info_posts

## License

Proprietary - All rights reserved.

---

*Built for [Yakima Finds](https://yakimafinds.com) by the TeamTime team.*
