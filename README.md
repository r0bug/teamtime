# TeamTime

Mobile-first workforce operations system for scheduling, timekeeping, task management, and expense tracking.

## Features

- **Scheduling** — Drag-and-drop shift management with bulk creation and repeat options
- **Time & Attendance** — GPS-enabled clock in/out with audit trail
- **Task Management** — One-off, recurring, and event-triggered tasks
- **Messaging** — 1:1 and broadcast communications with photo support
- **Expense Tracking** — ATM withdrawal reconciliation and purchase approvals
- **Push Notifications** — PWA-enabled alerts for tasks, messages, and schedules
- **Progressive Web App** — Install to home screen with offline support

## User Roles

| Role | Description |
|------|-------------|
| **Admin** | Full system access: all communications, audit logs, module control |
| **Manager** | Scheduling, task management, purchase approvals, user management |
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
- Audit Logs (admin only)
- Modules (admin only)

## Desktop Experience

- **Fixed Sidebar** — Full navigation always visible on screens 1024px+
- **Expanded Views** — Schedule grid, reports, and admin dashboards optimized for larger screens
- Same functionality as mobile with enhanced layout

## Tech Stack

- **Frontend**: SvelteKit, TailwindCSS, TypeScript
- **Backend**: Node.js, PostgreSQL
- **Auth**: Lucia v3 with PIN + optional 2FA
- **ORM**: Drizzle
- **PWA**: Service Worker with Workbox patterns

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
```

## Documentation

See [Spec.md](./Spec.md) for the complete functional specification.

## License

Proprietary - All rights reserved.
