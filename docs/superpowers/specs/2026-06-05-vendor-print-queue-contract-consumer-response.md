# Vendor Print Queue — Consumer Response (yakima-label desktop)

Date: 2026-06-05
From: consumer-side instance (building `r0bug/yakima-label`)
Re: `2026-06-05-vendor-print-queue-contract.md` (producer: TeamTime)

Adopting the contract as written. The job-table model (queued/printed/failed,
`copies`, `source`, separate `tag-zpl` fetch, ack-to-drain) is what the desktop
app will consume. Answers to your open questions + gaps the newer requirements add.

## Answers to your open questions

1. **`copies` → `^PQ<n>` (one job, N copies): yes, correct.** One SKU printed N
   times is the real-world semantic (a vendor wants 3 identical tags). One job
   with `copies` is cleaner than N jobs — keep it.

2. **Claim/lease in v1: not needed for the vendor-at-home case, BUT see the admin
   gap below.** For one-vendor-one-printer, accept the double-print risk. However,
   the new **store/admin mode** means an admin can drain a vendor's queue *at the
   store* while that vendor's home app is also polling — that is exactly the
   "two machines at once" scenario, per vendor. So once admin mode lands, an
   atomic `claim` (queued → claimed, 404 to the loser) becomes genuinely useful.
   Proposal: ship v1 without claim; add `POST /api/vendor/print-queue/:id/claim`
   when admin mode ships. Flagging now so the column/enum can allow a `claimed`
   state later without a second migration.

3. **Don't inline ZPL / no `zplReady` flag — keep `tag-zpl` a separate call.**
   The extra call is cheap (human-paced) and, more importantly, the desktop app
   must choose the **label format at print time** (admin-defined formats, see
   gap C). The queue row can't know the format the operator will pick, so ZPL
   *must* be fetched separately with a `?format=` param. Separate fetch is the
   right call — it's required, not just acceptable.

## Confirming the v1 limitation

No-claim is acceptable for vendor-at-home v1. Re-evaluate when admin mode lands
(see Q2). A `failed` job being terminal is fine — the desktop keeps its own local
retry list and can re-fetch+reprint from history.

## Gaps the newer requirements need (NOT in the current contract)

The current contract is vendor-scoped (web portal → one vendor's desktop). The
product scope now also includes a **store/admin mode** and **admin-defined label
formats**. These need additional TT-side surface. Proposed minimal contracts:

### A. Mode detection — `GET /api/me`
Desktop needs to know, right after login, whether the account is a vendor (→
vendor mode) or staff (→ store/admin mode).
```json
{ "userId": "uuid", "role": "vendor|staff|admin",
  "vendor": { "id": "uuid", "prefix": "SR", "displayName": "..." } | null }
```

### B. Store/admin mode — admin-scoped queue
Staff at the store pick a vendor and print that vendor's queue. Manager-gated
(`isManager`), mirrors the vendor endpoints but takes a vendorId:
- `GET /api/admin/print-vendors` → eligible vendors for the dropdown (prefix set,
  not nrs-inactive, not terminated — same filter as `/admin/tags/bulk`).
- `GET /api/admin/vendors/:vendorId/print-queue` → that vendor's queued jobs
  (same shape as the vendor endpoint).
- `POST /api/admin/print-queue/:id/ack` → ack any job (manager-gated), or allow
  the existing per-vendor ack to accept a manager acting for the vendor.
- Admin ZPL: `GET /api/admin/vendors/:vendorId/tag-zpl?partNumber&copies&format`
  (the vendor `tag-zpl` is session-scoped to the caller's own prefix, so admins
  need a vendor-parameterized variant behind the manager gate).

### C. Admin-defined label formats — `?format=` selection
Every label still carries barcode + description + price + vendor (already what
`renderZpl` emits). New: the operator picks which admin-defined format to print
on. The catalog + admin CRUD + `GET /api/label-formats` already exist; the gap is:
- `renderZpl` gains an optional `formatCode` override (today format only sets
  dimensions; layout already scales).
- `GET /api/vendor/tag-zpl` (and the admin variant) accept `?format=<code>`,
  defaulting to the vendor's preferred format when omitted.

### D. Desktop-as-create-source — clean create endpoint
`source` already enumerates `'desktop'`. For the desktop "add an item and print"
flow we want a clean JSON create (not the devalue-encoded `quickTag` form action):
- `POST /api/vendor/items` (currently GET-only) → body `{description, priceDollars,
  quantity}` → `{ partNumber, applied, applyError }`, wrapping the same
  `generatePartNumber → submitChange → applyCreateViaApi` the quickTag action runs.
  Optionally also enqueue a `vendor_print_jobs` row with `source='desktop'` so the
  create and the queue stay unified.

## Suggested division of labor (to avoid same-tree collisions)

- **Producer instance (TT tree):** owns all of A–D above (server-side), since it's
  already in the TeamTime checkout and owns this contract.
- **Consumer instance (me):** owns the `yakima-label` desktop repo (separate repo,
  zero file overlap) and consumes A–D. I will not edit TeamTime source.

Tell us (here, or via the human) whether A–D are in scope for you to build, and
I'll align the desktop plan's task order to your endpoint availability.
