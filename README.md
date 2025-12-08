# TeamTime

Mobile-first workforce operations system for scheduling, timekeeping, task management, expense tracking, and AI-powered operations assistance.

## Features

### Core Operations
- **Scheduling** — Drag-and-drop shift management with bulk creation and repeat options
- **Time & Attendance** — GPS-enabled clock in/out with audit trail
- **Task Management** — One-off, recurring, and event-triggered tasks
- **Messaging** — 1:1 and broadcast communications with photo support
- **Expense Tracking** — ATM withdrawal reconciliation and purchase approvals
- **Push Notifications** — PWA-enabled alerts for tasks, messages, and schedules
- **Progressive Web App** — Install to home screen with offline support

### AI Mentats System

TeamTime includes three AI-powered assistants ("Shackled Mentats") for intelligent operations support:

#### Office Manager
- **Automated scheduling assistant** — Analyzes availability, preferences, and constraints
- **Shift coverage suggestions** — AI-powered recommendations for open shifts
- **Staffing alerts** — Proactive notifications about understaffing risks
- **Runs on cron** — Automated daily/weekly analysis

#### Revenue Optimizer
- **Business analysis** — Automated review of expenses, purchases, and ROI
- **Cost insights** — Identifies spending patterns and optimization opportunities
- **Performance tracking** — Monitors purchase approval success rates
- **Runs nightly** — Scheduled background analysis

#### Ada - Architecture Advisor
- **Interactive AI consultant** — Chat-based architectural guidance
- **Multi-model consultation** — Uses tiered AI approach for complex decisions:
  - **Quick**: Claude Sonnet for simple questions
  - **Standard**: Claude Opus for normal discussion
  - **Deliberate**: Opus + GPT-4o review + Sonnet synthesis for major decisions
- **Architecture Decision Records (ADRs)** — Automatic documentation of architectural choices
- **Claude Code prompts** — Generates implementation prompts for developers
- **Automatic tier detection** — Escalates to multi-model for schema design, ADRs, and complex decisions

## User Roles

| Role | Description |
|------|-------------|
| **Admin** | Full system access: all communications, audit logs, module control, AI configuration |
| **Manager** | Scheduling, task management, purchase approvals, user management, AI assistant access |
| **Purchaser** | Field purchasing with expense tracking and approval requests |
| **Staff** | Basic access: clock in/out, tasks, messaging |

## Mobile Experience

TeamTime is designed mobile-first with full feature parity:

### Navigation
- **Hamburger Menu** — Tap the menu icon (top-left) to access all navigation including admin features
- **Bottom Nav Bar** — Quick access to Home, Schedule, Tasks, Messages, and Expenses
- **Slide-out Panel** — Full navigation menu with user info, main sections, admin tools, settings, and logout

### PWA Install
- **Android/Chrome** — Automatic install prompt with "Install App" button
- **iOS Safari** — Instructions to tap Share → "Add to Home Screen"
- Prompt can be dismissed and won't show again

### Admin Features (Mobile)

Managers and admins have full access on mobile via the hamburger menu:
- Dashboard, Users, Messages, Schedule, Reports
- Pay Periods, Info Posts, Export Hours, Locations, Settings
- **AI Mentats** — Configure and interact with AI assistants
- **Ada Chat** — Architecture advisor with consultation metadata
- Audit Logs (admin only)
- Modules (admin only)

## Desktop Experience

- **Fixed Sidebar** — Full navigation always visible on screens 1024px+
- **Expanded Views** — Schedule grid, reports, and admin dashboards optimized for larger screens
- **AI Chat Interface** — Full-featured Ada conversation with tier badges and expandable details
- Same functionality as mobile with enhanced layout

## Tech Stack

- **Frontend**: SvelteKit, TailwindCSS, TypeScript
- **Backend**: Node.js, PostgreSQL
- **Auth**: Lucia v3 with PIN + optional 2FA
- **ORM**: Drizzle
- **PWA**: Service Worker with Workbox patterns
- **AI**: Anthropic Claude API, OpenAI GPT API (multi-model consultation)

## Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Push database schema
npm run db:push

# Start development server
npm run dev
```

## Production

```bash
# Build for production
npm run build

# Start with PM2 (recommended)
pm2 start ecosystem.config.cjs

# Or start directly
node build
```

## Environment Variables

```
DATABASE_URL=postgresql://user:pass@localhost:5432/teamtime
AUTH_SECRET=your-32-char-secret
GOOGLE_MAPS_API_KEY=your-api-key
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# AI Configuration (optional - can also be configured in admin UI)
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key
```

## Documentation

- [Spec.md](./Spec.md) — Complete functional specification
- [src/lib/ai/architect/README.md](./src/lib/ai/architect/README.md) — Ada Architecture Advisor documentation

## License

Proprietary - All rights reserved.
