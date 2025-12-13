# TeamTime Codebase Documentation

> **Generated**: December 11, 2025
> **Version**: 1.0.0-alpha
> **Purpose**: Comprehensive developer reference for the TeamTime workforce operations platform
> **Release Status**: Alpha - Core features complete, ready for testing

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Database Schema](#4-database-schema)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [API Endpoints](#6-api-endpoints)
7. [Frontend Architecture](#7-frontend-architecture)
8. [AI System ("Shackled Mentats")](#8-ai-system-shackled-mentats)
9. [Configuration & Deployment](#9-configuration--deployment)
10. [Known Issues & Technical Debt](#10-known-issues--technical-debt)
11. [Development Guide](#11-development-guide)

---

## 1. Project Overview

**TeamTime** is a mobile-first workforce operations platform designed for field teams, estate sales crews, and retail operations. Built for Yakima Finds but designed to be deployable to any business requiring mobile workforce management.

### Core Features

| Module | Description |
|--------|-------------|
| **Time & Attendance** | GPS-verified clock in/out with real-time "who's working where" |
| **Task Management** | Advanced task assignment with 7 trigger types and 5 assignment methods |
| **Inventory Drops** | AI-powered bulk item identification using Claude Vision |
| **Item Pricing** | Pricing decisions with eBay routing and photo documentation |
| **Expense Tracking** | ATM withdrawals with full allocation audit trail |
| **Team Messaging** | Direct & broadcast messaging with photo attachments |
| **Push Notifications** | PWA support with Workbox for offline capability |
| **AI Agents** | Three specialized AI agents for automation and guidance |

### Key URLs

- **GitHub**: https://github.com/r0bug/teamtime.git
- **Branch**: main

---

## 2. Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| SvelteKit | 2.5.0 | Meta-framework |
| Svelte | 4.2.10 | Component framework |
| TailwindCSS | 3.4.1 | Utility-first CSS |
| TypeScript | 5.3.3 | Type safety |
| Vite | 5.1.0 | Build tool |
| Workbox | 7.0.0 | PWA/Service worker |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | >=18.0.0 | Runtime |
| PostgreSQL | 15 | Database |
| Drizzle ORM | 0.29.3 | Type-safe ORM |
| Lucia | 3.1.1 | Authentication |
| Argon2 | @node-rs/argon2 | Password hashing |

### AI Providers
| Provider | Models | Purpose |
|----------|--------|---------|
| Anthropic | Claude 4/3.5/3 | Primary AI |
| OpenAI | GPT-4o, o1, o3-mini | Alternative/Review |
| Segmind | Multi-model proxy | Budget alternatives |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Docker | PostgreSQL container |
| PM2 | Process management |
| Web Push | Push notifications |
| Twilio | SMS integration |

---

## 3. Directory Structure

```
/home/robug/teamtime/
├── src/
│   ├── app.d.ts                 # Global TypeScript types
│   ├── app.html                 # HTML template
│   ├── app.css                  # Global styles
│   ├── hooks.server.ts          # Request hooks (auth)
│   ├── service-worker.ts        # PWA service worker
│   │
│   ├── lib/
│   │   ├── ai/                  # AI system (60 files)
│   │   │   ├── architect/       # Ada advisor agent
│   │   │   ├── office-manager/  # Office Manager agent
│   │   │   ├── providers/       # LLM integrations
│   │   │   ├── tools/           # AI tools
│   │   │   ├── context/         # Context assembly
│   │   │   ├── prompts/         # System prompts
│   │   │   └── types.ts         # AI type definitions
│   │   │
│   │   ├── server/
│   │   │   ├── auth/            # Authentication system
│   │   │   ├── db/              # Database (schema.ts)
│   │   │   ├── email/           # Email service
│   │   │   ├── jobs/            # Background jobs
│   │   │   ├── services/        # Business logic
│   │   │   └── twilio.ts        # SMS service
│   │   │
│   │   ├── components/          # Svelte components
│   │   └── utils/               # Utility functions
│   │
│   └── routes/
│       ├── (app)/               # Protected routes
│       │   ├── dashboard/
│       │   ├── tasks/
│       │   ├── schedule/
│       │   ├── pricing/
│       │   ├── inventory/
│       │   ├── expenses/
│       │   ├── messages/
│       │   ├── settings/
│       │   └── admin/           # Admin routes (21+)
│       │
│       ├── api/                 # REST API (56+ endpoints)
│       ├── login/
│       ├── logout/
│       ├── verify/              # 2FA
│       └── forgot-pin/
│
├── build/                       # Production build output
├── drizzle/                     # Generated migrations
├── migrations/                  # Custom migrations
├── static/                      # Static assets (PWA)
├── uploads/                     # User uploads
│
├── package.json
├── svelte.config.js
├── vite.config.ts
├── drizzle.config.ts
├── tailwind.config.js
├── tsconfig.json
├── docker-compose.yml
├── ecosystem.config.cjs         # PM2 config
└── server.js                    # Production wrapper
```

---

## 4. Database Schema

### Overview
- **ORM**: Drizzle with PostgreSQL
- **Schema File**: `src/lib/server/db/schema.ts` (1,500+ lines)
- **Tables**: 54+ tables across 10 domains
- **Enums**: 20+ database enums

### Table Categories

#### User & Authentication (6 tables)
| Table | Purpose |
|-------|---------|
| `users` | Core user accounts with roles |
| `sessions` | Lucia auth sessions |
| `twoFactorCodes` | 2FA verification codes |
| `userTypes` | Custom user type definitions |
| `permissions` | Route/action permissions |
| `userTypePermissions` | User type to permission mappings |

#### Time & Scheduling (3 tables)
| Table | Purpose |
|-------|---------|
| `locations` | Physical work locations |
| `shifts` | Scheduled work shifts |
| `timeEntries` | Clock in/out with GPS |

#### Task Management (5 tables)
| Table | Purpose |
|-------|---------|
| `taskTemplates` | Reusable task definitions |
| `tasks` | Individual task assignments |
| `taskCompletions` | Task completion records |
| `taskPhotos` | Photo evidence |
| `taskAssignmentRules` | Automatic assignment rules |

#### Inventory & Pricing (5 tables)
| Table | Purpose |
|-------|---------|
| `inventoryDrops` | AI-powered batch submissions |
| `inventoryDropPhotos` | Photos for AI processing |
| `inventoryDropItems` | LLM-identified items |
| `pricingDecisions` | Immutable pricing records |
| `pricingDecisionPhotos` | Pricing reference photos |

#### Financial (4 tables)
| Table | Purpose |
|-------|---------|
| `purchaseRequests` | Purchase approval workflow |
| `atmWithdrawals` | Cash withdrawal tracking |
| `withdrawalAllocations` | Fund allocation |
| `allocationPhotos` | Receipt documentation |

#### AI System (13 tables)
| Table | Purpose |
|-------|---------|
| `aiConfig` | Per-agent configuration |
| `aiActions` | Complete action audit trail |
| `aiCooldowns` | Rate limiting |
| `aiMemory` | Long-term observations |
| `aiPolicyNotes` | Dynamic behavior modifiers |
| `aiToolConfig` | Per-tool enable/disable and settings |
| `aiToolKeywords` | Force keywords that trigger tools |
| `aiContextConfig` | Per-context provider configuration |
| `aiContextKeywords` | Keywords that trigger context injection |
| `architectureDecisions` | ADRs from Ada |
| `architectureChats` | Ada chat sessions |
| `officeManagerChats` | Office Manager sessions |
| `officeManagerPendingActions` | Action confirmations |

### Key Enums

```typescript
// User Roles
userRoleEnum: 'admin' | 'manager' | 'purchaser' | 'staff'

// AI System
aiAgentEnum: 'office_manager' | 'revenue_optimizer' | 'architect'
aiProviderEnum: 'anthropic' | 'openai' | 'segmind'
aiToneEnum: 'helpful_parent' | 'professional' | 'casual' | 'formal'

// Tasks
taskStatusEnum: 'not_started' | 'in_progress' | 'completed' | 'cancelled'
taskPriorityEnum: 'low' | 'medium' | 'high' | 'urgent'
ruleTriggerTypeEnum: 'clock_in' | 'clock_out' | 'first_clock_in' |
                     'last_clock_out' | 'time_into_shift' |
                     'task_completed' | 'schedule'
assignmentTypeEnum: 'specific_user' | 'clocked_in_user' | 'role_rotation' |
                    'location_staff' | 'least_tasks'

// Pricing
pricingDestinationEnum: 'store' | 'ebay'

// Architecture
architectureStatusEnum: 'proposed' | 'approved' | 'in_progress' |
                        'implemented' | 'rejected' | 'superseded'
```

### Database Commands

```bash
npm run db:generate   # Generate migrations from schema
npm run db:migrate    # Apply pending migrations
npm run db:push       # Push schema directly (dev)
npm run db:studio     # Open Drizzle Studio GUI
```

---

## 5. Authentication & Authorization

### Authentication Flow

```
Login Page (/login)
    ↓
Credential Verification (PIN or Password)
    ↓
Check 2FA Requirement
    ├─ Same IP within 30 days → Create Session
    └─ New device → Send 2FA Code → /verify
        ↓
Session Created → Dashboard
```

### Session Management

- **Library**: Lucia v3
- **Storage**: PostgreSQL `sessions` table
- **Cookie**: HTTP-only, Secure (production), SameSite=Lax
- **Duration**: Sliding window with automatic refresh

### Role Hierarchy

```
admin → manager → purchaser → staff
  ↓        ↓          ↓          ↓
 All    Admin+     Purchase+   Basic
Access  Features   Features   Access
```

### Permission System

Two-tier permission model:
1. **Role-based**: Built-in permissions per role
2. **User Types**: Granular custom permissions

```typescript
// Permission Check Priority
1. Explicit Deny (highest)
2. Explicit Grant
3. Role-based Fallback (lowest)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/server/auth/index.ts` | Lucia configuration |
| `src/lib/server/auth/roles.ts` | Role checking functions |
| `src/lib/server/auth/permissions.ts` | Granular permissions |
| `src/lib/server/auth/pin.ts` | PIN/password hashing |
| `src/hooks.server.ts` | Session validation |

---

## 6. API Endpoints

### Endpoint Summary (56+ endpoints)

#### Time & Attendance
```
POST /api/clock/in           # Clock in with GPS
POST /api/clock/out          # Clock out with GPS
GET  /api/shifts             # List shifts
POST /api/shifts             # Create shift
```

#### Tasks
```
GET  /api/tasks              # List tasks
POST /api/tasks              # Create task
GET  /api/tasks/[id]         # Get task details
PUT  /api/tasks/[id]         # Update task
POST /api/tasks/[id]/complete # Complete with photos
POST /api/tasks/cron         # Process scheduled rules
```

#### Inventory & Pricing
```
POST /api/inventory-drops              # Create drop
POST /api/inventory-drops/[id]/process # Run AI processing
GET  /api/inventory-drops/[id]/progress # Get status
POST /api/pricing-decisions            # Create pricing
```

#### AI Agents
```
POST /api/architect/chats                    # New Ada session
POST /api/architect/chats/[id]/messages      # Chat with Ada
POST /api/office-manager/chats/[id]/messages # Chat with OM
POST /api/office-manager/chats/[id]/stream   # Stream response
POST /api/office-manager/actions/[id]/confirm # Approve action
```

#### Administration
```
POST /api/admin/access-control/migrate # Migrate users
POST /api/admin/settings/default-user-type
GET  /api/backup                       # Download backup
```

### Authentication Requirements

All API routes require authentication except:
- `/login`, `/logout`, `/verify`, `/forgot-pin`

Role-based restrictions:
- `/api/admin/*` - Manager+
- `/api/office-manager/*` - Manager+
- `/api/users` (POST/DELETE) - Manager+

---

## 7. Frontend Architecture

### Route Groups

| Group | Path | Auth Required |
|-------|------|---------------|
| Public | `/login`, `/verify`, `/forgot-pin` | No |
| App | `/(app)/*` | Yes |
| Admin | `/(app)/admin/*` | Manager+ |

### Key Pages

#### User Pages
- `/dashboard` - Home with statistics
- `/tasks` - Task list and management
- `/schedule` - Work schedule viewing
- `/pricing` - Item pricing workflow
- `/inventory/drops` - AI inventory management
- `/messages` - Team communication
- `/settings` - User preferences

#### Admin Pages
- `/admin/users` - User management
- `/admin/tasks/rules` - Task assignment rules
- `/admin/architect` - Ada AI configuration
- `/admin/office-manager/chat` - Office Manager chat
- `/admin/settings/access-control` - Permissions

### Components

| Component | Purpose |
|-----------|---------|
| `Avatar.svelte` | User avatar display |
| `AvatarUpload.svelte` | Avatar upload with crop |
| `CashCountForm.svelte` | Cash counting form |
| `InstallPrompt.svelte` | PWA install prompt |
| `MarkdownRenderer.svelte` | Markdown to HTML |

### Utilities (`src/lib/utils/`)

```typescript
formatDate(date)          // "Dec 7, 2024"
formatTime(date)          // "7:30 PM"
formatDateTime(date)      // Combined
formatCurrency(amount)    // "$1,234.56"
formatRelativeTime(date)  // "2m ago"
cn(...classes)            // Class name combiner
debounce(fn, wait)        // Debounce wrapper
getInitials(name)         // "JD" from "John Doe"
getLocation()             // Get GPS coordinates
```

---

## 8. AI System ("Shackled Mentats")

### Agents Overview

| Agent | Purpose | Tools |
|-------|---------|-------|
| **Office Manager** | Staff management, scheduling, tasks | 22 tools |
| **Revenue Optimizer** | Analytics, patterns, recommendations | 4 tools |
| **Architect (Ada)** | Code analysis, ADRs, implementation | 5 tools |

### Office Manager Tools

| Tool | Purpose | Cooldown |
|------|---------|----------|
| `send_message` | Direct message to user | 30min/user |
| `create_task` | Create new task | 30min/user |
| `cancel_task` | Cancel existing task | - |
| `send_sms` | SMS alert (Twilio) | - |
| `view_schedule` | View staff schedule (supports date ranges) | - |
| `trade_shifts` | Manage shift trades | - |
| `create_schedule` | Build schedules | - |
| `get_available_staff` | Query availability | - |
| `grant_temporary_permission` | Temp access | Approval |
| `change_user_type` | Modify user role | Approval |
| `continue_work` | Signal multi-step task continuation | - |
| `review_past_chats` | Search conversation history | - |
| `get_chat_details` | Retrieve full past conversation | - |

### View Schedule Date Range Support

The `view_schedule` tool supports viewing multiple days:
- Single day: `view_schedule({ date: "2025-12-11" })`
- Date range: `view_schedule({ date: "2025-12-11", endDate: "2025-12-14" })`
- Maximum range: 14 days
- Context provides exact dates for "rest of the week" queries

### Office Manager Chat Memory

The Office Manager maintains context within chat sessions and can recall past conversations:

- **Within-session**: Last 10 messages included in each LLM request
- **Summarization**: Auto-generates summaries at 10+ messages
- **Long-term memory**: Searchable by topic, action type, or keywords
- **Multi-step tasks**: Can chain actions across iterations with `continue_work`

```
Chat Session → Messages stored → Summary generated → Topics extracted
                                        ↓
              Future chats can search via review_past_chats
```

### Ada Multi-Model Consultation

```
Tier 1: Quick (Simple questions)
  └─ Fast model, 2048 tokens

Tier 2: Standard (Normal discussion)
  └─ Balanced model, 4096 tokens

Tier 3: Deliberate (Major decisions)
  ├─ Primary: Claude Opus → Recommendation
  ├─ Review: GPT-4o → Critique
  └─ Synthesis: Claude Sonnet → Final answer
```

### LLM Providers

| Provider | Models | Cost (per 1M tokens) |
|----------|--------|----------------------|
| Anthropic | Claude Opus 4 | $15/$75 |
| Anthropic | Claude Sonnet 4 | $3/$15 |
| Anthropic | Claude Haiku 3.5 | $0.80/$4 |
| OpenAI | GPT-4o | $2.5/$10 |
| OpenAI | o3-mini | $1.1/$4.4 |
| Segmind | Various | $0.14-$3 |

### Context Providers

```typescript
interface AIContextProvider<T> {
  moduleId: string;
  moduleName: string;
  description: string;
  priority: number;      // 1-100, lower = higher
  agents: AIAgent[];

  isEnabled(): Promise<boolean>;
  getContext(): Promise<T>;
  estimateTokens(context: T): number;
  formatForPrompt(context: T): string;
}
```

Available contexts:
- `attendance` - Clock in/out data
- `tasks` - Task assignments
- `users` - User directory
- `locations` - Location data
- `memory` - AI observations
- `user-permissions` - Current user's access rights

### AI Control Panel

Administrators can configure AI behavior through the Tool Control tab at `/admin/ai`:

#### Features
- **Per-Agent Configuration**: Each agent (Office Manager, Revenue Optimizer, Architect) configured independently
- **Tool Enable/Disable**: Toggle individual tools on/off without code changes
- **Force Keywords**: Define keywords that force a specific tool to execute
- **Context Trigger Keywords**: Keywords that inject specific context providers

#### Database Tables
| Table | Purpose |
|-------|---------|
| `ai_tool_config` | Per-tool enable/disable and settings |
| `ai_tool_keywords` | Force keywords that trigger specific tools |
| `ai_context_config` | Per-context provider configuration |
| `ai_context_keywords` | Keywords that trigger context injection |

#### Cache Behavior
- **30-second TTL**: Configuration changes take effect within 30 seconds
- **Hot Reload**: No server restart required
- **Fallback**: Code defaults used when no database config exists
- **Immediate Invalidation**: Admin changes clear cache instantly

### Key AI Files

| File | Purpose |
|------|---------|
| `src/lib/ai/types.ts` | Core type definitions |
| `src/lib/ai/providers/*.ts` | LLM integrations |
| `src/lib/ai/architect/multi-model.ts` | Multi-model system |
| `src/lib/ai/tools/office-manager/*.ts` | OM tools |
| `src/lib/ai/prompts/*.ts` | System prompts |
| `src/lib/ai/services/config-service.ts` | AI configuration service with caching |
| `src/lib/ai/context/index.ts` | Context assembly and filtering |

---

## 9. Configuration & Deployment

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db
AUTH_SECRET=[min 32 characters]

# Optional - Push Notifications
VAPID_PUBLIC_KEY=[generated]
VAPID_PRIVATE_KEY=[generated]
VAPID_SUBJECT=mailto:admin@example.com

# Optional - Email/SMS
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=[username]
SMTP_PASSWORD=[password]
TWILIO_ACCOUNT_SID=[sid]
TWILIO_AUTH_TOKEN=[token]
TWILIO_PHONE_NUMBER=+15551234567

# Optional - Maps
GOOGLE_MAPS_API_KEY=[key]

# Optional - AI
CRON_SECRET=[for scheduled AI runs]
```

### Docker Setup

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    container_name: teamtime-db
    environment:
      POSTGRES_USER: teamtime
      POSTGRES_PASSWORD: teamtime_dev_password
      POSTGRES_DB: teamtime
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

### PM2 Configuration

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'teamtime',
    script: './build/index.js',
    instances: 1,
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '500M',
    wait_ready: true
  }]
};
```

### Build & Deploy

```bash
# Development
npm run dev              # Start dev server (port 5173)

# Production
npm run build            # Build to /build
pm2 start ecosystem.config.cjs  # Start with PM2

# Database
npm run db:migrate       # Apply migrations
npm run db:studio        # Open Drizzle Studio
```

---

## 10. Known Issues & Technical Debt

### Recently Fixed (Alpha Release)

| Issue | Status | Notes |
|-------|--------|-------|
| Insecure Random (PIN/2FA) | FIXED | Now uses `crypto.randomInt()` |
| Email Service | FIXED | Nodemailer with SMTP support |
| Hardcoded DB Credentials | FIXED | Fails fast if DATABASE_URL missing |
| parseInt Radix Params | FIXED | All parseInt calls include radix |
| Type Safety (`any` types) | FIXED | Proper typing throughout |
| Console Logging | FIXED | Structured logging with pino |

### Remaining Technical Debt

#### Medium Priority

#### 1. Large Complex Files
- `multi-model.ts` - 813 lines (consider splitting)
- `permission-manager.ts` - 681 lines
- `schema.ts` - 1,463 lines (expected for schema)

#### 2. Test Coverage
- Unit tests not yet implemented
- Integration tests needed for AI tools

### Low Priority

#### 3. Code Organization
- Some AI tools could be consolidated
- Context providers could use caching

### Issue Summary

| Category | Count | Severity |
|----------|-------|----------|
| Security Issues | 0 | - |
| Test Coverage | Low | Medium |
| Code Complexity | 3 files | Low |

---

## 11. Development Guide

### Getting Started

```bash
# Clone repository
git clone https://github.com/r0bug/teamtime.git
cd teamtime

# Install dependencies
npm install

# Set up database
docker-compose up -d
npm run db:push

# Start development
npm run dev
```

### Code Standards

- **TypeScript**: Strict mode enabled
- **Formatting**: Prettier (implied by SvelteKit)
- **CSS**: TailwindCSS with custom primary palette
- **Components**: Single-file Svelte components

### Database Changes

1. Modify `src/lib/server/db/schema.ts`
2. Run `npm run db:generate` to create migration
3. Review generated SQL in `/drizzle/`
4. Run `npm run db:migrate` to apply

### Adding API Endpoints

1. Create route file: `src/routes/api/[endpoint]/+server.ts`
2. Export HTTP method handlers:
   ```typescript
   export const GET: RequestHandler = async ({ locals }) => {
     if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
     // ...
   };
   ```
3. Add authentication checks as needed

### Adding AI Tools

1. Create tool file: `src/lib/ai/tools/[agent]/[tool].ts`
2. Implement `AITool` interface:
   ```typescript
   export const myTool: AITool<Params, Result> = {
     name: 'my_tool',
     description: '...',
     agent: 'office_manager',
     parameters: { type: 'object', properties: {...}, required: [...] },
     requiresApproval: false,
     validate: (params) => ({ valid: true }),
     execute: async (params, context) => { ... },
     formatResult: (result) => JSON.stringify(result)
   };
   ```
3. Register in `src/lib/ai/tools/[agent]/index.ts`

### Testing API Keys

AI keys stored in `.ai-keys.json` (gitignored):
```json
{
  "anthropic": "sk-ant-...",
  "openai": "sk-...",
  "segmind": "..."
}
```

---

## Quick Reference

### NPM Scripts
```bash
npm run dev          # Dev server
npm run build        # Production build
npm run preview      # Preview build
npm run check        # Type checking
npm run db:studio    # Database GUI
```

### Key URLs
| Environment | URL |
|-------------|-----|
| Development | http://localhost:5173 |
| Production | http://localhost:3000 |
| Drizzle Studio | http://localhost:4983 |

### Port Map
| Service | Port |
|---------|------|
| Vite Dev | 5173 |
| Production | 3000 |
| PostgreSQL | 5432 |
| Drizzle Studio | 4983 |

---

*Documentation generated by comprehensive codebase analysis. Last updated: December 13, 2025*
