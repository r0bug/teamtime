# Label Format Designer — Design Spec

**Date:** 2026-06-23
**Status:** Design approved (pending written-spec review)
**Repo location:** `tools/label-designer/` in `r0bug/teamtime`

## 1. Problem & Goal

Adding or tuning a `label_formats` row today means hand-writing SQL or editing
the admin CRUD with no visual feedback, then deploying/printing to discover the
result. Recent pain: a barbell barcode on the fold, content "pushed right"
because no matching format width existed, and a too-small vendor name — each
found only after a real print.

**Goal:** a small local web tool, run on a fleet box, that lets an operator
design a label format with a **live preview using TeamTime's real renderer**,
**test-print to a real Zebra** (including an alignment border to verify the
printable area), and when satisfied **write the format directly to the database**
through TeamTime's existing validated service.

## 2. Scope

**In scope (v1):**
- Rectangle thermal + sheet formats (all `label_formats` fields).
- **Barbell** formats: `media_shape='barbell'` with a `shape_dims_json` pad
  editor (per-pad role/xIn/widthIn, barcode pad `barcodeHeightIn`).
- Live SVG preview via the production renderer.
- Test print to a network Zebra (raw TCP 9100): **alignment border** mode and
  **sample label** mode.
- Load / clone / edit existing formats.
- Save (create or update) via `label-format-service` against a configured DB,
  with an SSH tunnel for localhost-bound prod Postgres.

**Out of scope (later):** circle/custom shapes beyond barbell; multi-up sheet
PDF preview/print; auth/multi-user (tool is single-operator, localhost-bound);
packaging as a binary.

## 3. Architecture

A tool directory `tools/label-designer/` **inside the TeamTime repo**, started
with `npm run label-designer` on any box that has the repo, Node, and a reachable
`DATABASE_URL`. It runs a tiny HTTP server bound to `127.0.0.1` that serves a
single-page browser UI and a few JSON endpoints.

It is launched with **`vite-node`** using the project's existing Vite config, so
TeamTime's `$lib` aliases and `$env/static/private` virtual modules resolve.
This lets the tool **import TeamTime's own modules in-process**:

- `src/lib/server/services/tag-render-service.ts` — preview + ZPL (the real
  renderer; what you see is what prints).
- `src/lib/server/services/label-format-service.ts` — `createFormat`,
  `updateFormat`, `listFormats`, `getFormatByCode` (validation + dup-code check).
- `src/lib/server/db` — the Drizzle client (reads `DATABASE_URL`).

No reimplementation of rendering or validation → no drift from production.

### Why in-repo + vite-node
The alternatives — a standalone app that reimplements rendering, or one that
copies the schema — both drift from production the moment `renderZpl` changes.
Importing the real modules is the whole point. The cost is launching under
`vite-node` so SvelteKit virtual modules resolve. **Plan-phase risk to verify:**
`$env/static/private` resolution under `vite-node`; fallback is a thin db
bootstrap reading `process.env.DATABASE_URL` if the virtual module is unavailable
outside the Kit build.

## 4. Enabling refactor (production code)

`renderZpl(ctx)` and `renderTagSvg(ctx)` currently resolve dimensions from the DB
by format **code** (`getFormatDimensions`). The designer must preview a format
that **isn't saved yet**, so we split resolution from rendering:

- Extract `renderZplFromDimensions(dims: TagDimensions, ctx)` and
  `renderTagSvgFromDimensions(dims, ctx)` — pure, take explicit dimensions.
- `renderZpl`/`renderTagSvg` keep their existing signatures: resolve dims via
  `getFormatDimensions`, then delegate to the `*FromDimensions` variants.

Low-risk, independently testable, **production behavior unchanged** (existing
`tag-render-*` tests must stay green). The designer calls the `*FromDimensions`
variants with dimensions built from the form — no DB round-trip for preview.

## 5. Components & data flow

**Browser UI** (single page, no framework needed):
- Left: form — `code`, `name`, `layout` (thermal/sheet), `dpi`, width/height;
  sheet fields (page W/H, cols, rows, margins, pitches) shown only for sheet;
  `media_shape` (rectangle/barbell) with a **pad editor** for barbell
  (rows of role/xIn/widthIn, + `barcodeHeightIn` on the barcode pad);
  `media_sensor`, `manufacturer`, `part_number`; sample data (vendor name,
  price, SKU, description) and font scale for the preview.
- Right: **live SVG preview**, re-rendered on every change (debounced).
- A prominent banner showing **which DB the tool is pointed at** (host/name).
- Test-print panel: mode toggle **Alignment border ↔ Sample label**, printer
  host:port, "Test print" button.
- "Save to DB" (create or update) with a confirm dialog naming the target DB.

**Server endpoints** (all localhost):
- `POST /api/preview` → body = form state → build `TagDimensions` →
  `renderTagSvgFromDimensions` → `{ svg }`.
- `POST /api/test-print` → body = form state + mode + printer →
  `renderZplFromDimensions` (sample) or `buildAlignmentBorderZpl` (border) →
  raw TCP 9100 send → `{ ok }` or `{ error }`.
- `POST /api/save` → map form → `LabelFormatInput` → `createFormat` or
  `updateFormat` (if code exists) → `{ saved }` or validation error.
- `GET /api/formats` → `listFormats({ includeInactive: true })` for load/clone.

### Form → model mapping
The form maps directly onto `LabelFormatInput` (`label-format-service`) for saves
and onto `TagDimensions` (`{ widthInches, heightInches, mediaShape, shapeDims }`)
for previews. A single `formStateToInput()` / `formStateToDimensions()` pair owns
this mapping and is unit-tested.

## 6. Alignment border (first-class test print)

Before designing content, the operator prints a frame around the printable area
to confirm the format dimensions match the physical label. `buildAlignmentBorderZpl(dims, dpi)`:

```
^XA
^PW{w} ^LL{l}
^FO0,0 ^GB{w},{l},2^FS            ; full-area border
^FO{w/2},0 ^GB1,{l},1^FS           ; vertical center line
^FO0,{l/2} ^GB{w},1,1^FS           ; horizontal center line
^FO6,6 ^A0N,18,18 ^FD{w}x{l}@{dpi}^FS  ; prints the pixel dims
^XZ
```

Aligned → the border sits just inside all four edges; clipped/offset → adjust
width/height/dpi and reprint until correct, then switch to **Sample label** mode
to design content on a known-good area. For barbell, an optional variant also
draws each pad's box from `shape_dims_json` so pad/neck placement is verifiable.

## 7. Database write path

Saves go through `createFormat`/`updateFormat` against `DATABASE_URL`. Because
**prod Postgres binds `127.0.0.1` only** (verified 2026-06-23 — unreachable from
other fleet boxes over the overlay), writing to prod from lappy/hairydel uses an
**SSH tunnel**:

```
ssh -fN -L 6432:localhost:5432 backoffice
DATABASE_URL=postgres://teamtime:…@localhost:6432/teamtime npm run label-designer
```

The launch script can open this tunnel automatically (robug has passwordless SSH
to backoffice) and tear it down on exit. No change to Postgres exposure. Pointing
`DATABASE_URL` at the dev DB (robug-hosting-box) is the same flow for a dev-first
workflow.

## 8. Safety

- Server binds `127.0.0.1` only; no auth needed (single operator).
- The UI always shows the **resolved DB host/name**; Save requires a confirm that
  names that target — guards against writing prod when you meant dev.
- All writes go through `label-format-service` validation (code charset/length,
  layout/sheet field requirements, dimensions > 0, dup-code → update path).
- Save is create-or-update by `code`; no deletes from this tool in v1.

## 9. Error handling

- Preview/render errors → shown inline in the preview pane, never crash the server.
- Test print: connection refused / timeout to the printer → clear message with the
  host:port tried (mirrors `bbprint` behavior).
- Save: validation errors surfaced verbatim from `LabelFormatError`; DB/tunnel
  failures reported with the target host.

## 10. Testing strategy (TDD)

- **Refactor:** `renderZplFromDimensions` / `renderTagSvgFromDimensions` — assert
  identical output to current `renderZpl`/`renderTagSvg` for representative
  formats; all existing `tag-render-*` tests stay green.
- **Mapper:** `formStateToInput` / `formStateToDimensions` — field coverage incl.
  barbell `shape_dims_json` and sheet fields.
- **Alignment border:** `buildAlignmentBorderZpl` emits `^PW/^LL/^GB` matching
  dims; barbell variant draws per-pad boxes.
- **Endpoints:** thin integration tests — `/preview` returns SVG; `/test-print`
  writes ZPL to a mock socket; `/save` create+update against a throwaway DB.

## 11. Run & config

```
# in the teamtime repo on a fleet box
npm run label-designer            # starts tunnel (if configured) + server on 127.0.0.1:<port>
# env: DATABASE_URL (target), LABEL_DESIGNER_PRINTER (default host:port),
#      LABEL_DESIGNER_TUNNEL (ssh host, optional)
```

Open the printed `http://127.0.0.1:<port>` in a browser.

## 12. Open questions / future workflows

The operator has more workflow requests coming; capture them here before plan:
- (named so far) Alignment-border test print — included §6.
- Candidate future: print-origin/offset nudge (`^LH`) for printers that need it;
  multi-up sheet test print; saving in-progress drafts; duplicating a format to a
  new size; bulk export/import of the catalog.
