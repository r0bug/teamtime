Mobile Workforce Operations System — Functional Specification
1. Purpose & Overview

This system is a mobile-first web application designed to support real-world workforce operations involving:

Employee scheduling

Timekeeping (clock in / clock out)

Manager–employee and employee–employee communication

Task management (assignments, procedures, approvals)

Expense tracking for field purchasing

ATM withdrawal reconciliation

Location-aware actions (clock-ins, purchases, photos, tasks)

The core goal is to remove friction from scheduling, purchasing, task execution, and cash reconciliation while maintaining accountability, traceability, and ease of use in fast-moving environments like estate and yard sales.

The system is delivered as a browser-based application served from a central webserver, with a mobile-first responsive UI that also works well on desktop PCs. It may be implemented as a Progressive Web App (PWA) to support home-screen install and richer notifications.

2. Platform, Deployment & Access
2.1 Deployment Model

Server-Hosted Web Application

Hosted on a central web server (cloud or on-prem)

All clients connect via HTTPS

Backend

Exposes an API (REST or GraphQL) for:

Authentication

Scheduling

Tasks

Messaging

Expenses & withdrawals

Location/event logging

Frontend

Single Page Application (SPA) or similar web client

Delivered from the same webserver (or CDN) and loaded in the browser

2.2 Client Platforms

Mobile Client

Mobile-first UI design for phones (iOS/Android) via modern browsers

Touch-optimized interactions

PWA option:

Add to home screen

Push notifications (where supported)

Offline caching of critical views

Desktop / PC Client

Same web app runs in desktop browsers (Chrome, Edge, Firefox, Safari)

Responsive layout adapts:

Larger screens optimized for managers (e.g., full schedule views, dashboards, task boards)

No additional installation required beyond browser

2.3 Hardware/OS Access

Camera access (via browser permissions) for:

Photos of items, receipts, task verification

GPS / Location services (via browser permissions) for:

Clock-ins/outs

ATM withdrawals

Photo and task events

Notifications:

Browser-based and PWA push notifications

Lock-screen notifications where OS/PWA stack supports them

2.4 Mobile Navigation

The mobile experience provides full feature parity with desktop:

Hamburger Menu (Top Header)

Tap the menu icon (☰) in the top-left corner to open the slide-out navigation panel

Full access to all navigation items including admin features for managers/admins

User profile section at top showing name and role

Bottom Navigation Bar

Fixed bottom bar with 5 quick-access items: Home, Schedule, Tasks, Messages, Expenses

Role-filtered (Expenses only shown to purchasers and above)

Active state indication for current route

Slide-out Navigation Panel

Organized sections: Main, Admin (for managers/admins), Settings

Full navigation hierarchy matching desktop sidebar

Logout option at bottom

Closes automatically when navigating or tapping backdrop

2.5 PWA Install Prompt

On mobile devices, users are prompted to install the app via a custom banner component (`InstallPrompt.svelte`):

Android/Chrome

- Intercepts the browser's `beforeinstallprompt` event
- Custom banner displays "Install TeamTime" with app icon
- "Install App" button triggers native install dialog
- User can accept or dismiss the native prompt
- After acceptance, custom banner automatically hides

iOS Safari

- Detects iOS via `navigator.userAgent` pattern matching
- Displays manual instructions: "Tap [share icon] then 'Add to Home Screen'"
- Visual share icon included inline for clarity
- No native install API available on iOS

Prompt Behavior

- **Mobile-only**: Hidden on desktop via `lg:hidden` CSS class and user agent detection
- **Standalone detection**: Uses `window.matchMedia('(display-mode: standalone)')` and `navigator.standalone` (iOS) to detect if already installed
- **Dismissible**: X button stores dismissal in localStorage (`pwa-install-dismissed` key set to `'true'`)
- **Persistent preference**: Once dismissed, prompt never shows again on that browser/device
- **Positioning**: Fixed position `bottom-20` (5rem from bottom) to appear above the bottom navigation bar
- **Z-index**: Uses `z-50` to layer above page content but below modal dialogs

Implementation Details

- Component: `src/lib/components/InstallPrompt.svelte`
- localStorage key: `pwa-install-dismissed`
- The component is self-contained and manages its own visibility state
- Imported and rendered in the root app layout (`src/routes/(app)/+layout.svelte`)

2.6 Offline Tolerance

Temporary offline operation with queued sync for:

Messages

Clock-in/out events

Task updates

ATM withdrawal logging

3. Authentication, Sessions & Security
3.1 Login & Session Behavior

Primary Login Mechanism:

User identity (e.g., email or username) + PIN-based authentication

Session Behavior:

Persistent login by default for both mobile and desktop

When session renewal is required:

User re-enters PIN

System may occasionally require 2FA (below)

3.2 Two-Factor Authentication (2FA)

Secondary Verification:

Email-based 2FA

Triggered occasionally:

New device

Suspicious activity

Long intervals since last strong verification

3.3 Security Requirements

All communication over HTTPS

Audit trail of:

Logins/logouts

Clock-ins / clock-outs

Task creation, assignment, completion, approvals

ATM withdrawals & allocations

Location-capturing events

Broadcast shift messages

Role-based access controls tied to Admin / Manager / Purchaser / Staff roles

4. User Roles & Permissions

The system has four user roles in a hierarchical structure:
- **Admin** — Full system access including all communications, audit logs, and module control
- **Manager** — Operational management including scheduling, tasks, and purchase approvals
- **Purchaser** — Field purchasing with expense tracking capabilities
- **Staff** — Basic employee functions (clock in/out, tasks, messaging)

4.1 Admin

System administrators with full platform access:

View all communications across the system (all conversations and messages)

Access complete audit logs for system activity and security monitoring

Enable/disable system modules (Tasks, Schedule, Messages, Expenses, etc.)

All Manager permissions (inherited)

User management and role assignment

System configuration and settings

Security monitoring and access control

4.2 Manager

Create and modify employee schedules

Approve/adjust time and attendance data

Create, assign, and manage tasks

Configure:

Recurring task templates

Event-triggered tasks (e.g., tied to clock-in/clock-out)

Send broadcast shift requests to staff

Communicate with any employee (1:1 or broadcast)

Receive and decide on purchase approval requests

View purchaser expense and ATM activity

Export ATM withdrawal and task data

Use AI scheduling assistant

View location logs for:

Clock-ins/outs

ATM withdrawals

Photos

Relevant tasks

4.3 Purchaser

View schedule & tasks

Clock in and clock out

Record ATM withdrawals

Attach withdrawals to products or product groups

Capture photos of:

Products under consideration

Receipts

Purchased items

Initiate purchase approval request tasks to managers (with photos & pricing)

Use messaging with managers and other employees

Complete assigned tasks, including photo-required tasks

4.4 Staff Employee

View personal schedule and upcoming shifts

Clock in and clock out via web app

Receive and complete tasks (one-off, recurring, event-triggered)

Participate in 1:1 private messaging:

With managers

With other employees

Send/receive photos

Respond to broadcast shift requests

5. Scheduling System
5.1 Manager Scheduling Tools (Desktop & Mobile)

Drag-and-drop schedule interface, usable on:

Desktop browsers (full calendar view)

Mobile (simplified day/week view with drag interactions adapted to touch)

Features:

Create, edit, and move shift blocks

Assign employees to shifts visually

Filter by:

Employee

Location

Role

5.2 Employee Schedule View

Each employee sees:

Their own schedule

Next upcoming shift prominently on the home screen

Home Screen UX (Employee):

Next shift summary (date, time, location)

Clock-in / clock-out controls

Quick access to:

Task list

Messages

Notifications

5.3 Calendar Integration

Google Calendar Integration (per user, optional):

One-way: system → Google Calendar initially

Shifts appear as events in employee calendars

Authorized per-user through OAuth or similar

5.4 AI Scheduling Assistant

Manager-facing tool (especially handy on desktop but accessible on mobile):

Queries like:

“Who is available Thursday 2–6 pm?”

“Show me who is at 40+ hours this week.”

“Suggest coverage for this open shift.”

Suggestions only—final changes require manager confirmation.

6. Time & Attendance (Clock In / Clock Out)

Employees clock in/out via the web app (mobile or desktop):

Each event records:

Employee ID

Timestamp (server authoritative)

GPS location (when permission granted)

Optional notes

Managers can:

View & audit time entries

Correct entries with changes logged

Export time data for payroll

Event-triggered tasks can be attached to these actions (see Task Management).

7. Communication & Messaging
7.1 Manager ↔ Employee Messaging

1:1 private messaging

Text + photo attachments

Works on both mobile and desktop browsers

7.2 Employee ↔ Employee Private Messaging

1:1 messaging for staff coordination

Text + photos

Common use case: “Where is X item?” with photos being sent back and forth

7.3 Logging & Retention

All messages:

Logged

Time-stamped

Retained for audit

UI may allow “archive” or “hide” but not true deletion from system storage by normal users

8. Notifications (Including Lock Screen)
8.1 Notification Types

New task assigned

Task due/overdue

Schedule changes

Broadcast shift requests

New messages

Purchase approval decisions (approved/denied)

Upcoming shift reminders

8.2 Delivery

In-app notifications (mobile and desktop)

Browser notifications / PWA push notifications:

Lock-screen notifications where OS supports

Notification tray entries

Basic per-user preferences (as platform permits) for non-critical categories

9. Task Management System

Central to the system:

One-off tasks

Recurring tasks (e.g., opening/closing)

Event-triggered tasks

Tasks requiring photos

Tasks used as purchase approval requests

9.1 Task Entity

Each task stores:

Task ID

Title

Description / instructions

Assigned employee (or “to be assigned”)

Priority (optional)

Due date/time (optional)

Status:

Not Started

In Progress

Completed

Cancelled

Required evidence:

Photo required (yes/no)

Notes required (yes/no)

Metadata:

Created by

Created time

Last updated time

Source:

Manual

Recurring template

Event-triggered

Purchase approval request

9.2 Task Lists & Views

Employee view:

All tasks assigned to that employee

Filters: by status, due time, type (procedure/approval/etc.)

Manager view:

Task lists by employee, by location, by status

Ability to reassign tasks, adjust due times, close/reopen tasks

9.3 Assigning Tasks

Managers:

Create and assign tasks directly

Create per-employee copies of a multi-target task (e.g., a checklist)

Employees:

Cannot assign tasks to others (except through structured flows like purchase requests)

Can create “request approval to purchase” tasks that go to managers

10. Recurring Tasks (Procedures)

Used for:

Opening procedures

Closing procedures

Daily/weekly/monthly routines

10.1 Task Templates

Manager-defined templates include:

Template name (e.g., “Open Store – Main Location”)

Steps/subtasks (optional)

Target role/team/location

Evidence requirements:

Photo-required steps

Notes-required steps

10.2 Recurrence Rules

Frequency:

Daily / Weekly / Monthly / Custom

Trigger conditions:

Time of day

First clock-in at a location within a time window

Last clock-out at a location

System creates concrete task instances from these templates automatically.

11. Event-Triggered Tasks

Tasks can be triggered by events, especially:

Clock-in

Clock-out

11.1 Examples

First clock-in at Location A between 7–9 am:

Auto-assign "Opening Procedure – Location A" to that employee

Last clock-out at Location B after 8 pm:

Auto-assign "Closing Procedure – Location B" to that employee

11.2 Configuration

Managers can configure:

Which event (first/last clock at location/time window)

Which template to spawn

Whether tasks are:

Assigned to a specific employee

Available for any on-shift staff to claim (future enhancement)

These tasks are linked back to their triggering event for traceability.

11.3 Advanced Task Assignment Rules

The system supports a powerful rules engine for automatic task creation and assignment.

**Trigger Types:**

- **Clock In** — Fires when any user clocks in
- **Clock Out** — Fires when any user clocks out
- **First Clock-In** — Fires for the first person to clock in at a location each day
- **Last Clock-Out** — Fires for the last person to clock out at a location
- **Time Into Shift** — Fires X hours after a user clocks in (e.g., 2 hours into shift)
- **Task Completed** — Fires when a specific task template is completed (chain tasks)
- **Scheduled** — Fires at specific times using cron expressions (e.g., "0 9 * * 1-5" for 9am Mon-Fri)

**Conditions:**

Rules can include optional conditions that must be met:

- Location — Only trigger at a specific location
- User Roles — Only trigger for users with specific roles
- Days of Week — Only trigger on certain days
- Time Window — Only trigger within a time range (e.g., 6am-10am)

**Assignment Methods:**

When a rule fires, it can assign the created task using:

- **Triggering User** — Assign to the user who caused the trigger (e.g., the person clocking in)
- **Specific User** — Always assign to a designated user
- **Role Rotation** — Round-robin assignment among users with specified roles
- **Location Staff** — Assign to any staff currently clocked in at the location
- **Least Tasks** — Assign to the user with the fewest active tasks

**Admin Interface:**

Managers access task automation via Admin > Operations > Task Management:

- `/admin/tasks` — Overview dashboard with stats (templates, rules, tasks generated)
- `/admin/tasks/templates` — Create and manage task templates
- `/admin/tasks/rules` — Create and manage assignment rules

**Cron Processing:**

Scheduled and time-into-shift rules require periodic processing:

- External cron calls `/api/tasks/cron` every 15 minutes
- Processes all scheduled rules matching current time
- Processes time-into-shift rules for active time entries
- Prevents duplicate task creation with 14-minute deduplication window

12. Tasks Requiring Photos

Some tasks require visual confirmation.

12.1 Behavior

Task definition may specify:

“Photo required to complete”

On completion attempt:

App opens camera or file chooser (where allowed)

User must attach at least one photo

Photos store:

Timestamp

GPS location

Task ID

Use cases:

Opening/closing proof

Cleanliness checks

Item condition confirmation

13. Purchase Approval Request Tasks

A specialized, structured flow.

13.1 Creation (Employee/Purchaser)

Employee creates a Purchase Approval Request:

Description of item(s)

Proposed price

Optional additional details (seller, bundle description, urgency)

One or more photos of the item/price tags/etc.

Automatic capture of:

Timestamp

GPS location

This generates a task assigned to a Manager.

13.2 Manager Review

Manager sees:

Item description

Photos

Proposed price

Requester

Time and location of request

Manager actions:

Approve

Deny

Provide optional notes/instructions (e.g., “Try $20 instead”)

13.3 Feedback to Employee

Employee is notified (in-app + push):

Approved/denied status

Manager notes

Task moves to Completed with decision recorded.

13.4 Linkage to Expenses

After approval and purchase:

Employee can link:

The purchase approval task

A specific ATM withdrawal

Resulting product/product-group records

This forms a full chain:
Approval → ATM withdrawal → Product listing.

14. Expense Tracking & ATM Reconciliation
14.1 ATM Withdrawal Records

Each withdrawal has:

Withdrawal ID

Amount

Date & time

Purchaser ID

GPS location (plus optional reverse-geocode)

Status:

Unassigned

Partially Assigned

Fully Spent

14.2 Product/Group Linkage

Attach withdrawals to:

Single product

Product groups

Support partial allocations

Status becomes Fully Spent when fully allocated

14.3 Photos & Documentation

Photos attached to withdrawals and products

Each with:

Timestamp

GPS location

Link to appropriate entities

14.4 Export for Accounting

CSV and JSON exports for:

Withdrawals

Allocations

Task/approval metadata if needed

15. Location & Google Maps Integration

Google Maps API (or equivalent) used for:

Reverse-geocoding (GPS → address/area)

Optional map views in manager UI (especially on desktop)

Location capture for:

Clock-ins/outs

ATM withdrawals

Photos

Tasks requiring evidence

16. Data Ownership, Logging & Export

Core datasets:

Users & roles

Schedules & shifts

Time records

Messages

Tasks & templates

Purchase approvals

ATM withdrawals & allocations

Location-tagged events

Exports:

CSV for each major dataset

JSON for integrations

Logging:

Changes to key records (time, tasks, approvals, schedules) tracked with:

Who

When

Before/after where practical

17. Admin Control Panel

Admin users have access to specialized management interfaces:

17.1 Audit Logs

Complete system activity logging:

All user actions (logins, data changes, approvals)

Before/after data for modifications

IP address and timestamp tracking

User identification for each action

Filterable and searchable log interface

Export capabilities for compliance

17.2 All Communications View

System-wide communication oversight:

View all conversations across the platform

Access all messages (direct and broadcast)

Participant and message count summaries

Last activity timestamps

Search and filter capabilities

17.3 Module Control

Enable/disable system modules:

Tasks — Task management and assignments

Schedule — Shift scheduling and time tracking

Messages — Internal messaging system

Expenses — ATM withdrawals and expense tracking

Purchase Requests — Purchase approval workflow

Notifications — Push notifications and alerts

Locations — Location management

Reports — Analytics and reporting

Disabled modules are hidden from navigation but data is preserved.

18. System Philosophy

Mobile-first, but desktop-capable

Webserver-based system with a single codebase serving:

Mobile field staff

Desktop manager consoles

Low friction for real-world use

High accountability and auditability for back office

19. Optional Phase-Two Enhancements (Not Required for MVP)

Advanced notification controls / quiet hours

OCR for receipts and tags

Task dependencies and checklists with pass/fail logic

Geofencing and “nudge” style alerts

Manager dashboards (desktop-focused):

Live map of who is clocked in where

Task completion heatmaps

Purchase success/ROI analytics

This version explicitly bakes in: central webserver architecture, browser-based client, mobile-first but PC-friendly UI, and keeps all the existing task/scheduling/expense logic intact.

20. Item Pricing & eBay Routing System

A specialized workflow for documenting item pricing decisions and routing items to appropriate sales channels.

20.1 Pricing Decisions

Each pricing decision records:

- Item description (required)
- Price (required, must be positive)
- Price justification (required, min 10 characters) — explains why this price was chosen
- Destination: Store or eBay
- eBay reason (required when destination is eBay) — explains why item should be listed online
- One or more photos of the item (required)
- GPS location (optional) — where the pricing decision was made
- Location reference (optional) — links to a defined location
- Timestamp of when priced

Pricing decisions are immutable for audit purposes — once created, they cannot be edited or deleted.

20.2 eBay Routing Workflow

When an item is marked for eBay:

1. System automatically creates an eBay listing task
2. Task includes item description, price, justification, and photos
3. Task appears in the eBay Tasks queue
4. Users with "Can List on eBay" permission can claim and complete these tasks
5. Task status tracks: Not Started → In Progress → Completed

20.3 User Permissions

Special permission flag on users: "Can List on eBay"

- When enabled, user can view and claim eBay listing tasks
- Managers and Admins always have access to eBay tasks
- Permission is managed in the user admin panel

20.4 Navigation & Access

Staff access:

- `/pricing` — View pricing history (own decisions, or all if manager)
- `/pricing/new` — Create new pricing decision with photos
- `/pricing/[id]` — View pricing decision details

eBay-capable users:

- `/ebay/tasks` — View and claim eBay listing tasks
- Filter options: Show claimed tasks, Show completed tasks

Admin access:

- `/admin/pricing` — Pricing analytics dashboard
- Stats by destination (Store vs eBay)
- Stats by user (items priced, total value)
- Recent pricing decisions
- Date range filtering

20.5 Data Model

pricing_decisions table:

- id, user_id, item_description, price, price_justification
- destination (enum: 'store', 'ebay')
- ebay_reason (nullable, required for eBay)
- ebay_task_id (links to auto-created task)
- location_id, lat, lng, address
- priced_at, created_at

pricing_decision_photos table:

- id, pricing_decision_id, file_path
- original_name, mime_type, size_bytes
- lat, lng, captured_at, created_at

Database constraints ensure:

- Price must be positive
- Price justification minimum 10 characters
- eBay reason required when destination is 'ebay'

20.6 Inventory Drops (Batch Item Submission)

A streamlined workflow for submitting multiple items at once for AI-powered identification.

20.6.1 Drop Creation

Purchasers and managers can create inventory drops:

- Upload multiple photos (up to 10) via drag-and-drop or file picker
- Add a description of the batch (e.g., "Estate sale pickup - kitchen items")
- Optional pick notes for additional context
- Photos are uploaded and associated with the drop

20.6.2 AI Processing

When triggered, the system uses a vision-capable LLM (Claude) to analyze photos:

- Identifies individual sellable items within the photos
- Generates descriptions suitable for pricing
- Suggests initial prices where possible
- Assigns confidence scores (0.0 to 1.0) for each identification
- Links photos to identified items (one item may appear in multiple photos)

20.6.3 Drop Status Flow

Drops progress through statuses:

- **Pending** — Awaiting AI processing
- **Processing** — AI analysis in progress
- **Completed** — Items identified and ready for pricing
- **Failed** — Processing error (with error details for debugging)

Failed drops can be retried by users.

20.6.4 Post-Processing Workflow

After AI identification:

- View all identified items with confidence scores
- Each item displays linked photos from the batch
- Create pricing decisions directly from identified items
- Items flow into the standard pricing/eBay routing workflow (Section 20)

20.6.5 Navigation & Access

Purchaser and manager access:

- `/inventory/drops` — View all drops (own drops, or all if manager)
- `/inventory/drops/new` — Create new inventory drop with photos
- `/inventory/drops/[id]` — View drop details, photos, and identified items
- Dashboard shows drop stats (pending/processing counts, items identified today)

20.6.6 Data Model

inventory_drops table:

- id, user_id, description, pick_notes
- status (enum: 'pending', 'processing', 'completed', 'failed')
- item_count — number of items identified
- processing_error — error message if failed
- processed_at, created_at

inventory_drop_photos table:

- id, drop_id, file_path, order_index
- original_name, mime_type, size_bytes
- created_at

inventory_drop_items table:

- id, drop_id, item_description
- suggested_price — AI-suggested price (nullable)
- confidence_score — AI confidence (0.0-1.0)
- source_photo_ids — array of photo IDs showing this item
- pricing_decision_id — links to created pricing decision (nullable)
- created_at
