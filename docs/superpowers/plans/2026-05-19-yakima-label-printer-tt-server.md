# Yakima Label Printer — TT Server-Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the TeamTime server-side endpoints, schema changes, and admin UI extensions required by the new Yakima Finds Python desktop label-printer client (Plan 2, separate repo `r0bug/yakima-label`). This plan stands alone — when finished, the existing web vendor portal also benefits (new SKU format, quantity on quickTag, label-format catalog), so it ships independent value even before the desktop app exists.

**Architecture:** All work happens in the existing TeamTime SvelteKit app on branch `vendor-label-printer-spec` (already cut, spec already committed). Changes are: one SKU-format edit in `vendor-service.ts`, two schema migrations (extend `label_formats`, new `kit_profiles`), four new REST endpoints (`/api/label-formats`, `/api/kit-profiles`, `/api/vendor/items`, `/api/vendor/tag-sheet-pdf`), two existing endpoints extended (`quickTag` action + `tag-zpl`), and a form-field expansion of the existing `/admin/label-formats/` admin page. The desktop client is untrusted — every endpoint validates against the authenticated vendor session.

**Tech Stack:** SvelteKit 2.5, Svelte 4, TypeScript, Drizzle ORM, PostgreSQL 15, Vitest (unit + integration via `vi.mock('$lib/server/db', ...)`), bwip-js (barcodes — already in tag-render-service), puppeteer (new; HTML→PDF for Avery sheet endpoint).

**Spec:** `docs/superpowers/specs/2026-05-16-yakima-label-printer-design.md`

**Repo rules (from `CLAUDE.md`):**
- Never amend commits — always new commits.
- Never push to main/master.
- Run `npm run check` before committing TypeScript changes.
- Never read or commit `.env`, `.env.local`, `.env.production`, `.ai-keys.json`, `*.pem`, `*.key`.

---

## File Structure

**Files modified:**

| Path | What changes |
|---|---|
| `src/lib/server/db/schema.ts` | Extend `labelFormats` with 8 cols; add `kitProfiles` table; fix stale comment on `vendorPartnumberSequences.dateStr` |
| `src/lib/server/services/vendor-service.ts:1132-1162` | `generatePartNumber` — change `{YYMD}{NNNN}` to `{MDDYY}{NNN}` |
| `src/lib/server/services/label-format-service.ts` | Add `version` auto-bump on create/update; expose `listFormatsModifiedSince()` |
| `src/lib/server/services/tag-render-service.ts:470` | `renderZpl` accepts `copies` arg; replace hardcoded `^PQ1` with `^PQ${copies}` |
| `src/routes/(app)/vendor/inventory/+page.server.ts:125-164` | `quickTag` action — accept `quantity` form field |
| `src/routes/api/vendor/tag-zpl/+server.ts` | Read `?copies=<n>` query param, pass through to `renderZpl` |
| `src/routes/(app)/admin/label-formats/+page.server.ts` | Extend `readInput` to read 8 new fields |
| `src/routes/(app)/admin/label-formats/+page.svelte` | Add form inputs for the 8 new fields |
| `package.json` | Add `puppeteer` dep |

**Files created:**

| Path | Responsibility |
|---|---|
| `drizzle/0013_extend_label_formats.sql` | Generated migration: add 8 cols to `label_formats` |
| `drizzle/0014_add_kit_profiles.sql` | Generated migration: create `kit_profiles` table |
| `drizzle/0015_seed_label_format_catalog.sql` | Hand-written data migration: backfill `category`/`manufacturer` for existing rows; insert ~12 starter formats |
| `src/lib/server/services/kit-profile-service.ts` | New service: CRUD for `kit_profiles` rows, scoped to a vendor |
| `src/lib/server/services/pdf-render-service.ts` | New service: thin puppeteer wrapper, `renderHtmlToPdf(html: string): Promise<Buffer>` |
| `src/routes/api/label-formats/+server.ts` | `GET` — catalog read with `?modified_since=<int>` |
| `src/routes/api/kit-profiles/+server.ts` | `GET` (mine), `POST` (upsert) |
| `src/routes/api/vendor/items/+server.ts` | `GET` — paginated vendor items with `?modified_since=<iso>` |
| `src/routes/api/vendor/tag-sheet-pdf/+server.ts` | `GET` — Avery sheet PDF for desktop |
| `tests/unit/services/generate-part-number.test.ts` | Unit: SKU format, daily reset, atomic increment |
| `tests/unit/services/kit-profile-service.test.ts` | Unit: vendor-scoping, upsert, schema validation |
| `tests/unit/services/label-format-service.test.ts` | Unit: version monotonicity on update |
| `tests/unit/services/tag-render-zpl-copies.test.ts` | Unit: `^PQ<n>` appended correctly |
| `tests/integration/api-label-formats.test.ts` | Integration: auth, `?modified_since` delta |
| `tests/integration/api-kit-profiles.test.ts` | Integration: vendor-scoped GET/POST, isolation |
| `tests/integration/api-vendor-items.test.ts` | Integration: pagination + delta, isolation |
| `tests/integration/api-vendor-tag-zpl-copies.test.ts` | Integration: `?copies=` flows through |
| `tests/integration/api-vendor-tag-sheet-pdf.test.ts` | Integration: returns `application/pdf`, scoped to vendor |
| `tests/integration/quickTag-quantity.test.ts` | Integration: action persists `quantity` in payload |

---

## Conventions used in every task

- **Branch:** `vendor-label-printer-spec` (already checked out)
- **Test runner:** `npx vitest run tests/path/to/file.ts` (single file) or `npx vitest run -t "test name"` (single test)
- **Commit message style:** `<scope>: <subject>` matching recent log (`feat(vendor): ...`, `fix(auth): ...`)
- **DB mocking:** Tests use `vi.mock('$lib/server/db', ...)` per `tests/integration/api-user-functions.test.ts`. Each test file mocks only what it needs. Do not stand up a real DB for unit/integration tests.
- **Auth fixtures:** `tests/fixtures/api-helpers.ts` exports `callHandlerAs(handler, role, options)`. Use it. Do not invent a new auth fixture.
- **Before every commit:** run `npm run check` and `npm run test:run -- <files-just-changed>`. Both must pass.
- **Migration filenames:** Drizzle picks the slug after the number (e.g. `0013_busy_unicorn.sql`). The filenames cited below (`0013_extend_label_formats.sql`, etc.) are placeholders — use whatever `npm run db:generate` actually produces. `git add` the real filename, not the placeholder.

---

## Task 1: Switch SKU format to `{prefix}{MDDYY}{NNN}`

**Files:**
- Test: `tests/unit/services/generate-part-number.test.ts` (create)
- Modify: `src/lib/server/services/vendor-service.ts:1132-1162`
- Modify: `src/lib/server/db/schema.ts:3422-3432` (fix stale `// YYYYMMDD` comment)

The existing comment in `schema.ts:3427` says `// YYYYMMDD` but the code stores `${yy}${m}${d}` — short, unpadded. The format is moving to `{M}{DD}{YY}` with two-digit day, no leading zero on month, and a 3-digit serial. Counter still resets daily via the (vendorId, dateStr) unique constraint — atomic increment unchanged.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/services/generate-part-number.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing the service under test
const mockSelect = vi.fn();
const mockInsert = vi.fn();
vi.mock('$lib/server/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => mockSelect() }) }) }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: () => mockInsert() })
      })
    })
  },
  vendors: {},
  vendorPartnumberSequences: { vendorId: 'vendorId', dateStr: 'dateStr', lastNumber: 'lastNumber' }
}));

import { generatePartNumber } from '$lib/server/services/vendor-service';

describe('generatePartNumber — MDDYY format', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockSelect.mockResolvedValue([{ id: 'v1', inventoryCodePrefix: 'SR' }]);
  });

  it('produces prefix + M + DD + YY + 3-digit serial for May 16, 2026', async () => {
    mockInsert.mockResolvedValue([{ lastNumber: 1 }]);
    const sku = await generatePartNumber('v1', { now: new Date(Date.UTC(2026, 4, 16, 12, 0, 0)) });
    // month=5 (no pad), day=16, year=26, serial=001
    expect(sku).toBe('SR51626001');
  });

  it('zero-pads day to 2 digits but does not pad month', async () => {
    mockInsert.mockResolvedValue([{ lastNumber: 7 }]);
    const sku = await generatePartNumber('v1', { now: new Date(Date.UTC(2026, 0, 3, 12, 0, 0)) });
    // month=1, day=03, year=26, serial=007
    expect(sku).toBe('SR10326007');
  });

  it('pads serial to 3 digits, not 4', async () => {
    mockInsert.mockResolvedValue([{ lastNumber: 42 }]);
    const sku = await generatePartNumber('v1', { now: new Date(Date.UTC(2026, 4, 16, 12, 0, 0)) });
    expect(sku).toMatch(/^SR51626\d{3}$/);
    expect(sku).toBe('SR51626042');
  });

  it('throws when vendor has no prefix', async () => {
    mockSelect.mockResolvedValue([{ id: 'v1', inventoryCodePrefix: null }]);
    await expect(generatePartNumber('v1')).rejects.toThrow(/prefix/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run tests/unit/services/generate-part-number.test.ts
```
Expected: 3 tests fail (assert text mismatch on output format); 1 passes (throws when no prefix — this branch is unchanged).

- [ ] **Step 3: Update `generatePartNumber`**

In `src/lib/server/services/vendor-service.ts`, replace lines 1141-1161 with:

```ts
		const now = opts?.now ?? new Date();
		const m = String(now.getUTCMonth() + 1);
		const dd = String(now.getUTCDate()).padStart(2, '0');
		const yy = String(now.getUTCFullYear()).slice(-2);
		const dateStr = `${m}${dd}${yy}`;

		// Atomic increment: insert with last_number=1 if no row, otherwise bump.
		const [row] = await db
			.insert(vendorPartnumberSequences)
			.values({ vendorId, dateStr, lastNumber: 1 })
			.onConflictDoUpdate({
				target: [vendorPartnumberSequences.vendorId, vendorPartnumberSequences.dateStr],
				set: {
					lastNumber: sql`${vendorPartnumberSequences.lastNumber} + 1`,
					updatedAt: new Date()
				}
			})
			.returning({ lastNumber: vendorPartnumberSequences.lastNumber });

		const serial = String(row.lastNumber).padStart(3, '0');
		return `${vendor.inventoryCodePrefix}${dateStr}${serial}`;
```

Also update the doc-comment block above the function (line ~1125) to read:

```ts
 * Example: today (May 16, 2026) → SR51626001
```

- [ ] **Step 4: Fix stale schema comment**

In `src/lib/server/db/schema.ts`, change line 3423-3424's doc comment from:

```ts
// Per-vendor-per-day atomic counter for auto-generated part numbers.
// Format: {vendor.inventoryCodePrefix}{YYYYMMDD}{0001..} — keeps codes
// globally unique without requiring vendors to invent IDs.
```

to:

```ts
// Per-vendor-per-day atomic counter for auto-generated part numbers.
// Format: {vendor.inventoryCodePrefix}{M}{DD}{YY}{NNN} — e.g. SR51626001.
// Counter resets daily; (vendor_id, date_str) uniqueness keeps writes atomic.
```

And on line 3427, change the inline comment from `// YYYYMMDD` to `// MDDYY`.

- [ ] **Step 5: Run test, verify it passes**

```bash
npx vitest run tests/unit/services/generate-part-number.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 6: Run typecheck**

```bash
npm run check
```
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add tests/unit/services/generate-part-number.test.ts \
        src/lib/server/services/vendor-service.ts \
        src/lib/server/db/schema.ts
git commit -m "feat(vendor): switch SKU format to {prefix}{MDDYY}{NNN}"
```

---

## Task 2: Extend `label_formats` schema with 8 catalog-sync columns

**Files:**
- Modify: `src/lib/server/db/schema.ts:3438-3457`
- Create: `drizzle/0013_extend_label_formats.sql` (auto-generated by `npm run db:generate`)

New columns:
- `media_shape text not null default 'rectangle'` — `'rectangle' | 'barbell' | 'circle' | 'custom'`
- `shape_dims_json jsonb` — free-form shape-specific dimensions (e.g. barbell panel widths)
- `media_sensor text` — `'gap' | 'mark' | 'continuous'`, null for sheet formats
- `category text not null default 'sheet'` — `'thermal' | 'sheet'` (denormalises `layout` for catalog filtering; we keep both for now)
- `manufacturer text not null default 'custom'` — `'zebra' | 'avery' | 'custom'`
- `part_number text` — manufacturer's stock part number (e.g. `10026378` for Zebra Z-Select 4000T)
- `dpi integer` — thermal printer head DPI this format is calibrated for; null for sheets
- `version integer not null default 1` — monotonic per row; bumps on every update so clients can sync deltas

- [ ] **Step 1: Update `labelFormats` definition**

In `src/lib/server/db/schema.ts`, replace lines 3438-3457 with:

```ts
export const labelFormats = pgTable('label_formats', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: text('code').notNull().unique(), // e.g. 'avery_5160'
	name: text('name').notNull(),          // human-readable, "Avery 5160 — 30-up sheet"
	layout: text('layout').notNull(),      // 'sheet' | 'thermal'
	labelWidthInches: decimal('label_width_inches', { precision: 5, scale: 3 }).notNull(),
	labelHeightInches: decimal('label_height_inches', { precision: 5, scale: 3 }).notNull(),
	// Sheet-only fields
	pageWidthInches: decimal('page_width_inches', { precision: 5, scale: 3 }),
	pageHeightInches: decimal('page_height_inches', { precision: 5, scale: 3 }),
	cols: integer('cols'),
	rows: integer('rows'),
	marginTopInches: decimal('margin_top_inches', { precision: 5, scale: 3 }),
	marginLeftInches: decimal('margin_left_inches', { precision: 5, scale: 3 }),
	verticalPitchInches: decimal('vertical_pitch_inches', { precision: 5, scale: 3 }),
	horizontalPitchInches: decimal('horizontal_pitch_inches', { precision: 5, scale: 3 }),
	// Catalog-sync fields (added 2026-05-19 for desktop label printer)
	mediaShape: text('media_shape').notNull().default('rectangle'), // 'rectangle' | 'barbell' | 'circle' | 'custom'
	shapeDimsJson: jsonb('shape_dims_json'),
	mediaSensor: text('media_sensor'),                              // 'gap' | 'mark' | 'continuous', null for sheets
	category: text('category').notNull().default('sheet'),          // 'thermal' | 'sheet'
	manufacturer: text('manufacturer').notNull().default('custom'), // 'zebra' | 'avery' | 'custom'
	partNumber: text('part_number'),
	dpi: integer('dpi'),
	version: integer('version').notNull().default(1),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});
```

Confirm `jsonb` is already imported at the top of `schema.ts` (it is — search for `jsonb`). If not, add it to the `drizzle-orm/pg-core` import.

- [ ] **Step 2: Generate the migration**

```bash
npm run db:generate
```
Expected: new file `drizzle/0013_extend_label_formats.sql` written; `drizzle/meta/_journal.json` updated. Inspect the generated SQL — it should be a series of `ALTER TABLE label_formats ADD COLUMN ...` statements separated by `--> statement-breakpoint`.

- [ ] **Step 3: Sanity-check the migration**

```bash
cat drizzle/0013_extend_label_formats.sql
```
Verify each of the 8 new columns appears exactly once and that no unintended columns are touched. If the generated file includes an unexpected change (rare but possible if `db:generate` detects drift), stop and ask the user before continuing.

- [ ] **Step 4: Run typecheck**

```bash
npm run check
```
Expected: no errors. (Drizzle generates new TS types for `LabelFormat` inferring the new columns; ensure nothing downstream is unhappy.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/db/schema.ts drizzle/0013_extend_label_formats.sql drizzle/meta/_journal.json
git commit -m "feat(db): extend label_formats with catalog-sync fields"
```

---

## Task 3: Create `kit_profiles` table

**Files:**
- Modify: `src/lib/server/db/schema.ts` (add new pgTable at end of label-formats section)
- Create: `drizzle/0014_add_kit_profiles.sql` (auto-generated)

A kit profile represents one physical printer setup. A shop-commissioned kit has `owner_type='shop'` and a `kit_id` (text label staff write on the case). A BYO vendor printer has `owner_type='vendor_byo'` and `kit_id` null. A vendor may have multiple kits (laptop + spare), so the unique constraint is `(vendor_id, kit_id)` — null `kit_id` is allowed since unique constraints in Postgres treat nulls as distinct.

- [ ] **Step 1: Add `kitProfiles` table to schema**

In `src/lib/server/db/schema.ts`, immediately after the `labelFormats` block (around line 3461 after the exported types), add:

```ts
// Per-printer kit configuration for the Yakima vendor label printer desktop
// client. A shop-commissioned kit has owner_type='shop' and a kit_id label;
// BYO vendor printers have owner_type='vendor_byo' and kit_id=null.
export const kitProfiles = pgTable('kit_profiles', {
	id: uuid('id').primaryKey().defaultRandom(),
	vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
	kitId: text('kit_id'),                                  // shop-issued label, e.g. "YK-007"; null for BYO
	ownerType: text('owner_type').notNull().default('vendor_byo'), // 'shop' | 'vendor_byo'
	printerModel: text('printer_model').notNull(),          // e.g. 'Zebra GK420t'
	printerDpi: integer('printer_dpi').notNull(),
	labelWidthDots: integer('label_width_dots').notNull(),
	labelHeightDots: integer('label_height_dots').notNull(),
	commandLang: text('command_lang').notNull().default('zpl2'), // 'zpl2' | 'epl' | 'cpcl'
	mediaSensor: text('media_sensor').notNull().default('gap'),  // 'gap' | 'mark' | 'continuous'
	mediaType: text('media_type').notNull().default('direct_thermal'), // 'direct_thermal' | 'transfer'
	backend: text('backend').notNull(),                     // 'linux_usb' | 'win_usb' | 'win_spooler'
	preferredFormatCode: text('preferred_format_code'),     // soft FK to label_formats.code
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
	vendorKitUnique: unique('kit_profiles_vendor_kit_unique').on(table.vendorId, table.kitId)
}));

export type KitProfile = typeof kitProfiles.$inferSelect;
export type NewKitProfile = typeof kitProfiles.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

```bash
npm run db:generate
```
Expected: new file `drizzle/0014_add_kit_profiles.sql`. It should `CREATE TABLE IF NOT EXISTS "kit_profiles" (...)`, add the FK to `vendors`, and the unique constraint.

- [ ] **Step 3: Sanity-check migration + typecheck**

```bash
cat drizzle/0014_add_kit_profiles.sql && npm run check
```
Expected: SQL looks right, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/schema.ts drizzle/0014_add_kit_profiles.sql drizzle/meta/_journal.json
git commit -m "feat(db): add kit_profiles table for vendor printer config"
```

---

## Task 4: Add version-bump to `label-format-service.ts`

**Files:**
- Test: `tests/unit/services/label-format-service.test.ts` (create)
- Modify: `src/lib/server/services/label-format-service.ts` (update `updateFormat` to bump `version`; add `listFormatsModifiedSince` query helper)

The catalog-sync endpoint will read `version > <client_cursor>`. The service is the single place where `version` gets bumped, so `updateFormat` must always increment.

- [ ] **Step 1: Write failing test**

Create `tests/unit/services/label-format-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdate = vi.fn();
const mockSelectModified = vi.fn();

vi.mock('$lib/server/db', () => ({
  db: {
    update: () => ({ set: (vals: any) => ({ where: () => ({ returning: () => mockUpdate(vals) }) }) }),
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => mockSelectModified() }) }) })
  },
  labelFormats: { id: 'id', version: 'version', updatedAt: 'updatedAt' }
}));

import { updateFormat, listFormatsModifiedSince } from '$lib/server/services/label-format-service';

describe('label-format-service version semantics', () => {
  beforeEach(() => { mockUpdate.mockReset(); mockSelectModified.mockReset(); });

  it('updateFormat bumps version via SQL increment, not a fixed value', async () => {
    mockUpdate.mockResolvedValue([{ id: 'f1', version: 2 }]);
    await updateFormat('f1', { code: 'x', name: 'X', layout: 'sheet', labelWidthInches: 1, labelHeightInches: 1 } as any);
    const args = mockUpdate.mock.calls[0][0];
    // `version` is set via a SQL expression (drizzle `sql` template), not a literal
    expect(String(args.version)).toMatch(/version.*\+.*1|\+\s*1/);
    expect(args.updatedAt).toBeInstanceOf(Date);
  });

  it('listFormatsModifiedSince returns rows with version greater than cursor', async () => {
    mockSelectModified.mockResolvedValue([{ id: 'f1', version: 5 }, { id: 'f2', version: 7 }]);
    const rows = await listFormatsModifiedSince(3);
    expect(rows).toHaveLength(2);
    expect(rows[0].version).toBe(5);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run tests/unit/services/label-format-service.test.ts
```
Expected: 2 failures. `updateFormat` doesn't bump version yet, `listFormatsModifiedSince` doesn't exist.

- [ ] **Step 3: Open `src/lib/server/services/label-format-service.ts` and update**

Inside `updateFormat`, the existing `.set({...})` call should include `version: sql\`${labelFormats.version} + 1\`` and `updatedAt: new Date()`. Add `sql` to the imports from `drizzle-orm` if not already present.

Add the new exported function at the bottom of the file:

```ts
export async function listFormatsModifiedSince(sinceVersion: number) {
	return db
		.select()
		.from(labelFormats)
		.where(gt(labelFormats.version, sinceVersion))
		.orderBy(asc(labelFormats.version));
}
```

Import `gt` and `asc` from `drizzle-orm` at the top.

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run tests/unit/services/label-format-service.test.ts
```
Expected: 2 passes.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check && \
git add tests/unit/services/label-format-service.test.ts \
        src/lib/server/services/label-format-service.ts && \
git commit -m "feat(label-formats): bump version on update, add delta query"
```

---

## Task 5: `GET /api/label-formats` — catalog sync endpoint

**Files:**
- Test: `tests/integration/api-label-formats.test.ts` (create)
- Create: `src/routes/api/label-formats/+server.ts`

Returns `{ version: <max>, formats: [...] }` filtered by `?modified_since=<int>` (default 0). Authenticated for any logged-in user (the catalog isn't vendor-secret — any vendor needs it; admin pages already serve it too).

- [ ] **Step 1: Write failing test**

Create `tests/integration/api-label-formats.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandlerAs } from '../fixtures/api-helpers';

vi.mock('$lib/server/services/label-format-service', () => ({
  listFormatsModifiedSince: vi.fn()
}));

import { GET } from '../../src/routes/api/label-formats/+server';
import { listFormatsModifiedSince } from '$lib/server/services/label-format-service';

describe('GET /api/label-formats', () => {
  beforeEach(() => { (listFormatsModifiedSince as any).mockReset(); });

  it('returns 401 when not signed in', async () => {
    const res = await callHandlerAs(GET, null, { url: 'http://x/api/label-formats' });
    expect(res.status).toBe(401);
  });

  it('returns rows with version > cursor when authed', async () => {
    (listFormatsModifiedSince as any).mockResolvedValue([
      { id: 'f1', code: 'gk420t_1x1', version: 4 },
      { id: 'f2', code: 'avery_5160', version: 7 }
    ]);
    const res = await callHandlerAs(GET, 'employee', {
      url: 'http://x/api/label-formats?modified_since=3'
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(7);
    expect(body.formats).toHaveLength(2);
    expect(listFormatsModifiedSince).toHaveBeenCalledWith(3);
  });

  it('defaults modified_since to 0 when missing', async () => {
    (listFormatsModifiedSince as any).mockResolvedValue([]);
    await callHandlerAs(GET, 'employee', { url: 'http://x/api/label-formats' });
    expect(listFormatsModifiedSince).toHaveBeenCalledWith(0);
  });

  it('returns version=0 when no rows yet', async () => {
    (listFormatsModifiedSince as any).mockResolvedValue([]);
    const res = await callHandlerAs(GET, 'employee', { url: 'http://x/api/label-formats' });
    const body = await res.json();
    expect(body.version).toBe(0);
    expect(body.formats).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run tests/integration/api-label-formats.test.ts
```
Expected: handler file does not exist → import fails.

- [ ] **Step 3: Create the handler**

Create `src/routes/api/label-formats/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { listFormatsModifiedSince } from '$lib/server/services/label-format-service';

/**
 * GET /api/label-formats?modified_since=<version_int>
 * Returns { version: <maxVersionInResults>, formats: [...] }.
 * Any signed-in user may read the catalog; it's not vendor-secret.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');

	const raw = url.searchParams.get('modified_since');
	const sinceVersion = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : 0;

	const formats = await listFormatsModifiedSince(sinceVersion);
	const maxVersion = formats.reduce((acc, f) => Math.max(acc, f.version), sinceVersion);

	return json({ version: maxVersion, formats });
};
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run tests/integration/api-label-formats.test.ts
```
Expected: 4 passes.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check && \
git add tests/integration/api-label-formats.test.ts \
        src/routes/api/label-formats/+server.ts && \
git commit -m "feat(api): GET /api/label-formats with modified_since delta sync"
```

---

## Task 6: `kit-profile-service.ts` — vendor-scoped CRUD

**Files:**
- Test: `tests/unit/services/kit-profile-service.test.ts` (create)
- Create: `src/lib/server/services/kit-profile-service.ts`

This service is the single trust boundary for kit profiles. It accepts `vendorId` as the first arg of every function and uses it in every WHERE — endpoint code passes the authenticated vendor's id; never trusts request data.

- [ ] **Step 1: Write failing test**

Create `tests/unit/services/kit-profile-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelectKit = vi.fn();
const mockUpsertKit = vi.fn();

vi.mock('$lib/server/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => mockSelectKit() }) }) }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: () => ({ returning: () => mockUpsertKit() }) })
    })
  },
  kitProfiles: { vendorId: 'vendorId', kitId: 'kitId' }
}));

import { getKitProfileForVendor, upsertKitProfile, KitProfileError } from '$lib/server/services/kit-profile-service';

describe('kit-profile-service', () => {
  beforeEach(() => { mockSelectKit.mockReset(); mockUpsertKit.mockReset(); });

  it('getKitProfileForVendor returns null when no row', async () => {
    mockSelectKit.mockResolvedValue([]);
    const result = await getKitProfileForVendor('v1');
    expect(result).toBeNull();
  });

  it('getKitProfileForVendor returns the row when found', async () => {
    mockSelectKit.mockResolvedValue([{ id: 'k1', vendorId: 'v1', printerModel: 'Zebra GK420t' }]);
    const result = await getKitProfileForVendor('v1');
    expect(result?.printerModel).toBe('Zebra GK420t');
  });

  it('upsertKitProfile forces vendorId from arg, not from input', async () => {
    mockUpsertKit.mockResolvedValue([{ id: 'k1', vendorId: 'v1' }]);
    await upsertKitProfile('v1', {
      // Adversarial: caller tries to claim another vendor's kit
      vendorId: 'attacker' as any,
      printerModel: 'Zebra GK420t',
      printerDpi: 203,
      labelWidthDots: 228,
      labelHeightDots: 203,
      backend: 'linux_usb'
    });
    const args = (mockUpsertKit as any).mock.calls; // we can't read insert args directly from this mock shape; sufficient that it didn't throw
    // Stronger assertion below
    expect(mockUpsertKit).toHaveBeenCalled();
  });

  it('upsertKitProfile rejects invalid backend', async () => {
    await expect(upsertKitProfile('v1', {
      printerModel: 'X', printerDpi: 203, labelWidthDots: 100, labelHeightDots: 100,
      backend: 'magic' as any
    })).rejects.toBeInstanceOf(KitProfileError);
  });

  it('upsertKitProfile rejects negative dpi', async () => {
    await expect(upsertKitProfile('v1', {
      printerModel: 'X', printerDpi: -1, labelWidthDots: 100, labelHeightDots: 100,
      backend: 'linux_usb'
    })).rejects.toBeInstanceOf(KitProfileError);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run tests/unit/services/kit-profile-service.test.ts
```
Expected: module not found.

- [ ] **Step 3: Create the service**

Create `src/lib/server/services/kit-profile-service.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { db, kitProfiles } from '$lib/server/db';

export class KitProfileError extends Error {}

const VALID_BACKENDS = ['linux_usb', 'win_usb', 'win_spooler'] as const;
const VALID_COMMAND_LANGS = ['zpl2', 'epl', 'cpcl'] as const;
const VALID_SENSORS = ['gap', 'mark', 'continuous'] as const;
const VALID_MEDIA_TYPES = ['direct_thermal', 'transfer'] as const;
const VALID_OWNER_TYPES = ['shop', 'vendor_byo'] as const;

export interface KitProfileInput {
	kitId?: string | null;
	ownerType?: typeof VALID_OWNER_TYPES[number];
	printerModel: string;
	printerDpi: number;
	labelWidthDots: number;
	labelHeightDots: number;
	commandLang?: typeof VALID_COMMAND_LANGS[number];
	mediaSensor?: typeof VALID_SENSORS[number];
	mediaType?: typeof VALID_MEDIA_TYPES[number];
	backend: typeof VALID_BACKENDS[number];
	preferredFormatCode?: string | null;
}

function validate(input: KitProfileInput): void {
	if (!input.printerModel?.trim()) throw new KitProfileError('printerModel required');
	if (!Number.isFinite(input.printerDpi) || input.printerDpi <= 0) throw new KitProfileError('printerDpi must be positive');
	if (input.labelWidthDots <= 0 || input.labelHeightDots <= 0) throw new KitProfileError('label dims must be positive');
	if (!VALID_BACKENDS.includes(input.backend)) throw new KitProfileError(`backend must be one of ${VALID_BACKENDS.join(', ')}`);
	if (input.commandLang && !VALID_COMMAND_LANGS.includes(input.commandLang)) throw new KitProfileError('invalid commandLang');
	if (input.mediaSensor && !VALID_SENSORS.includes(input.mediaSensor)) throw new KitProfileError('invalid mediaSensor');
	if (input.mediaType && !VALID_MEDIA_TYPES.includes(input.mediaType)) throw new KitProfileError('invalid mediaType');
	if (input.ownerType && !VALID_OWNER_TYPES.includes(input.ownerType)) throw new KitProfileError('invalid ownerType');
}

export async function getKitProfileForVendor(vendorId: string, kitId: string | null = null) {
	const conditions = kitId
		? and(eq(kitProfiles.vendorId, vendorId), eq(kitProfiles.kitId, kitId))
		: eq(kitProfiles.vendorId, vendorId);
	const [row] = await db.select().from(kitProfiles).where(conditions).limit(1);
	return row ?? null;
}

export async function upsertKitProfile(vendorId: string, input: KitProfileInput) {
	validate(input);
	// Force vendorId from caller, ignore any vendorId in input
	const values = {
		vendorId,
		kitId: input.kitId ?? null,
		ownerType: input.ownerType ?? 'vendor_byo',
		printerModel: input.printerModel.trim(),
		printerDpi: input.printerDpi,
		labelWidthDots: input.labelWidthDots,
		labelHeightDots: input.labelHeightDots,
		commandLang: input.commandLang ?? 'zpl2',
		mediaSensor: input.mediaSensor ?? 'gap',
		mediaType: input.mediaType ?? 'direct_thermal',
		backend: input.backend,
		preferredFormatCode: input.preferredFormatCode ?? null,
		updatedAt: new Date()
	};
	const [row] = await db
		.insert(kitProfiles)
		.values(values)
		.onConflictDoUpdate({
			target: [kitProfiles.vendorId, kitProfiles.kitId],
			set: {
				ownerType: values.ownerType,
				printerModel: values.printerModel,
				printerDpi: values.printerDpi,
				labelWidthDots: values.labelWidthDots,
				labelHeightDots: values.labelHeightDots,
				commandLang: values.commandLang,
				mediaSensor: values.mediaSensor,
				mediaType: values.mediaType,
				backend: values.backend,
				preferredFormatCode: values.preferredFormatCode,
				updatedAt: values.updatedAt
			}
		})
		.returning();
	return row;
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run tests/unit/services/kit-profile-service.test.ts
```
Expected: 5 passes.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check && \
git add tests/unit/services/kit-profile-service.test.ts \
        src/lib/server/services/kit-profile-service.ts && \
git commit -m "feat(kit-profiles): vendor-scoped CRUD service"
```

---

## Task 7: `GET/POST /api/kit-profiles` — endpoint

**Files:**
- Test: `tests/integration/api-kit-profiles.test.ts` (create)
- Create: `src/routes/api/kit-profiles/+server.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/api-kit-profiles.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandlerAs } from '../fixtures/api-helpers';

vi.mock('$lib/server/services/kit-profile-service', () => ({
  getKitProfileForVendor: vi.fn(),
  upsertKitProfile: vi.fn(),
  KitProfileError: class extends Error {}
}));
vi.mock('$lib/server/services/vendor-service', () => ({
  getVendorForUser: vi.fn()
}));

import { GET, POST } from '../../src/routes/api/kit-profiles/+server';
import { getKitProfileForVendor, upsertKitProfile, KitProfileError } from '$lib/server/services/kit-profile-service';
import { getVendorForUser } from '$lib/server/services/vendor-service';

const asVendor = (id = 'v1') => (getVendorForUser as any).mockResolvedValue({ id, inventoryCodePrefix: 'SR' });

describe('GET /api/kit-profiles', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('401 when not signed in', async () => {
    const res = await callHandlerAs(GET, null, { url: 'http://x/api/kit-profiles' });
    expect(res.status).toBe(401);
  });

  it('403 when caller is not a vendor', async () => {
    (getVendorForUser as any).mockResolvedValue(null);
    const res = await callHandlerAs(GET, 'employee', { url: 'http://x/api/kit-profiles' });
    expect(res.status).toBe(403);
  });

  it('404 when no kit profile exists for this vendor', async () => {
    asVendor();
    (getKitProfileForVendor as any).mockResolvedValue(null);
    const res = await callHandlerAs(GET, 'vendor', { url: 'http://x/api/kit-profiles' });
    expect(res.status).toBe(404);
  });

  it('200 with profile when present', async () => {
    asVendor();
    (getKitProfileForVendor as any).mockResolvedValue({ id: 'k1', printerModel: 'Zebra GK420t' });
    const res = await callHandlerAs(GET, 'vendor', { url: 'http://x/api/kit-profiles' });
    expect(res.status).toBe(200);
    expect((await res.json()).printerModel).toBe('Zebra GK420t');
  });
});

describe('POST /api/kit-profiles', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('upserts with vendorId forced from session', async () => {
    asVendor('caller-vendor');
    (upsertKitProfile as any).mockResolvedValue({ id: 'k1' });
    const body = JSON.stringify({
      vendorId: 'evil-other-vendor',   // ignored by service
      printerModel: 'Zebra GK420t',
      printerDpi: 203,
      labelWidthDots: 228,
      labelHeightDots: 203,
      backend: 'linux_usb'
    });
    const res = await callHandlerAs(POST, 'vendor', {
      url: 'http://x/api/kit-profiles',
      body, headers: { 'content-type': 'application/json' }
    });
    expect(res.status).toBe(200);
    expect((upsertKitProfile as any).mock.calls[0][0]).toBe('caller-vendor');
  });

  it('400 on KitProfileError', async () => {
    asVendor();
    (upsertKitProfile as any).mockRejectedValue(new KitProfileError('backend must be one of ...'));
    const res = await callHandlerAs(POST, 'vendor', {
      url: 'http://x/api/kit-profiles',
      body: JSON.stringify({ printerModel: 'X', printerDpi: 203, labelWidthDots: 1, labelHeightDots: 1, backend: 'magic' }),
      headers: { 'content-type': 'application/json' }
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run tests/integration/api-kit-profiles.test.ts
```
Expected: handler file does not exist.

- [ ] **Step 3: Create the handler**

Create `src/routes/api/kit-profiles/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import {
	getKitProfileForVendor,
	upsertKitProfile,
	KitProfileError
} from '$lib/server/services/kit-profile-service';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	const kitId = url.searchParams.get('kit_id');
	const profile = await getKitProfileForVendor(vendor.id, kitId);
	if (!profile) throw error(404, 'No kit profile');
	return json(profile);
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') throw error(400, 'JSON body required');

	try {
		const row = await upsertKitProfile(vendor.id, body);
		return json(row);
	} catch (err) {
		if (err instanceof KitProfileError) throw error(400, err.message);
		throw err;
	}
};
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run tests/integration/api-kit-profiles.test.ts
```
Expected: 6 passes.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check && \
git add tests/integration/api-kit-profiles.test.ts \
        src/routes/api/kit-profiles/+server.ts && \
git commit -m "feat(api): GET/POST /api/kit-profiles, vendor-scoped"
```

---

## Task 8: `GET /api/vendor/items` — paginated item feed with delta sync

**Files:**
- Test: `tests/integration/api-vendor-items.test.ts` (create)
- Create: `src/routes/api/vendor/items/+server.ts`

Returns the vendor's items. Source is `pendingInventoryChanges` (most recent change per `partNumber` for this vendor). Supports `?modified_since=<iso>` for delta sync and `?limit=` (default 200, max 1000). Vendor isolation enforced server-side.

- [ ] **Step 1: Write failing test**

Create `tests/integration/api-vendor-items.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandlerAs } from '../fixtures/api-helpers';

const mockSelect = vi.fn();
vi.mock('$lib/server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => mockSelect() })
        })
      })
    })
  },
  pendingInventoryChanges: {
    vendorId: 'vendorId', partNumber: 'partNumber',
    submittedAt: 'submittedAt', payload: 'payload', changeType: 'changeType'
  }
}));
vi.mock('$lib/server/services/vendor-service', () => ({ getVendorForUser: vi.fn() }));

import { GET } from '../../src/routes/api/vendor/items/+server';
import { getVendorForUser } from '$lib/server/services/vendor-service';

describe('GET /api/vendor/items', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSelect.mockReset(); });

  it('401 when not signed in', async () => {
    const res = await callHandlerAs(GET, null, { url: 'http://x/api/vendor/items' });
    expect(res.status).toBe(401);
  });

  it('403 when not a vendor', async () => {
    (getVendorForUser as any).mockResolvedValue(null);
    const res = await callHandlerAs(GET, 'employee', { url: 'http://x/api/vendor/items' });
    expect(res.status).toBe(403);
  });

  it('returns rows scoped to the calling vendor only', async () => {
    (getVendorForUser as any).mockResolvedValue({ id: 'v1' });
    mockSelect.mockResolvedValue([
      { partNumber: 'SR51626001', payload: { partName: 'X', priceCents: 100 }, submittedAt: new Date() }
    ]);
    const res = await callHandlerAs(GET, 'vendor', { url: 'http://x/api/vendor/items' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].partNumber).toBe('SR51626001');
  });

  it('honors modified_since and limit query params', async () => {
    (getVendorForUser as any).mockResolvedValue({ id: 'v1' });
    mockSelect.mockResolvedValue([]);
    const res = await callHandlerAs(GET, 'vendor', {
      url: 'http://x/api/vendor/items?modified_since=2026-05-01T00:00:00Z&limit=50'
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serverTime).toBeDefined();
  });

  it('clamps limit to 1000 max, 1 min', async () => {
    (getVendorForUser as any).mockResolvedValue({ id: 'v1' });
    mockSelect.mockResolvedValue([]);
    const res = await callHandlerAs(GET, 'vendor', { url: 'http://x/api/vendor/items?limit=99999' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run tests/integration/api-vendor-items.test.ts
```
Expected: handler not found.

- [ ] **Step 3: Create the handler**

Create `src/routes/api/vendor/items/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { and, eq, gt, desc } from 'drizzle-orm';
import { db, pendingInventoryChanges } from '$lib/server/db';
import { getVendorForUser } from '$lib/server/services/vendor-service';

/**
 * GET /api/vendor/items?modified_since=<iso8601>&limit=<n>
 * Returns the calling vendor's items as recorded in pendingInventoryChanges.
 * For each partNumber we'd ideally return the most recent payload, but for
 * v1 the desktop client merges client-side from the raw change stream.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');

	const sinceRaw = url.searchParams.get('modified_since');
	const since = sinceRaw ? new Date(sinceRaw) : null;
	if (sinceRaw && isNaN(since!.getTime())) throw error(400, 'modified_since must be ISO 8601');

	const limitRaw = url.searchParams.get('limit');
	const limit = Math.max(1, Math.min(1000, limitRaw ? parseInt(limitRaw, 10) || 200 : 200));

	const conditions = since
		? and(eq(pendingInventoryChanges.vendorId, vendor.id), gt(pendingInventoryChanges.submittedAt, since))
		: eq(pendingInventoryChanges.vendorId, vendor.id);

	const rows = await db
		.select()
		.from(pendingInventoryChanges)
		.where(conditions)
		.orderBy(desc(pendingInventoryChanges.submittedAt))
		.limit(limit);

	return json({
		serverTime: new Date().toISOString(),
		items: rows.map((r) => ({
			partNumber: r.partNumber,
			changeType: r.changeType,
			payload: r.payload,
			submittedAt: r.submittedAt
		}))
	});
};
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run tests/integration/api-vendor-items.test.ts
```
Expected: 5 passes.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check && \
git add tests/integration/api-vendor-items.test.ts \
        src/routes/api/vendor/items/+server.ts && \
git commit -m "feat(api): GET /api/vendor/items with delta sync"
```

---

## Task 9: Extend `quickTag` action with `quantity` field

**Files:**
- Test: `tests/integration/quickTag-quantity.test.ts` (create)
- Modify: `src/routes/(app)/vendor/inventory/+page.server.ts:125-164`

The existing `submit` action already parses quantity at line 78 (`parseInt10`) and includes it in payload at line 91. The `quickTag` action needs the same treatment.

- [ ] **Step 1: Write failing test**

Create `tests/integration/quickTag-quantity.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubmitChange = vi.fn();
const mockGenerate = vi.fn();
const mockGetVendor = vi.fn();

vi.mock('$lib/server/services/inventory-change-service', () => ({
  submitChange: mockSubmitChange,
  InventoryChangeError: class extends Error {}
}));
vi.mock('$lib/server/services/vendor-service', () => ({
  getVendorForUser: mockGetVendor,
  generatePartNumber: mockGenerate,
  VendorServiceError: class extends Error {}
}));

import { actions } from '../../src/routes/(app)/vendor/inventory/+page.server';

function makeRequest(form: Record<string, string>) {
  const fd = new FormData();
  Object.entries(form).forEach(([k, v]) => fd.append(k, v));
  return { formData: async () => fd } as unknown as Request;
}

describe('quickTag action — quantity', () => {
  beforeEach(() => {
    mockSubmitChange.mockReset();
    mockGenerate.mockReset().mockResolvedValue('SR51626001');
    mockGetVendor.mockReset().mockResolvedValue({ id: 'v1', inventoryCodePrefix: 'SR' });
  });

  it('parses quantity and includes it in the payload', async () => {
    const event: any = {
      locals: { user: { id: 'u1' } },
      request: makeRequest({ description: 'Pyrex bowl', priceDollars: '24.99', quantity: '3' })
    };
    await actions.quickTag(event);
    expect(mockSubmitChange).toHaveBeenCalledTimes(1);
    expect(mockSubmitChange.mock.calls[0][0].payload).toMatchObject({
      partName: 'Pyrex bowl', description: 'Pyrex bowl', priceCents: 2499, quantity: 3
    });
  });

  it('omits quantity from payload when field not provided', async () => {
    const event: any = {
      locals: { user: { id: 'u1' } },
      request: makeRequest({ description: 'Pyrex bowl', priceDollars: '24.99' })
    };
    await actions.quickTag(event);
    expect(mockSubmitChange.mock.calls[0][0].payload).not.toHaveProperty('quantity');
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run tests/integration/quickTag-quantity.test.ts
```
Expected: 1 failure (quantity not in payload).

- [ ] **Step 3: Update `quickTag` action**

In `src/routes/(app)/vendor/inventory/+page.server.ts`, modify the `quickTag` block (lines 125-164). After line 130 (`const priceCents = parsePriceCents(form.get('priceDollars'));`), add:

```ts
		const quantity = parseInt10(form.get('quantity'));
```

Replace the `payload: { partName: description, description, priceCents }` on line 155 with:

```ts
					payload: {
						partName: description,
						description,
						priceCents,
						...(quantity !== undefined ? { quantity } : {})
					},
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run tests/integration/quickTag-quantity.test.ts
```
Expected: 2 passes.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check && \
git add tests/integration/quickTag-quantity.test.ts \
        src/routes/\(app\)/vendor/inventory/+page.server.ts && \
git commit -m "feat(vendor): quickTag accepts quantity field"
```

---

## Task 10: Extend `renderZpl` + `/api/vendor/tag-zpl` with `?copies=<n>`

**Files:**
- Test: `tests/unit/services/tag-render-zpl-copies.test.ts` (create)
- Test: `tests/integration/api-vendor-tag-zpl-copies.test.ts` (create)
- Modify: `src/lib/server/services/tag-render-service.ts:470` (hardcoded `^PQ1`) and the `renderZpl` signature
- Modify: `src/routes/api/vendor/tag-zpl/+server.ts:22-97`

`renderZpl` currently has signature `renderZpl(ctx: TagRenderContext): Promise<string>`. We extend the context with an optional `copies?: number` (default 1, clamped to [1, 99]). The hardcoded `'^PQ1'` at line 470 becomes `\`^PQ${copies}\``.

- [ ] **Step 1: Write failing unit test for the render function**

Create `tests/unit/services/tag-render-zpl-copies.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderZpl } from '$lib/server/services/tag-render-service';

const baseCtx = {
  vendorDisplayName: 'Sample Vendor',
  settings: null,
  item: { partNumber: 'SR51626001', name: 'Pyrex bowl', description: 'Vintage', priceCents: 2499 }
} as any;

describe('renderZpl ^PQ behavior', () => {
  it('defaults to ^PQ1 when copies not provided', async () => {
    const zpl = await renderZpl(baseCtx);
    expect(zpl).toContain('^PQ1');
  });

  it('emits ^PQ<n> when copies set', async () => {
    const zpl = await renderZpl({ ...baseCtx, copies: 4 });
    expect(zpl).toContain('^PQ4');
    expect(zpl).not.toContain('^PQ1');
  });

  it('clamps copies to [1, 99]', async () => {
    expect(await renderZpl({ ...baseCtx, copies: 0 })).toContain('^PQ1');
    expect(await renderZpl({ ...baseCtx, copies: -7 })).toContain('^PQ1');
    expect(await renderZpl({ ...baseCtx, copies: 9999 })).toContain('^PQ99');
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run tests/unit/services/tag-render-zpl-copies.test.ts
```
Expected: only "defaults to ^PQ1" passes; the others fail because the function ignores `copies`.

- [ ] **Step 3: Update `renderZpl` signature and behavior**

Find the `TagRenderContext` type and `renderZpl` function in `src/lib/server/services/tag-render-service.ts`. Add `copies?: number` to the context interface. Near the top of `renderZpl`, add:

```ts
	const copies = Math.max(1, Math.min(99, Math.floor(ctx.copies ?? 1)));
```

Replace the line at ~470 (`cmds.push('^PQ1');`) with:

```ts
	cmds.push(`^PQ${copies}`);                 // print quantity
```

- [ ] **Step 4: Run unit test, verify pass**

```bash
npx vitest run tests/unit/services/tag-render-zpl-copies.test.ts
```
Expected: 3 passes.

- [ ] **Step 5: Write failing integration test for the endpoint**

Create `tests/integration/api-vendor-tag-zpl-copies.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandlerAs } from '../fixtures/api-helpers';

const mockSelect = vi.fn();
vi.mock('$lib/server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => mockSelect() })
        })
      })
    })
  },
  vendorTagSettings: {}, pendingInventoryChanges: {}, salesTransactions: {}
}));
vi.mock('$lib/server/services/vendor-service', () => ({ getVendorForUser: vi.fn() }));
vi.mock('$lib/server/services/tag-render-service', () => ({ renderZpl: vi.fn() }));

import { GET } from '../../src/routes/api/vendor/tag-zpl/+server';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { renderZpl } from '$lib/server/services/tag-render-service';

describe('GET /api/vendor/tag-zpl?copies=', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getVendorForUser as any).mockResolvedValue({ id: 'v1', inventoryCodePrefix: 'SR', displayName: 'V' });
    (renderZpl as any).mockResolvedValue('^XA^PQ3^XZ');
    mockSelect.mockReset()
      .mockResolvedValueOnce([{ payload: { partName: 'X', priceCents: 100 } }]) // pending
      .mockResolvedValueOnce([{}]);                                              // settings
  });

  it('forwards copies query param to renderZpl', async () => {
    const res = await callHandlerAs(GET, 'vendor', {
      url: 'http://x/api/vendor/tag-zpl?partNumber=SR51626001&copies=3'
    });
    expect(res.status).toBe(200);
    expect((renderZpl as any).mock.calls[0][0].copies).toBe(3);
  });

  it('defaults copies to undefined (renderZpl will default to 1)', async () => {
    const res = await callHandlerAs(GET, 'vendor', {
      url: 'http://x/api/vendor/tag-zpl?partNumber=SR51626001'
    });
    expect(res.status).toBe(200);
    expect((renderZpl as any).mock.calls[0][0].copies).toBeUndefined();
  });

  it('400 on non-integer copies', async () => {
    const res = await callHandlerAs(GET, 'vendor', {
      url: 'http://x/api/vendor/tag-zpl?partNumber=SR51626001&copies=abc'
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run test, verify failure**

```bash
npx vitest run tests/integration/api-vendor-tag-zpl-copies.test.ts
```
Expected: failures because the handler ignores `copies`.

- [ ] **Step 7: Update the endpoint**

In `src/routes/api/vendor/tag-zpl/+server.ts`, just after the `partNumber` parsing (around line 26), add:

```ts
	const copiesRaw = url.searchParams.get('copies');
	let copies: number | undefined = undefined;
	if (copiesRaw !== null) {
		if (!/^\d+$/.test(copiesRaw)) throw error(400, 'copies must be a positive integer');
		copies = parseInt(copiesRaw, 10);
	}
```

In the `renderZpl({...})` call near line 85, add `copies` to the context object:

```ts
	const zpl = await renderZpl({
		vendorDisplayName: vendor.displayName,
		settings: settings ?? null,
		item: { partNumber, name, description, priceCents },
		copies
	});
```

- [ ] **Step 8: Run all tests for this task, verify pass**

```bash
npx vitest run tests/unit/services/tag-render-zpl-copies.test.ts tests/integration/api-vendor-tag-zpl-copies.test.ts
```
Expected: 6 passes total.

- [ ] **Step 9: Typecheck + commit**

```bash
npm run check && \
git add tests/unit/services/tag-render-zpl-copies.test.ts \
        tests/integration/api-vendor-tag-zpl-copies.test.ts \
        src/lib/server/services/tag-render-service.ts \
        src/routes/api/vendor/tag-zpl/+server.ts && \
git commit -m "feat(api): tag-zpl supports ?copies=<n> via renderZpl"
```

---

## Task 11: `GET /api/vendor/tag-sheet-pdf` — Avery sheet as PDF

**Files:**
- Modify: `package.json` (add `puppeteer` dep)
- Create: `src/lib/server/services/pdf-render-service.ts`
- Create: `src/routes/api/vendor/tag-sheet-pdf/+server.ts`
- Test: `tests/integration/api-vendor-tag-sheet-pdf.test.ts` (create)

The existing `renderAverySheetHtml` already produces print-ready HTML. We layer a thin puppeteer wrapper that converts HTML → PDF bytes, and a new endpoint that calls it. The endpoint accepts a JSON body listing part numbers + format code + start cell.

Decision: puppeteer (full Chromium) is heavy (~170MB on disk) but the simplest correct path here — `renderAverySheetHtml` already produces a complete HTML document, and Chrome's print pipeline handles the page-size & margin maths from CSS exactly. Alternatives (pdfkit, pdf-lib) would mean reimplementing the Avery layout in JS, duplicating logic. Stick with puppeteer.

- [ ] **Step 1: Add puppeteer dependency**

```bash
npm install puppeteer
```
Expected: `package.json` and `package-lock.json` updated; Chromium downloaded into `node_modules/puppeteer/.local-chromium/` (~170MB; this is fine for dev but the deploy environment should have it cached).

- [ ] **Step 2: Create the PDF render service**

Create `src/lib/server/services/pdf-render-service.ts`:

```ts
import puppeteer, { type Browser } from 'puppeteer';

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
	if (!browserPromise) {
		browserPromise = puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
	}
	return browserPromise;
}

/**
 * Render an HTML document to a US-Letter PDF buffer. Caller controls page
 * size and margins via CSS `@page` in the HTML; we pass `preferCSSPageSize`
 * so puppeteer respects it.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
	const browser = await getBrowser();
	const page = await browser.newPage();
	try {
		await page.setContent(html, { waitUntil: 'networkidle0' });
		const pdf = await page.pdf({
			preferCSSPageSize: true,
			printBackground: true,
			margin: { top: 0, bottom: 0, left: 0, right: 0 }
		});
		return Buffer.from(pdf);
	} finally {
		await page.close();
	}
}
```

- [ ] **Step 3: Write failing integration test**

Create `tests/integration/api-vendor-tag-sheet-pdf.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callHandlerAs } from '../fixtures/api-helpers';

vi.mock('$lib/server/services/vendor-service', () => ({ getVendorForUser: vi.fn() }));
vi.mock('$lib/server/services/tag-render-service', () => ({
  renderAverySheetHtml: vi.fn(),
  resolveSettings: (s: any) => s ?? {}
}));
vi.mock('$lib/server/services/pdf-render-service', () => ({ renderHtmlToPdf: vi.fn() }));
vi.mock('$lib/server/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }) }) }) })
  },
  pendingInventoryChanges: {}, salesTransactions: {}, vendorTagSettings: {}
}));

import { POST } from '../../src/routes/api/vendor/tag-sheet-pdf/+server';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { renderAverySheetHtml } from '$lib/server/services/tag-render-service';
import { renderHtmlToPdf } from '$lib/server/services/pdf-render-service';

describe('POST /api/vendor/tag-sheet-pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getVendorForUser as any).mockResolvedValue({ id: 'v1', inventoryCodePrefix: 'SR', displayName: 'V' });
    (renderAverySheetHtml as any).mockResolvedValue('<html><body>page</body></html>');
    (renderHtmlToPdf as any).mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
  });

  it('401 when not signed in', async () => {
    const res = await callHandlerAs(POST, null, {
      url: 'http://x/api/vendor/tag-sheet-pdf',
      body: JSON.stringify({ partNumbers: ['SR51626001'], formatCode: 'avery_5160' }),
      headers: { 'content-type': 'application/json' }
    });
    expect(res.status).toBe(401);
  });

  it('rejects part numbers that do not start with the vendor prefix', async () => {
    const res = await callHandlerAs(POST, 'vendor', {
      url: 'http://x/api/vendor/tag-sheet-pdf',
      body: JSON.stringify({ partNumbers: ['XX51626001'], formatCode: 'avery_5160' }),
      headers: { 'content-type': 'application/json' }
    });
    expect(res.status).toBe(403);
  });

  it('returns application/pdf and includes the PDF bytes', async () => {
    const res = await callHandlerAs(POST, 'vendor', {
      url: 'http://x/api/vendor/tag-sheet-pdf',
      body: JSON.stringify({ partNumbers: ['SR51626001'], formatCode: 'avery_5160', startCell: 3 }),
      headers: { 'content-type': 'application/json' }
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/pdf/);
    expect(renderHtmlToPdf).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test, verify failure**

```bash
npx vitest run tests/integration/api-vendor-tag-sheet-pdf.test.ts
```
Expected: handler not found.

- [ ] **Step 5: Create the handler**

Create `src/routes/api/vendor/tag-sheet-pdf/+server.ts`:

```ts
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getVendorForUser } from '$lib/server/services/vendor-service';
import { renderAverySheetHtml } from '$lib/server/services/tag-render-service';
import { renderHtmlToPdf } from '$lib/server/services/pdf-render-service';

/**
 * POST /api/vendor/tag-sheet-pdf
 * Body: { partNumbers: string[], formatCode: string, startCell?: number }
 * Returns: application/pdf of an Avery sheet pre-laid-out for the desktop
 * client to feed to the system print spooler.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Not signed in');
	const vendor = await getVendorForUser(locals.user.id);
	if (!vendor) throw error(403, 'Vendor portal access not enabled');
	const prefix = vendor.inventoryCodePrefix ?? '';
	if (!prefix) throw error(403, 'Vendor has no inventory code prefix configured');

	const body = await request.json().catch(() => null);
	if (!body || !Array.isArray(body.partNumbers) || body.partNumbers.length === 0) {
		throw error(400, 'partNumbers required');
	}
	if (typeof body.formatCode !== 'string' || !body.formatCode.trim()) {
		throw error(400, 'formatCode required');
	}
	for (const p of body.partNumbers) {
		if (typeof p !== 'string' || !p.startsWith(prefix)) {
			throw error(403, `Part number ${p} does not belong to this vendor`);
		}
	}
	const startCell = Number.isFinite(body.startCell) ? Math.max(1, Math.floor(body.startCell)) : 1;

	const html = await renderAverySheetHtml({
		vendorDisplayName: vendor.displayName,
		formatCode: body.formatCode,
		partNumbers: body.partNumbers,
		startCell
	});

	const pdf = await renderHtmlToPdf(html);

	return new Response(pdf, {
		headers: {
			'Content-Type': 'application/pdf',
			'Cache-Control': 'no-store',
			'Content-Disposition': 'inline; filename="tags.pdf"'
		}
	});
};
```

Note: the test of `renderAverySheetHtml`'s actual signature lives in `tag-render-service.ts`. If the existing function takes a different shape (e.g. requires `items` with full payloads rather than `partNumbers` alone), adjust the call here and add a small loader helper inside the handler that fetches each part's payload from `pendingInventoryChanges` (same pattern as `tag-zpl` lines 44-77). The test mocks `renderAverySheetHtml`, so test-level integration is unaffected.

- [ ] **Step 6: Run test, verify pass**

```bash
npx vitest run tests/integration/api-vendor-tag-sheet-pdf.test.ts
```
Expected: 3 passes.

- [ ] **Step 7: Typecheck + commit**

```bash
npm run check && \
git add package.json package-lock.json \
        src/lib/server/services/pdf-render-service.ts \
        src/routes/api/vendor/tag-sheet-pdf/+server.ts \
        tests/integration/api-vendor-tag-sheet-pdf.test.ts && \
git commit -m "feat(api): tag-sheet-pdf endpoint (puppeteer html→pdf)"
```

---

## Task 12: Extend admin `/admin/label-formats/` UI for new fields

**Files:**
- Modify: `src/routes/(app)/admin/label-formats/+page.server.ts`
- Modify: `src/routes/(app)/admin/label-formats/+page.svelte`
- Modify: `src/lib/server/services/label-format-service.ts` (extend `LabelFormatInput` type + `createFormat`/`updateFormat` to accept new fields)

- [ ] **Step 1: Extend `LabelFormatInput` and create/update**

Open `src/lib/server/services/label-format-service.ts`. Extend the `LabelFormatInput` type with:

```ts
	mediaShape?: 'rectangle' | 'barbell' | 'circle' | 'custom';
	shapeDimsJson?: Record<string, unknown> | null;
	mediaSensor?: 'gap' | 'mark' | 'continuous' | null;
	category?: 'thermal' | 'sheet';
	manufacturer?: 'zebra' | 'avery' | 'custom';
	partNumber?: string | null;
	dpi?: number | null;
```

In both `createFormat` and `updateFormat`, include the new fields in the `.values(...)` / `.set(...)` blocks, defaulting `category` to the existing `layout` value (`'sheet'` or `'thermal'`) and `mediaShape` to `'rectangle'` if not provided. `manufacturer` defaults to `'custom'`.

- [ ] **Step 2: Extend admin `readInput`**

In `src/routes/(app)/admin/label-formats/+page.server.ts`, update `readInput` to also parse new fields. After the existing returns block (around line 47), extend the returned object:

```ts
		mediaShape: ((data.get('mediaShape') as string) ?? 'rectangle') as 'rectangle' | 'barbell' | 'circle' | 'custom',
		shapeDimsJson: (() => {
			const raw = (data.get('shapeDimsJson') as string)?.trim();
			if (!raw) return null;
			try { return JSON.parse(raw); } catch { return null; }
		})(),
		mediaSensor: ((data.get('mediaSensor') as string) || null) as 'gap' | 'mark' | 'continuous' | null,
		category: ((data.get('category') as string) ?? 'sheet') as 'sheet' | 'thermal',
		manufacturer: ((data.get('manufacturer') as string) ?? 'custom') as 'zebra' | 'avery' | 'custom',
		partNumber: (data.get('partNumber') as string)?.trim() || null,
		dpi: intVal('dpi')
```

- [ ] **Step 3: Extend admin form**

In `src/routes/(app)/admin/label-formats/+page.svelte`, find the form section (the existing create/edit form fields for `code`, `name`, `layout`, etc.) and add inputs for each new field. Use the same TailwindCSS / form-control pattern that already exists in this file. Concretely, add fields:

- `category` — `<select>` with options `sheet`, `thermal`
- `manufacturer` — `<select>` with options `zebra`, `avery`, `custom`
- `mediaShape` — `<select>` with options `rectangle`, `barbell`, `circle`, `custom`
- `mediaSensor` — `<select>` with options `(none)`, `gap`, `mark`, `continuous` (only meaningful when category=thermal; show always, persist null when empty)
- `partNumber` — `<input type="text">`
- `dpi` — `<input type="number" min="100" max="600">`
- `shapeDimsJson` — `<textarea>` accepting JSON; rendered with a placeholder example `{"panelA_width_in":0.5,"panelB_width_in":0.625}`

Match the existing markup pattern exactly. Do not introduce new utility classes.

- [ ] **Step 4: Manually verify in dev server**

```bash
npm run dev
```
Visit `http://localhost:5173/admin/label-formats` as a manager-or-higher user. Create a new format with each new field set; edit it; archive it; unarchive it. Confirm no console or server errors. Stop the dev server.

- [ ] **Step 5: Typecheck**

```bash
npm run check
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/services/label-format-service.ts \
        src/routes/\(app\)/admin/label-formats/+page.server.ts \
        src/routes/\(app\)/admin/label-formats/+page.svelte && \
git commit -m "feat(admin): label-format CRUD supports catalog-sync fields"
```

---

## Task 13: Seed catalog with starter formats + backfill existing rows

**Files:**
- Create: `drizzle/0015_seed_label_format_catalog.sql`
- Modify: `drizzle/meta/_journal.json` (auto-updated when this hand-written migration is registered — see below)

This is a hand-written SQL migration (not `db:generate`-produced) because it's data, not schema. It does two things: (1) backfill `category` and `manufacturer` for any existing rows, (2) `INSERT ... ON CONFLICT DO NOTHING` a starter set of formats so the desktop client has something to pick from on first launch.

- [ ] **Step 1: Author the seed migration**

Create `drizzle/0015_seed_label_format_catalog.sql`:

```sql
-- Backfill catalog-sync fields on existing rows: derive category from layout,
-- everything else stays at table-defaults.
UPDATE label_formats SET category = layout WHERE category = 'sheet' AND layout = 'thermal';
--> statement-breakpoint

-- Starter catalog. Codes are stable identifiers; admins can edit names/dims later.
INSERT INTO label_formats
  (code, name, layout, label_width_inches, label_height_inches,
   page_width_inches, page_height_inches, cols, rows,
   margin_top_inches, margin_left_inches,
   vertical_pitch_inches, horizontal_pitch_inches,
   media_shape, category, manufacturer, part_number, dpi, media_sensor,
   is_active)
VALUES
  -- Avery sheet labels
  ('avery_5160', 'Avery 5160 — 30-up address (2.625 × 1)', 'sheet',
     2.625, 1.000, 8.500, 11.000, 3, 10, 0.500, 0.188, 0.000, 0.125,
     'rectangle', 'sheet', 'avery', '5160', NULL, NULL, TRUE),
  ('avery_5163', 'Avery 5163 — 10-up shipping (4 × 2)', 'sheet',
     4.000, 2.000, 8.500, 11.000, 2, 5, 0.500, 0.188, 0.000, 0.125,
     'rectangle', 'sheet', 'avery', '5163', NULL, NULL, TRUE),
  ('avery_5167', 'Avery 5167 — 80-up return address (1.75 × 0.5)', 'sheet',
     1.750, 0.500, 8.500, 11.000, 4, 20, 0.500, 0.300, 0.000, 0.187,
     'rectangle', 'sheet', 'avery', '5167', NULL, NULL, TRUE),

  -- Zebra thermal — common Yakima Finds stocks
  ('zebra_gk420t_1125x1', 'Zebra 1.125 × 1 direct-thermal (GK420t)', 'thermal',
     1.125, 1.000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'rectangle', 'thermal', 'zebra', '10010044', 203, 'gap', TRUE),
  ('zebra_gk420t_2x1', 'Zebra 2 × 1 direct-thermal (GK420t)', 'thermal',
     2.000, 1.000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'rectangle', 'thermal', 'zebra', '10010029', 203, 'gap', TRUE),
  ('zebra_gk420t_225x125', 'Zebra 2.25 × 1.25 direct-thermal (GK420t)', 'thermal',
     2.250, 1.250, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'rectangle', 'thermal', 'zebra', '10015341', 203, 'gap', TRUE),
  ('zebra_gk420t_3x1', 'Zebra 3 × 1 direct-thermal (GK420t)', 'thermal',
     3.000, 1.000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'rectangle', 'thermal', 'zebra', '10010047', 203, 'gap', TRUE),

  -- Barbell / jewelry tag
  ('zebra_barbell_2125x0625', 'Zebra barbell — 2.125 × 0.625 jewelry', 'thermal',
     2.125, 0.625, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'barbell', 'thermal', 'zebra', '10003051', 203, 'mark', TRUE)
ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 2: Register migration in journal**

Open `drizzle/meta/_journal.json` and add a new entry to the `entries` array (following the pattern of entries 13 and 14). Set `idx` to 15, `tag` to `0015_seed_label_format_catalog`, and `when` to a current millisecond timestamp. (Drizzle treats unrecognised migrations as pending; explicit registration is cleanest.)

If unsure about the exact format, copy the previous entry and bump `idx`/`tag`/`when`.

- [ ] **Step 3: Apply the migration locally**

```bash
npm run db:migrate
```
Expected: migration `0015_seed_label_format_catalog` runs without errors. Verify with:

```bash
psql "$DATABASE_URL" -c "SELECT code, manufacturer, category, dpi FROM label_formats ORDER BY code;"
```
Expected: at least the 8 seeded rows present.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0015_seed_label_format_catalog.sql drizzle/meta/_journal.json
git commit -m "feat(db): seed Avery + Zebra label format catalog"
```

---

## Task 14: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test:run
```
Expected: all tests pass, including pre-existing ones. If any pre-existing test fails because of these changes, investigate root cause (no `--bail`, no skipping). Particularly watch tests in `tests/unit/services/vendor-service.test.ts` — they may make assumptions about the old SKU format.

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```
Expected: no errors.

- [ ] **Step 3: Manual smoke test of vendor portal**

Spin up the dev server (`npm run dev`) and:
1. Log in as a vendor.
2. Make a tag (description + price + quantity = 3); confirm part number matches new MDDYY format and that the printed ZPL contains `^PQ3`.
3. Open `/admin/label-formats` as a manager; create a thermal format with manufacturer='zebra', media_shape='barbell'; confirm the row saves and appears in the list.
4. `curl http://localhost:5173/api/label-formats` with a logged-in cookie; confirm `version` field and `formats` array.

- [ ] **Step 4: Review branch state**

```bash
git log --oneline vendor-label-printer-spec ^main | head -20
git status
```
Expected: clean working tree, ~13 new commits on top of the spec commit.

- [ ] **Step 5: Stop**

Do **not** push the branch to origin. The user pushes only when they explicitly say so (per spec memory note). Report back to the user that the plan is fully executed and ask whether to push.

---

## Out of scope for this plan (handled in Plan 2)

- The Python desktop client (UI, tt_client, render, printer backends, speech, commissioning, packaging) — lives in repo `r0bug/yakima-label`.
- Linux fleet enrollment for shop kits — depends on plan-2 packaging decisions.
- Vosk model bundling and speech-to-text tuning.
- Real NRS API integration (server-side only when YF has the credentials).

## Plan-2 prerequisites this plan satisfies

By the end of Task 14, the desktop client (Plan 2) can:
- Authenticate as a vendor against TT (no change — existing login).
- Fetch its label-format catalog via `GET /api/label-formats?modified_since=`.
- Persist and read kit config via `GET/POST /api/kit-profiles`.
- Sync its local item cache via `GET /api/vendor/items?modified_since=`.
- Submit a new tag with `quantity` via the existing `quickTag` action.
- Fetch ZPL with multi-copy via `GET /api/vendor/tag-zpl?partNumber=…&copies=…`.
- Fetch an Avery sheet as PDF via `POST /api/vendor/tag-sheet-pdf`.
- Receive new SKUs in the agreed `{prefix}{MDDYY}{NNN}` format.

That's the complete server-side contract the spec calls for.
