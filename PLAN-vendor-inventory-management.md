# Plan: Vendor Inventory Management (self-serve, NRS-backed)

Status: PROPOSED 2026-07-31. Owner request: vendors keep asking to manage their
own inventory in TeamTime. Ground rule: **NRS is the source of truth** — TeamTime
is a wrapper/portal; every mutation must land in NRS (directly or via the
staff-reviewed queue), never fork its own inventory state.

## What already exists (do not rebuild)

- `/vendor/inventory` portal page: lists the vendor's NRS inventory
  (`getInvStockForVendorCached`, SWR + `partial` flag for NRS latency), add-item
  (NRS-first create via `invstock/save`, hard-fail → `pending_inventory_changes`
  row), remove-item (pending `delete` for staff review), tag printing + queue.
- `pending_inventory_changes` table with `create | update | delete` enum,
  payload/previousPayload snapshots, full review lifecycle
  (pending→applied/rejected/cancelled) — **`update` is in the enum but has no UI
  and no apply path**.
- `/admin/vendors/inventory-changes` staff review screen, `markApplied`,
  `reject`, `buildNrsCsvFromChangeRows` (CSV for manual NRS keying),
  `autoApplyPendingCreatesViaApi`, API log + journal.
- NRS write primitives verified: **create** (`invstock/save`, create-only, err
  210 on dup partNumber) and **delete** (`invstock/delete {partNumber}`).
  **Update: unknown — this is the missing primitive.**

## Vendor experience (target)

On `/vendor/inventory` a vendor can:
1. **See** all their items — search/filter/sort (part #, description, price, qty
   on hand, created date, last-sold), with a freshness stamp ("NRS as of 2m ago")
   and the existing partial-data banner.
2. **Add** items (today's flow, unchanged).
3. **Edit** price and description on an item → immediate label-reprint offer at
   the new price. Change applies to NRS instantly if auto-apply is enabled for
   that field, else shows "pending staff review" chip on the row.
4. **Add stock** (+N copies of an existing item) → qty increment + N labels
   queued. Increments only; absolute quantity rewrites stay staff-only (POS is
   concurrently decrementing — last-writer-wins on absolute counts would corrupt).
5. **Remove/deactivate** an item (today's pending-delete flow, plus an
   "inactive" option once the update primitive lands).
6. **Bulk price actions**: select rows → "reduce by X%" / "set price" → one
   batched change set (one review row, N items) — this is the markdown/sale-event
   request.
7. **Track their changes**: a "My changes" tab listing pending/applied/rejected
   with staff rejection reasons (data already in the table via `listForVendor`).

Staff keep `/admin/vendors/inventory-changes` as the review/apply surface;
anything the API can't write auto is one CSV export away from manual NRS keying.

## Phases

### Phase 0 — crack the NRS update primitive (blocking for full self-serve, ~1 session)
Same playbook as the cash-register reverse-engineering:
1. Probe REST first: `invstock/save` with `invStockId`/`stockId` alongside
   existing partNumber (maybe save-with-id = update; memory only proves
   *partNumber-only* re-save fails), and guess `invstock/update|edit`.
2. Else reverse the web edit form (`/inventory/invStockForm?...` — session
   client + form POST, like `arCashRegForm`). `nrs-web-client.ts` already has the
   session scaffolding.
3. Else ask the NRS team (they have gated `/api/docs`; open question list exists).
4. Fallback if all fail: updates stay staff-applied via the review queue —
   Phase 1 ships anyway.
**All probing on dev.nrsaccounting.com, never prod NRS.**

### Phase 1 — vendor edit + change tracking on the existing queue (no new NRS writes, ~1-2 sessions)
- Edit price/description UI on `/vendor/inventory` → `submitChange('update')`
  with `previousPayload` snapshot (schema supports it today).
- "Add stock" increment flow (change payload `{quantityDelta: N}`) + label copies.
- "My changes" tab (`listForVendor`).
- Staff review screen: render update diffs (previous → proposed) — it only knows
  create/delete today.
- Bulk select + percent/absolute price change producing batched change rows.
Ships real vendor value even if Phase 0 stalls: vendors submit, staff one-click
review with a pre-filled diff instead of fielding texts/emails.

### Phase 2 — DB-backed inventory mirror (~1 session)
Replace the in-process SWR cache with a `vendor_inventory_snapshot` table
(per-item rows, refreshed on-demand per vendor + nightly sweep; `synced_at`
stamp). Why: real search/sort/pagination server-side despite NRS's 0.1s-25s
latency; apply-time conflict detection (compare NRS current vs `previousPayload`
— if NRS changed since the vendor looked, flag the change for review instead of
blind-applying); portal stays usable when NRS is down. Mirror is a **cache,
never authoritative** — writes still go NRS-first.

### Phase 3 — auto-apply pipeline (~1 session, after Phase 0)
- `applyUpdateViaApi`/`applyDeleteViaApi` mirroring `applyCreateViaApi`, wired
  into the existing API log.
- Policy table (appSettings JSON) for what auto-applies vs requires review.
  Proposed defaults: price/description edits and qty increments auto-apply;
  deletes and bulk actions ≥ N items or ≥ X% price drop require review.
  Owner to confirm thresholds.
- Auto-reprint: price change → enqueue new tag to `vendor_print_jobs` and mark
  old-tag-on-floor risk in the change row (floor tags show stale prices until
  swapped — staff visibility, not a blocker).

### Phase 4 — polish (opportunistic)
- Sales context per item (last sold, units sold — partially on the page already).
- Label-app parity: surface edit/add-stock in the Tauri app via the same
  `/api/vendor/*` endpoints (it already consumes inventory + print queue).
- Low/zero-qty nudges ("3 items at qty 0 — remove or restock?").

## Guardrails (non-negotiable)

- **SR/17009 (Storlie's/house)**: the entire store catalog is attached to this
  vendor as pass-through. Bulk actions and "select all" must be hard-capped or
  disabled for it; treat as house vendor everywhere (existing memory rule).
- **Ownership check on every mutation**: `checkVendorOwnsNrsItem` +
  `inventoryCodePrefix` on partNumber (exists — keep it in the update path).
- **No absolute quantity writes from vendors** (POS race).
- **NRS-first, hard-fail**: identical to create — if the NRS write fails,
  nothing is silently forked; the change stays pending/staff-retryable.
- **Audit**: every applied change through the existing API log + journal;
  vendor-visible history via previousPayload diffs.
- All dev against dev NRS + teamtime.trickpc.com; prod deploy per the
  build-on-hairydel procedure.

## Open questions for the owner

1. Auto-apply policy: are vendor price/description edits trusted (instant), or
   reviewed for the first month? (Recommend: instant, with review thresholds on
   big drops/bulk.)
2. Any price floor / commission-protection rule to enforce on edits?
3. Deactivate vs delete: prefer marking items inactive in NRS (needs Phase 0
   update primitive) over `invstock/delete`? Delete is destructive in NRS.
4. Do vendors get quantity *decrements* for "I took it home" (shrinkage-style
   negative adjustment), or is that staff-only too? (Recommend: staff-only.)
