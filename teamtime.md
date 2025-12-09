# TeamTime - Mobile Workforce Operations System

## System Overview

TeamTime is a comprehensive mobile workforce management system designed for small to medium businesses. It provides time tracking, task management, expense handling, and intelligent AI-powered assistance through the "Mentats" system.

---

## Technology Stack

```
Frontend:       SvelteKit (TypeScript, SSR + SPA)
Database:       PostgreSQL 15+
ORM:            Drizzle ORM
Auth:           Lucia v3 with PostgreSQL adapter
File Storage:   Local filesystem (/uploads)
Realtime:       Server-Sent Events (SSE)
Styling:        Tailwind CSS (mobile-first)
Maps:           Google Maps JavaScript API
PWA:            Workbox + web-push
AI Integration: Anthropic Claude, OpenAI GPT-4
Dev Environment: Docker Compose (PostgreSQL container)
```

---

## Core Features

### 1. User Management & Authentication
- **Email + PIN authentication** with Argon2 hashing
- **Two-factor authentication** via email verification codes
- **Role-based access control**: Admin, Manager, Purchaser, Staff
- **Session management** with device fingerprinting
- **Avatar uploads** for user profiles

### 2. Time & Attendance
- **Clock in/out** with GPS location capture
- **Reverse geocoding** for address display
- **Time entry corrections** by managers with audit trail
- **Pay period reporting** with CSV export
- **Store hours management** per location

### 3. Scheduling
- **Shift creation and assignment**
- **Employee schedule view** (day/week)
- **Manager calendar interface**
- **Shift templates** for recurring schedules

### 4. Task Management
- **Task creation** with priority levels (low/medium/high/urgent)
- **Task templates** for repeatable workflows
- **Recurring tasks** with configurable schedules
- **Event-triggered tasks** (on clock-in/clock-out)
- **Photo-required completions**
- **Task status tracking**: not_started, in_progress, completed, cancelled

### 5. Purchase Approval System
- **Purchase request creation** with photos
- **Manager approval/denial workflow**
- **Push notifications** for requests and decisions
- **GPS location capture** for accountability

### 6. Expense Tracking
- **ATM withdrawal logging**
- **Expense allocation** to purchase requests
- **Receipt photo capture**
- **Expense reporting** with CSV export

### 7. Messaging System
- **Direct messaging** between users
- **Broadcast messages** from managers
- **Photo attachments**
- **Real-time delivery** via SSE
- **Unread count tracking**

### 8. Notifications
- **In-app notification center**
- **Push notifications** (PWA)
- **Configurable notification preferences**
- **Types**: task_assigned, task_due, task_overdue, schedule_change, shift_request, new_message, purchase_decision, shift_reminder

### 9. Info Posts / Knowledge Base
- **Staff announcements**
- **How-to guides and policies**
- **Pinned important content**
- **Category organization**

---

## AI Mentats System

TeamTime includes an intelligent AI assistant system called "Mentats" - autonomous AI agents that help manage operations.

### Office Manager Mentat
- **Schedule**: Runs every 15 minutes during business hours (7am-7pm)
- **Capabilities**:
  - Monitor attendance and flag late arrivals
  - Track overdue tasks and send reminders
  - Support new employee onboarding
  - Send helpful tips and check-ins
- **Tools**: send_message, create_task
- **Configurable tone**: helpful_parent, professional, casual, formal

### Revenue Optimizer Mentat (Backroom Boy)
- **Schedule**: Runs nightly at 11pm
- **Capabilities**:
  - Analyze attendance and task completion patterns
  - Write long-term memories about users and locations
  - Create behavioral policies for Office Manager
  - Send strategic recommendations to admins
- **Tools**: write_memory, create_policy, send_recommendation
- **Memory types**: pattern, preference, observation, performance

### Ada - Architecture Advisor
- **Interactive mode**: On-demand chat interface
- **Capabilities**:
  - Analyze codebase and suggest architectural improvements
  - Generate Claude Code prompts for implementation
  - Create Architecture Decision Records (ADRs)
  - Multi-model deliberation for complex decisions
- **Tools**: create_claude_code_prompt, create_architecture_decision, analyze_change_impact
- **Multi-tier consultation**:
  - Quick: Simple questions (fast model)
  - Standard: Normal conversation (capable model)
  - Deliberate: Complex decisions (multi-model with synthesis)

### AI System Features
- **Dry run mode** for testing without execution
- **Cooldown system** to prevent spam
- **Cost tracking** per action
- **Complete audit trail** of all AI decisions
- **Admin-configurable** models and providers

---

## Database Schema

### Core Tables

```typescript
// Users - system users with role-based access
users: {
  id: uuid (PK),
  email: text (unique),
  username: text (unique),
  pinHash: text,
  passwordHash: text (optional),
  role: enum (admin/manager/purchaser/staff),
  name: text,
  phone: text,
  avatarUrl: text,
  hourlyRate: decimal,
  twoFactorEnabled: boolean (default: true),
  isActive: boolean (default: true),
  createdAt: timestamp,
  updatedAt: timestamp
}

// Sessions - Lucia auth sessions
sessions: {
  id: text (PK),
  userId: uuid (FK → users),
  deviceFingerprint: text,
  ipAddress: text,
  userAgent: text,
  lastActive: timestamp,
  last2faAt: timestamp,
  expiresAt: timestamp,
  createdAt: timestamp
}

// Two-factor authentication codes
twoFactorCodes: {
  id: uuid (PK),
  userId: uuid (FK → users),
  code: text,
  expiresAt: timestamp,
  used: boolean (default: false),
  createdAt: timestamp
}

// Locations - work locations
locations: {
  id: uuid (PK),
  name: text,
  address: text,
  lat: decimal,
  lng: decimal,
  isActive: boolean (default: true),
  createdAt: timestamp,
  updatedAt: timestamp
}

// Store hours - operating hours per location
storeHours: {
  id: uuid (PK),
  locationId: uuid (FK → locations),
  dayOfWeek: integer (0-6),
  openTime: text (HH:MM),
  closeTime: text (HH:MM),
  isClosed: boolean,
  createdAt: timestamp,
  updatedAt: timestamp
}

// Shifts - scheduled work shifts
shifts: {
  id: uuid (PK),
  userId: uuid (FK → users),
  locationId: uuid (FK → locations),
  startTime: timestamp,
  endTime: timestamp,
  notes: text,
  createdBy: uuid (FK → users),
  createdAt: timestamp,
  updatedAt: timestamp
}

// Time entries - clock in/out records
timeEntries: {
  id: uuid (PK),
  userId: uuid (FK → users),
  shiftId: uuid (FK → shifts, nullable),
  clockIn: timestamp,
  clockInLat: decimal,
  clockInLng: decimal,
  clockInAddress: text,
  clockOut: timestamp,
  clockOutLat: decimal,
  clockOutLng: decimal,
  clockOutAddress: text,
  notes: text,
  createdAt: timestamp,
  updatedAt: timestamp,
  updatedBy: uuid (FK → users)
}
```

### Task System Tables

```typescript
// Task templates - reusable task definitions
taskTemplates: {
  id: uuid (PK),
  name: text,
  description: text,
  steps: jsonb (array of {step, title, description}),
  photoRequired: boolean,
  notesRequired: boolean,
  recurrenceRule: jsonb ({frequency, interval, daysOfWeek, timeOfDay}),
  triggerEvent: enum (clock_in/clock_out/first_clock_in/last_clock_out),
  triggerConditions: jsonb ({locationId, timeWindowStart, timeWindowEnd}),
  locationId: uuid (FK → locations),
  isActive: boolean,
  createdBy: uuid (FK → users),
  createdAt: timestamp,
  updatedAt: timestamp
}

// Tasks - individual task instances
tasks: {
  id: uuid (PK),
  templateId: uuid (FK → taskTemplates),
  title: text,
  description: text,
  assignedTo: uuid (FK → users),
  priority: enum (low/medium/high/urgent),
  dueAt: timestamp,
  status: enum (not_started/in_progress/completed/cancelled),
  photoRequired: boolean,
  notesRequired: boolean,
  source: enum (manual/recurring/event_triggered/purchase_approval),
  linkedEventId: uuid,
  createdBy: uuid (FK → users),
  createdAt: timestamp,
  updatedAt: timestamp
}

// Task completions - completion records
taskCompletions: {
  id: uuid (PK),
  taskId: uuid (FK → tasks),
  completedBy: uuid (FK → users),
  completedAt: timestamp,
  notes: text,
  lat: decimal,
  lng: decimal,
  address: text,
  createdAt: timestamp
}

// Task photos - photos attached to tasks
taskPhotos: {
  id: uuid (PK),
  taskId: uuid (FK → tasks),
  taskCompletionId: uuid (FK → taskCompletions),
  filePath: text,
  originalName: text,
  mimeType: text,
  sizeBytes: integer,
  lat: decimal,
  lng: decimal,
  capturedAt: timestamp,
  createdAt: timestamp
}
```

### Financial Tables

```typescript
// Purchase requests - approval workflow
purchaseRequests: {
  id: uuid (PK),
  taskId: uuid (FK → tasks),
  requesterId: uuid (FK → users),
  description: text,
  proposedPrice: decimal,
  sellerInfo: text,
  lat: decimal,
  lng: decimal,
  address: text,
  status: enum (pending/approved/denied),
  decidedBy: uuid (FK → users),
  decidedAt: timestamp,
  decisionNotes: text,
  createdAt: timestamp
}

// ATM withdrawals - cash tracking
atmWithdrawals: {
  id: uuid (PK),
  userId: uuid (FK → users),
  amount: decimal,
  withdrawnAt: timestamp,
  lat: decimal,
  lng: decimal,
  address: text,
  receiptPhotoPath: text,
  status: enum (unassigned/partially_assigned/fully_spent),
  notes: text,
  createdAt: timestamp,
  updatedAt: timestamp
}

// Withdrawal allocations - expense assignment
withdrawalAllocations: {
  id: uuid (PK),
  withdrawalId: uuid (FK → atmWithdrawals),
  amount: decimal,
  productDescription: text,
  purchaseRequestId: uuid (FK → purchaseRequests),
  createdAt: timestamp
}

// Allocation photos - receipt photos
allocationPhotos: {
  id: uuid (PK),
  allocationId: uuid (FK → withdrawalAllocations),
  filePath: text,
  originalName: text,
  lat: decimal,
  lng: decimal,
  capturedAt: timestamp,
  createdAt: timestamp
}
```

### Messaging Tables

```typescript
// Conversations - message threads
conversations: {
  id: uuid (PK),
  type: enum (direct/broadcast),
  title: text,
  createdBy: uuid (FK → users),
  createdAt: timestamp,
  updatedAt: timestamp
}

// Conversation participants
conversationParticipants: {
  id: uuid (PK),
  conversationId: uuid (FK → conversations),
  userId: uuid (FK → users),
  joinedAt: timestamp,
  lastReadAt: timestamp,
  isArchived: boolean
}

// Messages
messages: {
  id: uuid (PK),
  conversationId: uuid (FK → conversations),
  senderId: uuid (FK → users),
  content: text,
  isSystemMessage: boolean,
  createdAt: timestamp
}

// Message photos
messagePhotos: {
  id: uuid (PK),
  messageId: uuid (FK → messages),
  filePath: text,
  originalName: text,
  createdAt: timestamp
}
```

### Notification Tables

```typescript
// Notifications
notifications: {
  id: uuid (PK),
  userId: uuid (FK → users),
  type: enum (task_assigned/task_due/task_overdue/schedule_change/
              shift_request/new_message/purchase_decision/shift_reminder),
  title: text,
  body: text,
  data: jsonb,
  isRead: boolean,
  readAt: timestamp,
  createdAt: timestamp
}

// Push subscriptions - web push
pushSubscriptions: {
  id: uuid (PK),
  userId: uuid (FK → users),
  endpoint: text (unique),
  keys: jsonb ({p256dh, auth}),
  deviceInfo: text,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### System Tables

```typescript
// App settings - key-value configuration
appSettings: {
  id: serial (PK),
  key: text (unique),
  value: text,
  updatedAt: timestamp
}

// Audit logs - complete action history
auditLogs: {
  id: uuid (PK),
  userId: uuid (FK → users),
  action: text,
  entityType: text,
  entityId: text,
  beforeData: jsonb,
  afterData: jsonb,
  ipAddress: text,
  createdAt: timestamp
}

// Info posts - staff announcements
infoPosts: {
  id: uuid (PK),
  title: text,
  content: text,
  category: text (general/contacts/how-to/policy),
  isPinned: boolean,
  isActive: boolean,
  createdBy: uuid (FK → users),
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### AI System Tables

```typescript
// AI configuration - per-agent settings
aiConfig: {
  id: serial (PK),
  agent: enum (office_manager/revenue_optimizer/architect),
  enabled: boolean,
  provider: enum (anthropic/openai),
  model: text,
  tone: enum (helpful_parent/professional/casual/formal),
  instructions: text,
  cronSchedule: text,
  maxTokensContext: integer,
  temperature: decimal,
  dryRunMode: boolean,
  sendToAllAdmins: boolean,
  specificRecipientIds: jsonb (array),
  createdAt: timestamp,
  updatedAt: timestamp
}

// AI actions log - complete audit trail
aiActions: {
  id: uuid (PK),
  agent: enum,
  runId: uuid,
  runStartedAt: timestamp,
  contextSnapshot: jsonb,
  contextTokens: integer,
  reasoning: text,
  toolName: text,
  toolParams: jsonb,
  executed: boolean,
  executionResult: jsonb,
  blockedReason: text,
  error: text,
  targetUserId: uuid (FK → users),
  createdTaskId: uuid (FK → tasks),
  createdMessageId: uuid (FK → messages),
  tokensUsed: integer,
  costCents: integer,
  createdAt: timestamp
}

// AI cooldowns - prevent repeated actions
aiCooldowns: {
  id: uuid (PK),
  agent: enum,
  userId: uuid (FK → users),
  actionType: text,
  relatedEntityId: uuid,
  relatedEntityType: text,
  expiresAt: timestamp,
  reason: text,
  aiActionId: uuid (FK → aiActions),
  createdAt: timestamp
}

// AI memory - long-term observations
aiMemory: {
  id: uuid (PK),
  scope: enum (user/location/global),
  userId: uuid (FK → users),
  locationId: uuid (FK → locations),
  memoryType: text (pattern/preference/observation/performance),
  content: text,
  confidence: decimal,
  observationCount: integer,
  lastObservedAt: timestamp,
  isActive: boolean,
  expiresAt: timestamp,
  createdByRunId: uuid,
  createdAt: timestamp,
  updatedAt: timestamp
}

// AI policy notes - dynamic behavior rules
aiPolicyNotes: {
  id: uuid (PK),
  scope: enum (global/location/role),
  locationId: uuid (FK → locations),
  targetRole: enum,
  content: text,
  priority: integer (1-100),
  isActive: boolean,
  updatedByRunId: uuid,
  createdByUserId: uuid (FK → users),
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Architecture Advisor Tables

```typescript
// Architecture decisions - ADRs
architectureDecisions: {
  id: uuid (PK),
  title: text,
  status: enum (proposed/approved/in_progress/implemented/rejected/superseded),
  category: enum (schema/api/ui/integration/security/architecture),
  context: text,
  decision: text,
  consequences: text,
  claudeCodePrompt: text,
  implementationPlan: jsonb ({phases: [{name, tasks, dependencies}]}),
  relatedFiles: jsonb (array),
  implementedAt: timestamp,
  createdByAiRunId: uuid,
  createdByChatId: uuid,
  createdByUserId: uuid (FK → users),
  createdAt: timestamp,
  updatedAt: timestamp
}

// Architecture chats - conversation sessions
architectureChats: {
  id: uuid (PK),
  title: text,
  messages: jsonb (array of {role, content, timestamp, toolCalls}),
  contextModules: jsonb (array),
  tokensUsed: integer,
  costCents: integer,
  decisionsCreated: jsonb (array),
  promptsGenerated: integer,
  createdByUserId: uuid (FK → users),
  createdAt: timestamp,
  updatedAt: timestamp
}

// Architect configuration - multi-model settings
architectConfig: {
  id: serial (PK),
  // Quick tier (simple questions)
  quickProvider: enum,
  quickModel: text,
  // Standard tier (normal conversation)
  standardProvider: enum,
  standardModel: text,
  // Deliberate tier (complex decisions)
  deliberatePrimaryProvider: enum,
  deliberatePrimaryModel: text,
  deliberateReviewProvider: enum,
  deliberateReviewModel: text,
  deliberateSynthProvider: enum,
  deliberateSynthModel: text,
  // Triggers
  triggerOnADRCreation: boolean,
  triggerOnPromptGeneration: boolean,
  triggerOnSchemaDesign: boolean,
  triggerOnExplicitRequest: boolean,
  // Presentation
  presentationMode: enum (synthesized/side_by_side/primary_with_notes),
  createdAt: timestamp,
  updatedAt: timestamp
}
```

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Email + PIN login
- `POST /api/auth/logout` - End session
- `POST /api/auth/verify-2fa` - Verify 2FA code

### Users
- `GET /api/users` - List users (manager+)
- `POST /api/users` - Create user (admin)
- `GET /api/users/[id]` - Get user details
- `PUT /api/users/[id]` - Update user
- `DELETE /api/users/[id]` - Deactivate user (admin)

### Locations
- `GET /api/locations` - List locations
- `POST /api/locations` - Create location (manager+)
- `GET /api/locations/[id]` - Get location details
- `PUT /api/locations/[id]` - Update location
- `DELETE /api/locations/[id]` - Deactivate location

### Shifts
- `GET /api/shifts` - List shifts (filtered by user/date)
- `POST /api/shifts` - Create shift (manager+)
- `GET /api/shifts/[id]` - Get shift details
- `PUT /api/shifts/[id]` - Update shift
- `DELETE /api/shifts/[id]` - Delete shift

### Time Tracking
- `POST /api/clock/in` - Clock in with GPS
- `POST /api/clock/out` - Clock out with GPS

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `GET /api/tasks/[id]` - Get task details
- `PUT /api/tasks/[id]` - Update task
- `DELETE /api/tasks/[id]` - Delete task
- `POST /api/tasks/[id]/complete` - Complete task with photo/notes

### Purchase Requests
- `GET /api/purchase-requests` - List requests
- `POST /api/purchase-requests` - Create request
- `POST /api/purchase-requests/[id]/decide` - Approve/deny (manager+)

### ATM Withdrawals
- `GET /api/atm-withdrawals` - List withdrawals
- `POST /api/atm-withdrawals` - Log withdrawal
- `POST /api/atm-withdrawals/[id]/allocate` - Allocate funds

### Conversations
- `GET /api/conversations` - List conversations
- `POST /api/conversations` - Start conversation
- `GET /api/conversations/[id]/messages` - Get messages
- `POST /api/conversations/[id]/messages` - Send message

### Notifications
- `GET /api/notifications` - List notifications
- `PUT /api/notifications/[id]/read` - Mark as read

### Reports
- `GET /api/reports/time` - Time report (CSV)
- `GET /api/reports/expenses` - Expense report (CSV)

### File Uploads
- `POST /api/uploads` - Upload file
- `POST /api/avatar` - Upload avatar

### Backup
- `POST /api/backup` - Create system backup (admin)

### AI System
- `POST /api/ai/cron` - Trigger AI agent run

### Architecture Advisor
- `GET /api/architect/chats` - List chat sessions
- `POST /api/architect/chats` - Create new session
- `GET /api/architect/chats/[id]` - Get chat session
- `DELETE /api/architect/chats/[id]` - Delete session
- `POST /api/architect/chats/[id]/messages` - Send message to Ada
- `GET /api/architect/decisions` - List ADRs
- `POST /api/architect/decisions` - Create ADR
- `GET /api/architect/decisions/[id]` - Get ADR details
- `PUT /api/architect/decisions/[id]` - Update ADR

---

## UI Routes

### Public Routes
- `/` - Landing/redirect
- `/login` - Email + PIN login
- `/verify` - 2FA verification
- `/forgot-pin` - PIN reset

### Employee Routes
- `/dashboard` - Home screen with clock status, next shift, tasks
- `/schedule` - Personal schedule view
- `/tasks` - Task list
- `/tasks/[id]` - Task details/completion
- `/tasks/new` - Create task (if permitted)
- `/messages` - Conversation list
- `/messages/[id]` - Chat view
- `/messages/new` - Start conversation
- `/expenses` - Expense overview
- `/expenses/withdrawals/new` - Log withdrawal
- `/expenses/withdrawals/[id]` - Withdrawal details
- `/purchase-requests` - Request list
- `/notifications` - Notification center
- `/settings` - User settings
- `/settings/notifications` - Notification preferences

### Manager Routes
- `/schedule/manage` - Staff scheduling calendar

### Admin Routes
- `/admin` - Admin dashboard
- `/admin/users` - User management
- `/admin/users/new` - Create user
- `/admin/users/[id]` - Edit user
- `/admin/locations` - Location management
- `/admin/locations/new` - Create location
- `/admin/locations/[id]` - Edit location
- `/admin/schedule` - Master schedule view
- `/admin/reports` - Reporting dashboard
- `/admin/pay-periods` - Pay period management
- `/admin/export-hours` - Export time data
- `/admin/messages` - Message moderation
- `/admin/communications` - Broadcast messages
- `/admin/info` - Info posts management
- `/admin/settings` - System settings
- `/admin/audit-logs` - Audit log viewer
- `/admin/modules` - Feature toggles
- `/admin/ai` - AI Mentats configuration
- `/admin/ai/prompts` - View AI system prompts
- `/admin/architect` - Ada chat interface
- `/admin/architect/decisions` - ADR list
- `/admin/architect/decisions/[id]` - ADR details

---

## Security Features

- **PIN hashing** with Argon2
- **Session cookies** (httpOnly, secure)
- **CSRF protection** via SvelteKit
- **SQL injection prevention** via Drizzle ORM parameterized queries
- **XSS prevention** via Svelte's default output encoding
- **File upload validation** (mime type, size limits)
- **Role-based route guards**
- **2FA on new device detection**
- **Audit logging** for sensitive actions

---

## PWA Features

- **Installable** to home screen
- **Offline support** via service worker
- **Push notifications** for important events
- **Background sync** for queued actions
- **Mobile-optimized** UI with bottom navigation

---

## File Structure

```
src/
├── lib/
│   ├── ai/                    # AI Mentats system
│   │   ├── architect/         # Ada Architecture Advisor
│   │   │   ├── chat/          # Chat session management
│   │   │   ├── context/       # Context assembly
│   │   │   ├── tools/         # Ada's tools
│   │   │   ├── config.ts      # Configuration
│   │   │   ├── multi-model.ts # Multi-model consultation
│   │   │   ├── triggers.ts    # Tier detection
│   │   │   └── types.ts       # Type definitions
│   │   ├── config/            # AI configuration
│   │   ├── context/           # Context modules
│   │   ├── orchestrators/     # Agent orchestrators
│   │   ├── prompts/           # System prompts
│   │   ├── providers/         # LLM providers
│   │   └── tools/             # AI tools
│   ├── components/            # Svelte components
│   ├── server/
│   │   ├── auth/              # Lucia auth setup
│   │   └── db/                # Drizzle schema & connection
│   └── utils/                 # Shared utilities
├── routes/
│   ├── (app)/                 # Authenticated routes
│   │   ├── admin/             # Admin pages
│   │   ├── dashboard/         # Home
│   │   ├── expenses/          # Expense tracking
│   │   ├── messages/          # Messaging
│   │   ├── notifications/     # Notifications
│   │   ├── purchase-requests/ # Purchase approval
│   │   ├── schedule/          # Scheduling
│   │   ├── settings/          # User settings
│   │   └── tasks/             # Task management
│   ├── api/                   # API endpoints
│   ├── login/                 # Login page
│   ├── verify/                # 2FA page
│   └── forgot-pin/            # PIN reset
├── app.html                   # HTML template
├── hooks.server.ts            # Server hooks
└── service-worker.ts          # PWA service worker
```

---

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/teamtime
GOOGLE_MAPS_API_KEY=your_key
VAPID_PUBLIC_KEY=your_key
VAPID_PRIVATE_KEY=your_key
# AI keys stored in local file, not env
```

---

## Deployment

1. Build: `npm run build`
2. Database: Run Drizzle migrations
3. Start: `node build` or use PM2
4. Reverse proxy: nginx with SSL

---

## Version History

- **v1.0** - Core workforce management features
- **v1.1** - AI Mentats system (Office Manager, Revenue Optimizer)
- **v1.2** - Ada Architecture Advisor with multi-model consultation
- **v1.3** - System prompts viewer, enhanced markdown rendering
- **v1.4** - Ada tool result display improvements:
  - Full tool result flow (execution → API → frontend display)
  - Rich display for `create_claude_code_prompt` with View Prompt modal
  - Rich display for `create_architecture_decision` with View Decision link
  - Rich display for `analyze_change_impact` with risk levels, affected files, recommendations
  - Generic JSON fallback for unknown tools

---

*Last Updated: December 2024*
