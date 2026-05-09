# Staff Guide: Vendor Operations

Operational reference for managing the ~90 booth vendors at Yakima Finds: onboarding, agreements, tag design, label formats, and the inventory-change pipeline that pushes vendor-submitted items into NRS.

---

## 1. Overview

### Source-of-truth principle

**NRS POS is the source of truth** for:

- Vendor identity (name, NRS vendor ID, pass-through flag, active/inactive)
- Sales transactions
- Commission / payment percentage
- Live inventory (stock counts, prices once items are in NRS)

**TeamTime owns** the things NRS doesn't track:

- Booth rent (monthly $ amount)
- Agreements (primary + add-ons, with signature capture)
- Vendor contact info beyond what NRS stores
- Internal notes
- Portal access (link to a TT user, `portalEnabled` flag)
- **Pending inventory changes** queued by vendors via the portal, awaiting push to NRS

We never mirror sales or live stock into TT tables — those are always fetched live from the NRS API when a staff member views them.

### Where things live

| Function | Path |
|----------|------|
| Vendor list + filters | `/admin/vendors` |
| Vendor detail | `/admin/vendors/[id]` |
| Tag designer | `/admin/vendors/[id]/tags` |
| Label format CRUD | `/admin/label-formats` |
| Inventory changes queue | `/admin/vendors/inventory-changes` |
| Onboarding flow | `/admin/vendors/onboarding` |
| Vendor portal entry | `/vendor` (vendors log in at `/login`) |
| Vendor inventory page | `/vendor/inventory` |

---

## 2. Vendor List (`/admin/vendors`)

The main directory. Filterable by:

- **Status** — active / inactive / archived
- **Missing contact** — vendors with no email or phone on the TT record
- **Missing primary agreement** — vendors who haven't signed (or had on-file marked) the current primary agreement

### Sync from NRS

Click **Sync from NRS** at the top. This:

1. Calls the NRS vendor list endpoint
2. Filters to vendors where `passThrough = true` and `nrsInactive = false`
3. **Inserts** any new ones (matched by `nrsVendorId`)
4. Updates name + payment % on existing matches
5. Is **idempotent** — safe to re-run anytime

Vendors that aren't pass-through, or that NRS has marked inactive, are deliberately skipped. If a vendor is missing after a sync, check those two flags first in NRS.

### CSV import

Use the **Import CSV** button to backfill rent and payment % for many vendors at once. Useful when onboarding the initial cohort or after a rent rate change. The script reference is `scripts/import-vendor-csv.mjs` if you need to run it from the command line.

---

## 3. Onboarding a Vendor (`/admin/vendors/onboarding`)

Use this guided flow when signing up a new booth in person. The flow walks through:

1. **Contact** — name, email, phone, mailing address. Email is required if you want them to access the vendor portal later.
2. **Terms** — booth #, booth prefix (e.g. "SR" for Storlie Relics — used in part numbers), monthly rent amount, payment %, start date.
3. **Primary agreement** — pick the active primary agreement template. Vendor reads it on screen.
4. **Signature capture** — vendor signs on a touch screen or trackpad. Signature is stored as an image with the agreement record. If they signed on paper instead, toggle **Paper original on file** and skip the signature pad.
5. **Save** — creates the vendor record. From there you can link a TT user and enable portal access (Section 9).

The flow is forgiving — you can navigate back, edit fields, and finish later. Partial vendors show up in the list with a "Missing contact" or "Missing primary agreement" filter hit.

---

## 4. Vendor Detail Page (`/admin/vendors/[id]`)

Tabbed interface:

### Overview
Contact, booth #, prefix, rent, payment %, start date, status. Edit-in-place for everything in this tab.

### Agreements
Two sections:

- **Primary agreement** — exactly one active at a time per vendor. Re-signing supersedes the prior one but the history is kept.
- **Add-on agreements** — any number; each is its own record (e.g. promotional consent, additional booth, etc.).

Each agreement shows:
- Template version
- Signature image (or "paper on file" badge)
- Date signed
- A **paper-original toggle** for cases where the vendor signed a physical copy and we just want a checkbox marker, not a stored signature image

### Sales & Performance
Lives data from NRS. Pulls:
- Recent transactions
- Sales totals (today / week / month / YTD)
- Top-selling items
- Commission earned

If the NRS API is unreachable, this tab shows a clear error rather than stale cached data.

### Notes
Free-form internal notes. Timestamped, attributed to the staff member who wrote them.

---

## 5. Tag Designer (`/admin/vendors/[id]/tags`)

Per-vendor tag layout. Live SVG preview updates as you change settings.

### Toggleable elements (top to bottom)

| Element | Notes |
|---------|-------|
| Header line | Defaults to vendor display name |
| Barcode | Code 128 or Data Matrix (see below) |
| Part number text | Human-readable, beneath the barcode |
| Item name / description | Whatever the vendor entered |
| Price | Large, bold |
| Footer line | Optional — phone, "Thank you", etc. |

### Settings

- **Font scale** — small / medium / large (affects all text proportionally)
- **Preferred format** — Avery 5160 / 5163 / 5167 sheet, or Zebra 2x1 / 4x2 thermal. Custom sizes can be added in `/admin/label-formats`.
- **Zebra DPI** — 203 or 300

### Code 128 vs Data Matrix

| | Code 128 | Data Matrix |
|---|----------|-------------|
| Type | 1D linear | 2D square |
| Size | Wider, takes more horizontal room | ~3× more compact |
| Scanner | Any laser or imager | **Imager required** (no laser-only scanners) |
| Use when | Default; safest choice | Tag is small (e.g. tiny jewelry tags) and you've confirmed POS scanner is an imager |

Default to Code 128 unless there's a real space constraint and you've verified the register's scanner. Yakima Finds' main register currently uses an imaging scanner, but a backup laser-only scanner exists — if a tag won't scan, that's the first thing to check.

---

## 6. Label Formats (`/admin/label-formats`)

CRUD for the label sizes that appear in the tag designer's "Preferred format" dropdown. Two categories:

- **Sheet labels** — Avery-style with N labels per page (rows × columns, margins, gaps)
- **Thermal labels** — single-label rolls for Zebra-class printers (width × height in inches)

Add a new format by clicking **New format**, picking the type, filling in dimensions, and saving. New formats are immediately available in every vendor's tag designer.

### Browser Print download banner

The label-formats page (and a few others) show a banner linking to Zebra Browser Print. Vendors get the same banner on the vendor inventory page — this is just for staff reference and for when staff are walking a vendor through setup.

---

## 7. Inventory Changes Queue (`/admin/vendors/inventory-changes`)

Where vendor-submitted tags wait to be pushed into NRS.

A row appears here every time a vendor clicks **Make Tag** in `/vendor/inventory`. Each row shows:

- Vendor (name + prefix)
- Auto-generated part number
- Description
- Price
- Submitted timestamp
- Status: pending / applied / rejected

### Three workflows

You can apply pending changes three ways. Pick whichever fits the situation.

#### A. Manual mark-applied per row

For one-off pushes, or when you've added the item to NRS by hand. Click **Mark applied** on the row. The row's status flips to "applied" and a note is logged. No CSV, no automation.

#### B. Download CSV → upload to NRS Importer manually

Click **⬇ Download CSV** at the top. The system generates an NRS Importer-compatible CSV containing all currently-pending rows. Steps:

1. Save the file.
2. Open the NRS Importer web UI (`https://importer.nationalretailsolutions.com` — or whatever URL Corporate has given you).
3. Log in.
4. Upload the CSV via the Importer's upload page.
5. Submit.
6. Come back to TT and **Mark applied** on the rows you just imported (or use the bulk-apply checkbox).

Use this when:
- Auto-apply is failing for some reason
- You want to eyeball the CSV before submission
- The NRS Importer is having issues and you need to retry manually

#### C. 🤖 Auto-apply via NRS

The fully-automated path. Click **🤖 Auto-apply via NRS**. The system:

1. Reads the NRS Importer credentials from `scraper-imports/nrscreds.secret`.
2. Logs into the NRS Importer with those credentials.
3. Groups pending rows **by vendor**. NRS Importer requires one CSV per pass-through supplier.
4. For each vendor:
   - Skips if the vendor has no `nrsVendorId` (logs a warning)
   - Generates a CSV scoped to that vendor
   - Uploads it to the Importer
   - Submits the upload form
   - Reads the result page; pattern-matches a success message
   - Marks the rows applied with a note: `"Auto-applied via NRS Importer (file #N)"`
5. Returns a result banner per-vendor:
   - **✓** — clear success message detected
   - **⚠** — upload completed but no success message could be matched (probably worked, double-check in NRS)
   - **✗** — upload failed (network error, login failure, validation rejection)

**Per-vendor failure isolation:** if vendor A fails, vendors B/C/D are still attempted. The banner aggregates results.

When to prefer auto-apply:
- Bulk push at end of day with many vendors' tags pending
- Vendors all have valid `nrsVendorId`s
- NRS Importer is up

When to prefer download-CSV:
- One specific vendor's CSV needs review
- You're troubleshooting why auto-apply got a ⚠ result
- NRS Importer's UI has changed and the auto-apply flow is broken until updated

#### Per-row Reject

Use **Reject** when a vendor submitted something obviously wrong (e.g. price of $0, joke description). The row is marked rejected and won't be included in any CSV. The vendor sees it as rejected on their inventory page.

---

## 8. Auto-Generated Part Numbers

Format:

```
{prefix}{compactDate}{NNNN}
```

- **prefix** — vendor's `boothPrefix` (e.g. "SR")
- **compactDate** — `YY` + month-without-leading-zero + day-without-leading-zero
  - May 8, 2026 → `2658`
  - April 11, 2026 → `26411`
  - October 3, 2026 → `26103`
  - Note: `26411` and `26103` are unambiguous in context because the counter follows immediately and the format is parsed left-to-right with the year always being 2 digits.
- **NNNN** — zero-padded counter, atomic per `(vendorId, dateLocal)`

Examples:
- Storlie Relics' first tag on May 8, 2026: `SR26580001`
- Their fifth tag the same day: `SR26580005`
- A different vendor (prefix "BJ") making their first tag the same day: `BJ26580001`

The counter is allocated atomically in a transaction so two vendors clicking **Make Tag** at the same instant always get unique codes.

If a vendor's `boothPrefix` is null/blank, part numbers are still generated but without the prefix portion. Staff should set the prefix as soon as possible.

---

## 9. Vendor Portal Access

Vendors log in via the **same** `/login` page staff use. There's no separate vendor login URL.

### Linking a vendor to a user

1. Create the TT user record (or have the vendor sign up via whatever your invite flow is).
2. On `/admin/vendors/[id]`, link the vendor record to the user via the `userId` field. This field is **nullable** — vendors without portal access have `userId = null`.
3. Set `portalEnabled = true` on the vendor record.

Both conditions must be true for the vendor to access `/vendor/*` routes:
- A linked user (`vendor.userId IS NOT NULL`)
- Portal enabled (`vendor.portalEnabled = true`)

The route guard checks both. If a vendor logs in but their `userId` link is missing or `portalEnabled` is false, they hit the regular staff dashboard rather than `/vendor`.

### Disabling access

To revoke portal access without deleting anything: set `portalEnabled = false`. The user record stays intact, the vendor record stays intact, and you can flip it back on later.

---

## 10. NRS API Constraints

A few things to know about the NRS API surface so you understand why the system works the way it does:

- **`invstock/getall` is read-only.** Returns inventory and stock counts. No companion write endpoint exists in the public API (we've probed; see `scripts/nrs-probe-*.ts` for the artifacts of that investigation).
- **No public write endpoint for creating new inventory items.** This is the central reason auto-apply drives the **NRS Importer web UI** with session cookies rather than calling a clean API. If/when NRS exposes a write endpoint, we'd swap the implementation in `nrs-importer-client.ts` and the rest of the queue UI stays the same.
- **Vendor list endpoint is read-only too** but updates are infrequent enough that the daily Sync from NRS button works fine.

---

## 11. Common Operations

### "A vendor's tag isn't printing on their Zebra"

Ask them:
1. Is **Browser Print** running in the tray? (Not just installed — actively running.)
2. Is a **default printer** selected in Browser Print?
3. USB cable connected, printer powered on?
4. Is the **amber banner** showing on `/vendor/inventory`? If so, Browser Print isn't reachable at `localhost:9100`.

If all of those are good and it's still not printing, walk through their browser console (F12 → Console tab) for errors and share with engineering.

### "A vendor is missing their booth prefix"

Go to `/admin/vendors/[id]` → Overview tab → set **Booth prefix**. Save. From now on their tags include the prefix. Past part numbers (without the prefix) stay as-is and remain valid.

### "Auto-apply succeeded for most vendors but failed for one"

- Check the result banner — the failing vendor shows **✗** with a reason.
- Most common causes:
  - Vendor has no `nrsVendorId` — sync from NRS, or set it manually if you know it
  - NRS Importer rejected the CSV (validation error in description or price field)
  - Login session timeout — re-run auto-apply (it re-authenticates per run)
- The other vendors that succeeded are already marked applied; the failed one is still pending. Re-run auto-apply, or use Download CSV to push that one manually.

### "Auto-apply gave me ⚠ for everything"

That means uploads happened but the success-message pattern matcher didn't find the expected text. Probably the NRS Importer changed its post-upload page layout. Check NRS manually to confirm the items did import:
- If they did, mark the rows applied yourself and file an issue to update the matcher.
- If they didn't, file an urgent issue — the upload flow itself may be broken.

### "We synced from NRS but a vendor I know exists didn't import"

Probably one of:
- `nrsInactive = true` on the NRS side — the sync deliberately excludes inactive vendors
- `passThrough = false` — only pass-through vendors are imported
- The vendor exists in NRS but under a different `nrsVendorId` than expected

Check the NRS-side record first. If both flags are correct, run sync again with debug logging or check `scripts/nrs-vendors-export.csv` for the raw list.

### "A vendor reports their tag didn't ring up at the register"

Was it ever auto-applied or manually applied? Check `/admin/vendors/inventory-changes` and filter by that vendor. If the row is still **pending**, that's the answer — apply it now. If it's **applied** but still not scanning, check NRS directly with the part number.

---

## 12. Files & Endpoints Reference

### Services (`src/lib/server/services/`)

- `vendor-service.ts` — vendor CRUD, NRS sync
- `vendor-leaderboard-service.ts` — performance ranking
- `inventory-change-service.ts` — pending queue, atomic part-number allocation
- `nrs-importer-client.ts` — auto-apply driver (login, upload, parse result)
- `tag-render-service.ts` — SVG + ZPL generation for tags
- `label-format-service.ts` — sheet/thermal format CRUD

### Admin routes (`src/routes/(app)/admin/`)

- `vendors/+page.svelte` — list view
- `vendors/[id]/+page.svelte` — detail with tabs
- `vendors/[id]/tags/+page.svelte` — tag designer
- `vendors/inventory-changes/+page.svelte` — queue with apply buttons
- `vendors/onboarding/+page.svelte` — guided flow
- `label-formats/+page.svelte` — label format CRUD

### Vendor-facing routes (`src/routes/(app)/vendor/`)

- `+page.svelte` — vendor dashboard
- `inventory/+page.svelte` — make-a-tag + pending list

### Scripts (`scripts/`)

- `import-vendor-csv.mjs` — CLI vendor import
- `vendor-data-coverage.mjs` — audit which vendors are missing what
- `vendor-prefix-audit.mjs` — find vendors with no booth prefix set
- `nrs-vendors-export.csv` — most recent raw NRS vendor list (for debugging sync gaps)
- `nrs-probe-*.ts` — exploratory scripts; artifacts of the NRS API investigation

### Config / secrets

- `scraper-imports/nrscreds.secret` — NRS Importer login (NEVER commit; checked in `.gitignore`)
- `.env` — DB URL, AUTH_SECRET, etc.

---

## Quick Decision Tree

**A vendor just walked in to sign up.** → `/admin/vendors/onboarding`

**End of day, lots of pending tags.** → `/admin/vendors/inventory-changes` → 🤖 Auto-apply via NRS

**One vendor's CSV needs review before push.** → `/admin/vendors/inventory-changes` → ⬇ Download CSV → inspect → upload manually to NRS Importer

**A vendor wants their tag layout changed.** → `/admin/vendors/[id]/tags`

**A vendor's missing from the list after I expected them.** → Check NRS for `passThrough` and `nrsInactive`. Re-run Sync from NRS.

**Need a new label size for a custom Avery sheet.** → `/admin/label-formats` → New format

**Vendor needs portal access enabled.** → `/admin/vendors/[id]` → set `userId` → toggle `portalEnabled = true`
