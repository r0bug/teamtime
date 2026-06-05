# Vendor Print Queue — TeamTime ↔ yakima-label Contract

Date: 2026-06-05
Status: Proposed (producer side implemented on branch `feat/nrs-inventory-api-and-vendor-auth`)
Producer: TeamTime (this repo)
Consumer: `r0bug/yakima-label` (Python/PySide6 desktop label app)

## Why this exists

The original design (`2026-05-16-yakima-label-printer-design.md`) had the desktop
app *create* tags itself (`quickTag`) and print them immediately. New requirement:
tags made in the **TeamTime web vendor portal** should also get printed by the
desktop app. That needs a shared server-side queue the web portal writes to and the
desktop app drains.

This is additive. The desktop app's existing create-and-print flow is unchanged;
this just gives it a second source of work to print.

## Model

```
Web portal "Make a tag" + [x] Send to my label printer
        │
        ▼
  vendor_print_jobs  (status=queued)
        │  poll
        ▼
  Desktop app  ──GET tag-zpl──▶ prints over USB ──ack──▶ status=printed
```

The desktop app is untrusted. Every endpoint is scoped to the authenticated vendor
session server-side; a vendor can only ever see or ack their own jobs.

## Auth

Same as all other `/api/vendor/*` endpoints: the desktop app authenticates with the
vendor's TeamTime login (cookie session, established via `POST /login`). No new auth.
- `401` — not signed in
- `403` — signed in but vendor portal not enabled / no vendor record

## Endpoints

### `GET /api/vendor/print-queue`

Returns the caller-vendor's jobs with `status = queued`, newest first.

Response `200`:
```json
{
  "jobs": [
    {
      "id": "uuid",
      "partNumber": "SR60526001",
      "copies": 3,
      "description": "Vintage Pyrex bowl",
      "priceCents": 2499,
      "source": "web_portal",
      "status": "queued",
      "createdAt": "2026-06-05T19:05:52.840Z"
    }
  ]
}
```

Notes:
- `copies` is the number of label copies requested — pass it straight to the ZPL
  fetch below as `?copies=`.
- `priceCents` may be `null` (rare). Render price from it (`/100`) when present.
- Only `queued` jobs are returned. Once acked they drop out of this list.

### `GET /api/vendor/tag-zpl?partNumber=<sku>&copies=<n>`  *(already exists)*

Unchanged. Returns `text/plain` ZPL II for the SKU, with `^PQ<n>` when `copies` is
given. The desktop app fetches this per job and sends the bytes to the printer.
Refuses (`403`) if the SKU doesn't start with the caller-vendor's prefix.

### `POST /api/vendor/print-queue/:id/ack`

Mark a job done after attempting to print it.

Request body (JSON):
```json
{ "status": "printed" }
```
or
```json
{ "status": "failed", "failureReason": "out of media" }
```
An empty body defaults to `{ "status": "printed" }`.

Response `200`: `{ "ok": true, "id": "uuid", "status": "printed" }`
- `400` — `status` is not `printed` or `failed`
- `404` — no job with that id belongs to this vendor (also covers "already acked")

## Status lifecycle

```
queued ──ack printed──▶ printed
queued ──ack failed───▶ failed
queued ──(web cancel)─▶ cancelled   (future; web portal only)
```

A `failed` job is terminal in v1 — it will NOT reappear in the queue. The desktop
app should keep its own local "needs retry" list if it wants reprint-on-reconnect,
or the vendor re-makes the tag. (If we later want server-side retry, we add a
`requeue` endpoint — out of scope now.)

## Polling guidance

- Poll `GET /api/vendor/print-queue` while the app is open and online. Suggested
  interval: **15–30s** (these are human-paced tag creations, not high-frequency).
- Process oldest-first (the list is newest-first; reverse it, or sort by `createdAt`).
- For each job: fetch ZPL with `?copies=<job.copies>`, print, then `ack`.
- `ack` immediately after a successful print so it doesn't get re-fetched.

## Known v1 limitation (please confirm acceptable)

No claim/lease step. If a vendor runs the desktop app on two machines at once, both
could fetch the same `queued` job before either acks → double print. Given one
vendor = one printer in practice, v1 accepts this. If it bites, we add an atomic
`POST /api/vendor/print-queue/:id/claim` that flips `queued → claimed` and returns
404 to the loser. **Consumer: tell us if you need claim semantics in v1.**

## Server-side shape (FYI for the consumer)

Table `vendor_print_jobs` (see `src/lib/server/db/schema.ts`):
`id, vendor_id, part_number, copies, description, price_cents, source,
status (print_job_status enum), pending_change_id, created_by_user_id,
created_at, printed_at, failure_reason`.

Service: `src/lib/server/services/print-queue-service.ts`
Routes: `src/routes/api/vendor/print-queue/+server.ts`,
`src/routes/api/vendor/print-queue/[id]/ack/+server.ts`

## Open questions — RESOLVED 2026-06-05

Consumer reply: `2026-06-05-vendor-print-queue-contract-consumer-response.md`.

1. **`copies` → `^PQ` (single SKU, N copies): confirmed.** One job with `copies`.
2. **No claim/lease in v1: confirmed.** But the enum now reserves a `claimed` value
   (unused in v1) so a future admin/store mode can add an atomic
   `POST /api/vendor/print-queue/:id/claim` without a second enum migration.
3. **Keep `tag-zpl` a separate call: confirmed (required).** The desktop app picks
   the label format at print time, so ZPL must be fetched per print with a future
   `?format=` param — not inlined on the job.

### Follow-on scope raised by the consumer (NOT in v1, pending product decision)

The consumer asked for four additional TT-side surfaces for the broader project:
A) `GET /api/me` mode detection, B) admin/store-scoped queue endpoints,
C) admin-defined label-format selection via `?format=`, D) JSON `POST /api/vendor/items`
create endpoint. These are tracked separately and are not part of this queue v1.
