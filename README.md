# TeamTime

Mobile-first workforce operations system for scheduling, timekeeping, task management, and expense tracking.

## Features

- **Scheduling** — Drag-and-drop shift management with AI assistant
- **Time & Attendance** — GPS-enabled clock in/out with audit trail
- **Task Management** — One-off, recurring, and event-triggered tasks
- **Messaging** — 1:1 and broadcast communications with photo support
- **Expense Tracking** — ATM withdrawal reconciliation and purchase approvals
- **Push Notifications** — PWA-enabled alerts for tasks, messages, and schedules

## User Roles

| Role | Description |
|------|-------------|
| **Admin** | Full system access: all communications, audit logs, module control |
| **Manager** | Scheduling, task management, purchase approvals, user management |
| **Purchaser** | Field purchasing with expense tracking and approval requests |
| **Staff** | Basic access: clock in/out, tasks, messaging |

## Admin Features

Administrators have exclusive access to:

- `/admin/audit-logs` — Complete system activity and access logs
- `/admin/communications` — View all conversations and messages system-wide
- `/admin/modules` — Enable/disable system modules

## Tech Stack

- **Frontend**: SvelteKit, TailwindCSS
- **Backend**: Node.js, PostgreSQL
- **Auth**: Lucia with PIN + 2FA
- **ORM**: Drizzle

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

# Start production server
node build
```

## Environment Variables

```
DATABASE_URL=postgresql://user:pass@localhost:5432/teamtime
AUTH_SECRET=your-32-char-secret
GOOGLE_MAPS_API_KEY=your-api-key
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
```

## Documentation

See [Spec.md](./Spec.md) for the complete functional specification.
