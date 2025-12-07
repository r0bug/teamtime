# Claude Build-Test-Repair Protocol: Mobile Workforce Operations System

## Mission

You will build a complete Mobile Workforce Operations System, then systematically test every component, generate a repair TODO list, fix all issues, and repeat this test-repair cycle **3 full times** until the system is production-ready.

---

## Part 1: Initial Build

### Technology Stack (Mandatory)

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
Dev Environment: Docker Compose (PostgreSQL container)
```

### Build Sequence

Complete each phase fully before moving to the next. Create all files, not pseudocode.

#### Phase 1: Foundation
- [ ] Initialize SvelteKit project with TypeScript
- [ ] Configure Tailwind CSS
- [ ] Set up Docker Compose with PostgreSQL
- [ ] Create Drizzle config and connection
- [ ] Build complete schema for all tables (see Schema Reference below)
- [ ] Run migrations
- [ ] Configure Lucia v3 auth with PostgreSQL adapter
- [ ] Create PIN hashing utilities (argon2)
- [ ] Build login flow (email → PIN)
- [ ] Build 2FA email verification flow
- [ ] Create session management with device fingerprinting
- [ ] Build base layout with mobile bottom nav / desktop sidebar
- [ ] Create role-based route guards

#### Phase 2: User Management
- [ ] User CRUD API endpoints
- [ ] User list view (manager only)
- [ ] User detail/edit view
- [ ] Role assignment
- [ ] PIN reset flow

#### Phase 3: Locations
- [ ] Location CRUD API endpoints
- [ ] Location list and detail views
- [ ] Google Maps integration for geocoding
- [ ] Location picker component

#### Phase 4: Scheduling
- [ ] Shift CRUD API endpoints
- [ ] Employee schedule view (day/week)
- [ ] Manager calendar view (drag-drop)
- [ ] Shift assignment logic
- [ ] Next shift display on home screen
- [ ] Shift templates

#### Phase 5: Time & Attendance
- [ ] Clock in/out API endpoints
- [ ] GPS capture on clock events
- [ ] Reverse geocoding for display
- [ ] Time entry list view
- [ ] Manager time correction with audit log
- [ ] Time export to CSV

#### Phase 6: Task System - Core
- [ ] Task CRUD API endpoints
- [ ] Task template CRUD
- [ ] Employee task list view
- [ ] Manager task board view
- [ ] Task status transitions
- [ ] Task assignment/reassignment

#### Phase 7: Task System - Advanced
- [ ] Recurring task generation (cron job or on-demand)
- [ ] Event-triggered tasks (clock-in/out hooks)
- [ ] Photo-required task completion
- [ ] Task completion API with photo upload
- [ ] Photo storage and retrieval

#### Phase 8: Purchase Approval Flow
- [ ] Purchase request creation API
- [ ] Photo capture for purchase requests
- [ ] Manager approval/deny API
- [ ] Push notification on new request
- [ ] Push notification on decision
- [ ] Purchase request list views (requester & manager)

#### Phase 9: ATM & Expense Tracking
- [ ] ATM withdrawal CRUD API
- [ ] Withdrawal allocation API
- [ ] Link withdrawals to purchase requests
- [ ] Withdrawal status calculations
- [ ] Expense report views
- [ ] CSV export

#### Phase 10: Messaging
- [ ] Conversation creation API
- [ ] Message send API
- [ ] Photo attachments in messages
- [ ] SSE for real-time message delivery
- [ ] Conversation list view
- [ ] Chat view with message history
- [ ] Unread count tracking
- [ ] Manager broadcast messages

#### Phase 11: Notifications
- [ ] In-app notification system
- [ ] Notification preferences
- [ ] PWA service worker setup
- [ ] Web push subscription management
- [ ] Push notification sending
- [ ] Notification center UI

#### Phase 12: PWA & Offline
- [ ] PWA manifest
- [ ] Service worker with Workbox
- [ ] Offline queue for critical actions
- [ ] Sync on reconnection
- [ ] Install prompt

#### Phase 13: Reporting & Audit
- [ ] Audit log table and triggers
- [ ] Time report generation
- [ ] Expense report generation
- [ ] Task completion reports
- [ ] Export endpoints (CSV, JSON)

---

## Schema Reference

Create these tables in Drizzle schema format:

```typescript
// All tables need: id mod (uuid or serial), created_at, updated_at where appropriate

users: id mod, email, username, pin_hash, role (enum: manager/purchaser/staff), 
       name, phone, is_active, created_at, updated_at

sessions: id mod, user_id (FK), device_fingerprint, ip_address, user_agent,
          last_active, last_2fa_at, expires_at, created_at

two_factor_codes: id mod, user_id (FK), code, expires_at, used, created_at

locations: id mod, name, address, lat, lng, is_active, created_at, updated_at

shifts: id mod, user_id (FK), location_id (FK), start_time, end_time, 
        notes, created_by (FK), created_at, updated_at

time_entries: id mod, user_id (FK), shift_id (FK nullable), 
              clock_in, clock_in_lat, clock_in_lng, clock_in_address,
              clock_out, clock_out_lat, clock_out_lng, clock_out_address,
              notes, created_at, updated_at, updated_by (FK)

task_templates: id mod, name, description, steps (jsonb), photo_required, 
                notes_required, recurrence_rule (jsonb), trigger_event (enum),
                trigger_conditions (jsonb), location_id (FK nullable),
                is_active, created_by (FK), created_at, updated_at

tasks: id mod, template_id (FK nullable), title, description, assigned_to (FK),
       priority (enum), due_at, status (enum), photo_required, notes_required,
       source (enum), linked_event_id, created_by (FK), created_at, updated_at

task_completions: id mod, task_id (FK), completed_by (FK), completed_at,
                  notes, lat, lng, address, created_at

task_photos: id mod, task_id (FK nullable), task_completion_id (FK nullable),
             file_path, original_name, mime_type, size_bytes, 
             lat, lng, captured_at, created_at

purchase_requests: id mod, task_id (FK), requester_id (FK), description,
                   proposed_price, seller_info, lat, lng, address,
                   status (enum: pending/approved/denied), decided_by (FK nullable),
                   decided_at, decision_notes, created_at

atm_withdrawals: id mod, user_id (FK), amount, withdrawn_at, lat, lng, address,
                 receipt_photo_path, status (enum), notes, created_at, updated_at

withdrawal_allocations: id mod, withdrawal_id (FK), amount, product_description,
                        purchase_request_id (FK nullable), created_at

allocation_photos: id mod, allocation_id (FK), file_path, original_name,
                   lat, lng, captured_at, created_at

conversations: id mod, type (enum: direct/broadcast), title, created_by (FK),
               created_at, updated_at

conversation_participants: id mod mod, conversation_id (FK), user_id (FK),
                           joined_at, last_read_at, is_archived

messages: id mod, conversation_id (FK), sender_id (FK), content, 
          is_system_message, created_at

message_photos: id mod, message_id (FK), file_path, original_name, created_at

notifications: id mod, user_id (FK), type (enum), title, body, data (jsonb),
               is_read, read_at, created_at

push_subscriptions: id mod, user_id (FK), endpoint, keys (jsonb), 
                    device_info, created_at, updated_at

audit_logs: id mod, user_id (FK), action, entity_type, entity_id,
            before_data (jsonb), after_data (jsonb), ip_address, created_at
```

---

## Part 2: Comprehensive Test Protocol

After completing the build, execute this test protocol systematically. Document EVERY failure.

### Test Categories

#### Category A: Database & Schema Tests
```
A1. Verify all tables exist with correct columns
A2. Verify all foreign key constraints work
A3. Verify all enums have correct values
A4. Verify indexes exist on frequently queried columns
A5. Test cascade deletes where appropriate
A6. Test unique constraints
A7. Verify default values populate correctly
A8. Test jsonb columns accept valid JSON
A9. Verify timestamp columns auto-populate
A10. Test that invalid data is rejected
```

#### Category B: Authentication Tests
```
B1. Login with valid email and PIN succeeds
B2. Login with invalid email fails gracefully
B3. Login with wrong PIN fails (with rate limiting)
B4. Session persists across page reloads
B5. Session expires after configured time
B6. 2FA triggers on new device fingerprint
B7. 2FA code validates correctly
B8. 2FA code expires after 10 minutes
B9. 2FA code is single-use
B10. Logout clears session
B11. Multiple sessions per user work
B12. PIN change invalidates other sessions (optional)
B13. Role is correctly attached to session
B14. Protected routes redirect unauthenticated users
B15. Role-restricted routes enforce permissions
```

#### Category C: API Endpoint Tests
For EACH API endpoint, test:
```
C-[endpoint]-1. Returns correct data on valid request
C-[endpoint]-2. Returns 401 when unauthenticated
C-[endpoint]-3. Returns 403 when unauthorized role
C-[endpoint]-4. Returns 400 on invalid input
C-[endpoint]-5. Returns 404 on non-existent resource
C-[endpoint]-6. Handles empty/null fields correctly
C-[endpoint]-7. Pagination works (where applicable)
C-[endpoint]-8. Filtering works (where applicable)
C-[endpoint]-9. Sorting works (where applicable)
C-[endpoint]-10. Response matches expected schema
```

**Endpoints to test:**
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/verify-2fa
- GET/POST/PUT/DELETE /api/users
- GET/POST/PUT/DELETE /api/locations
- GET/POST/PUT/DELETE /api/shifts
- GET/POST/PUT /api/time-entries
- POST /api/clock/in
- POST /api/clock/out
- GET/POST/PUT/DELETE /api/task-templates
- GET/POST/PUT/DELETE /api/tasks
- POST /api/tasks/[id]/complete
- GET/POST /api/purchase-requests
- POST /api/purchase-requests/[id]/decide
- GET/POST/PUT /api/atm-withdrawals
- POST /api/atm-withdrawals/[id]/allocate
- GET/POST /api/conversations
- GET/POST /api/conversations/[id]/messages
- POST /api/uploads
- GET /api/notifications
- PUT /api/notifications/[id]/read
- POST /api/push-subscriptions
- GET /api/reports/time
- GET /api/reports/expenses

#### Category D: Route/Page Tests
For EACH route, test:
```
D-[route]-1. Page loads without errors
D-[route]-2. Correct layout renders (mobile vs desktop)
D-[route]-3. Required data loads
D-[route]-4. Loading states display
D-[route]-5. Error states display
D-[route]-6. Empty states display
D-[route]-7. Navigation works
D-[route]-8. Role restrictions enforced
D-[route]-9. Forms submit correctly
D-[route]-10. Form validation works
```

**Routes to test:**
- /login
- /verify (2FA)
- / (home/dashboard)
- /schedule
- /schedule/manage (manager)
- /tasks
- /tasks/[id]
- /tasks/new (manager)
- /messages
- /messages/[id]
- /expenses
- /expenses/withdrawals
- /expenses/withdrawals/new
- /expenses/withdrawals/[id]
- /purchase-requests
- /purchase-requests/new
- /purchase-requests/[id]
- /settings
- /settings/notifications
- /admin/users (manager)
- /admin/locations (manager)
- /admin/reports (manager)

#### Category E: Workflow Integration Tests
```
E1. Complete employee shift lifecycle:
    - View schedule → Clock in → Complete tasks → Clock out
    
E2. Complete purchase request lifecycle:
    - Create request with photos → Manager receives notification →
    - Manager approves → Employee notified → Link to withdrawal
    
E3. Complete ATM reconciliation lifecycle:
    - Log withdrawal → Make purchases → Allocate funds →
    - Status updates to fully spent
    
E4. Event-triggered task lifecycle:
    - Configure template → Employee clocks in →
    - Task auto-created → Employee completes with photo
    
E5. Messaging lifecycle:
    - Start conversation → Send messages → Receive in real-time →
    - Send photos → Mark as read
    
E6. Manager broadcast lifecycle:
    - Create broadcast → All employees receive →
    - Notifications sent → Employees respond
    
E7. Time correction lifecycle:
    - Employee clocks in wrong → Manager corrects →
    - Audit log created → Employee sees correction
    
E8. Recurring task lifecycle:
    - Create template with recurrence → Tasks auto-generate →
    - Complete task → Next instance generates
    
E9. Offline/sync lifecycle:
    - Go offline → Perform actions → Queue builds →
    - Come online → Queue syncs → Data consistent
    
E10. Multi-device session lifecycle:
     - Login on device A → Login on device B →
     - Both sessions work → 2FA triggers appropriately
```

#### Category F: UI/UX Tests
```
F1. Mobile bottom navigation functions correctly
F2. Desktop sidebar navigation functions correctly
F3. Responsive breakpoints work (320px, 768px, 1024px, 1440px)
F4. Touch targets are minimum 44px on mobile
F5. Forms are usable on mobile keyboards
F6. Camera capture works on mobile
F7. GPS permission request is user-friendly
F8. Loading spinners appear during async operations
F9. Toast/alert notifications display correctly
F10. Modal dialogs are accessible and closeable
F11. Drag-drop works on desktop schedule
F12. Swipe gestures work on mobile (if implemented)
F13. Dark mode works (if implemented)
F14. Font sizes are readable (minimum 16px body)
F15. Color contrast meets WCAG AA
F16. Focus states are visible for keyboard navigation
F17. Error messages are clear and actionable
F18. Success confirmations appear after actions
F19. Destructive actions require confirmation
F20. Back navigation works correctly
```

#### Category G: Performance Tests
```
G1. Initial page load < 3 seconds
G2. API responses < 500ms
G3. Image uploads handle files up to 10MB
G4. Lists handle 100+ items without lag
G5. Real-time messages arrive < 1 second
G6. Service worker caches static assets
G7. No memory leaks on long sessions
G8. Database queries use indexes (no full scans)
```

#### Category H: Security Tests
```
H1. PIN is properly hashed (argon2)
H2. Sessions use httpOnly cookies
H3. CSRF protection is active
H4. SQL injection is prevented (parameterized queries)
H5. XSS is prevented (output encoding)
H6. File uploads validate mime types
H7. File uploads have size limits
H8. API rate limiting is active
H9. Sensitive data not logged
H10. HTTPS enforced in production config
```

#### Category I: PWA Tests
```
I1. App installs to home screen
I2. App launches in standalone mode
I3. Offline fallback page displays
I4. Push notifications request permission
I5. Push notifications receive and display
I6. Service worker updates correctly
I7. App icon displays correctly
I8. Splash screen displays (where supported)
```

---

## Part 3: Issue Tracking Format

Document all failures in this exact format:

```markdown
## Test Failure Report - Iteration [1/2/3]

### Issue [NUMBER]
- **Test ID:** [e.g., B7, C-users-3, E2]
- **Category:** [Database/Auth/API/Route/Workflow/UX/Performance/Security/PWA]
- **Severity:** [Critical/High/Medium/Low]
- **Description:** [What failed]
- **Expected:** [What should happen]
- **Actual:** [What actually happened]
- **File(s):** [Affected file paths]
- **Reproduction:** [Steps to reproduce]
- **Fix Required:** [Brief description of fix needed]
```

Severity Definitions:
- **Critical:** App crashes, data loss, security vulnerability, complete feature broken
- **High:** Major feature partially broken, significant UX issue
- **Medium:** Minor feature issue, cosmetic problem with workaround
- **Low:** Enhancement, minor polish, edge case

---

## Part 4: Repair Protocol

For each iteration, after documenting all issues:

1. **Sort by severity** (Critical → High → Medium → Low)

2. **Fix in order:**
   - All Critical issues first
   - Then all High issues
   - Then Medium issues
   - Low issues if time permits

3. **For each fix:**
   - State the Issue NUMBER you're fixing
   - Show the code change
   - Explain why this fixes the issue
   - Re-run the specific test that failed

4. **Commit message format:**
   ```
   fix(category): brief description [#ISSUE_NUMBER]
   ```

---

## Part 5: Iteration Protocol

### Iteration 1: Foundation Verification
- Run ALL tests (A through I)
- Document ALL failures
- Fix ALL Critical and High issues
- Fix as many Medium/Low as possible
- Generate summary: "Iteration 1 Complete: X issues found, Y fixed, Z remaining"

### Iteration 2: Regression + Remaining
- Re-run ALL tests (verify fixes didn't break other things)
- Focus on previously unfixed Medium/Low issues
- Look for issues missed in Iteration 1
- Generate summary: "Iteration 2 Complete: X new issues, Y regressions, Z total fixed"

### Iteration 3: Polish + Edge Cases
- Run ALL tests again
- Focus on edge cases
- Test with realistic data volumes
- Test error recovery paths
- Generate summary: "Iteration 3 Complete: System ready for deployment"

### Final Deliverable

After 3 iterations, provide:

```markdown
## Final System Status Report

### Build Summary
- Total files created: [N]
- Total lines of code: [N]
- Database tables: [N]
- API endpoints: [N]
- UI routes: [N]

### Test Results
- Total tests executed: [N]
- Iteration 1: [N] failures found, [N] fixed
- Iteration 2: [N] failures found, [N] fixed  
- Iteration 3: [N] failures found, [N] fixed
- Final pass rate: [N]%

### Known Issues (Unfixed)
[List any remaining issues with justification for deferral]

### Recommended Next Steps
[Any follow-up work needed]

### Deployment Checklist
- [ ] Environment variables documented
- [ ] Database migration scripts ready
- [ ] Docker Compose production config
- [ ] SSL/TLS configuration notes
- [ ] Backup strategy documented
```

---

## Execution Command

Begin now. Start with Phase 1 of the build. After completing all build phases, execute the full test protocol, then iterate through repairs 3 times. 

Do not skip steps. Do not summarize code—write complete, working files. Test thoroughly. Fix systematically.

**START BUILD: Phase 1 - Foundation**
