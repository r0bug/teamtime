# Yakima Finds Vendor Label Printer — Design

Date: 2026-05-16
Status: Draft, pending review

## Problem

Yakima Finds wants vendors to be able to add inventory and print Zebra labels from home. A laptop + Zebra printer kit gets checked out to a vendor; the vendor enters items, gets server-generated SKUs, and prints labels for them. The items land in TeamTime's existing inventory-change queue and are pushed to NRS (currently a manual staff-driven CSV import; eventually a TT-side NRS API call once Yakima Finds has that access).

TeamTime already has a web-based vendor portal that does most of this, but its print path depends on Zebra Browser Print (a tray app that talks to the printer via localhost HTTP). Browser Print is unreliable in practice — vendors hit install failures, default-printer issues, and CORS edge cases. This project replaces the print path with a native cross-platform Python desktop app that bypasses Browser Print and talks to the printer directly.

## Scope

This spec covers a single end-to-end project:

- A Python desktop app (Linux + Windows) for vendor use.
- TT-side server additions to support the desktop client (label-format catalog API, kit-profile API, item-list API, extended quickTag).
- A small set of TT schema changes (extending `label_formats`, new `kit_profiles` table, updated `generatePartNumber` format).

Out of scope:
- macOS client (defer to v2).
- Direct NRS API integration from the desktop app — the desktop app never talks to NRS. When TT gains real NRS API access, the change happens server-side; the desktop app sees no API change.
- Replacing TT's existing web vendor portal — it stays. The desktop app is a parallel client for the make-a-tag / reprint workflows that benefit from native USB printing.

## Constraints and decisions already made

These were settled during brainstorming and shouldn't be re-litigated without a fresh discussion:

1. **Online-only** — the desktop app requires a live TT connection to submit items, fetch ZPL, and sync catalog. Offline operation is limited to reprinting cached items.
2. **Reuse TT endpoints; bypass Browser Print only.** The desktop app authenticates as a vendor against TT, calls existing endpoints (`quickTag`, `tag-zpl`, `tag-sheet`) plus a few new ones, and prints by talking USB directly to the Zebra.
3. **SKU format: `{prefix}{MDDYY}{NNN}`** (e.g. `SR51626001`). Replaces the current `{prefix}{YYMD}{NNNN}` in `generatePartNumber`. Counter still resets to 001 daily, atomic via the existing `vendor_partnumber_sequences` table.
4. **Native desktop GUI — PySide6** (Qt). Not a local web app, not a CLI. PySide6 over Tk for better cross-platform widget parity and richer printer/USB-status UI elements.
5. **USB-only printer connection** — no network printer support in v1.
6. **Two user tiers**:
   - **Tier A** — commissioned shop kits (Linux only). Laptop + printer + labels + cable bundled and set up by shop staff before lending. Added to claude-fleet for support.
   - **Tier B** — BYO vendors (Linux or Windows). Vendor brings their own Zebra; self-commissions via in-app wizard.
7. **Speech input is in v1** — Vosk for offline speech-to-text. Falls back to typing.
8. **Quantity in the make-a-tag flow** — single field that both sets `quantity` on the TT item record AND drives `^PQ<n>` (label copies) in the printed ZPL.
9. **Bundled catalog + server-side updates for new formats.** Common Zebra direct-thermal + barbell formats and standard Avery codes ship in the binary. New/edited entries propagate from TT via catalog sync; no app release needed.

## Architecture

```
┌────────── Shared core (Python, cross-platform) ──────────┐
│  ui/         PySide6 — login, make-a-tag, items,         │
│              history, printer status                     │
│  tt_client/  HTTPS to TeamTime (auth, item submit,       │
│              ZPL fetch, catalog sync, kit profile sync,  │
│              item list sync)                             │
│  catalog/    Bundled + server-delta merge, lookup by code│
│  kit_profile/ Local kit config + server sync             │
│  inventory/  SQLite cache of vendor's full item list     │
│  speech/     Vosk offline STT (description + numeric)    │
│                                                          │
│  render/                                                 │
│   ├─ zpl.py     ZPL II for Zebras (thermal)              │
│   └─ sheet.py   PDF sheet of labels (Avery grid)         │
│                                                          │
│  printer/                                                │
│   ├─ linux_usb.py    pyusb → Zebra USB (Linux)           │
│   ├─ win_usb.py      pyusb → Zebra USB (Win, advanced)   │
│   ├─ win_spooler.py  win32print RAW (Win, default)       │
│   └─ system_sheet.py CUPS / win32print → default printer │
│                       prints PDF for inkjet/laser path   │
│                                                          │
│  commissioning/ First-run wizard (BYO) and CLI           │
│                 (shop kits)                              │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
   TT  ── pending_inventory_changes ──▶ staff CSV import ▶ NRS
        (current; when NRS API lands, this swaps to live push
         on the TT side, with zero desktop-side changes)
```

### Why three printer backends

- **`linux_usb.py`** — pyusb against libusb. Bidirectional reads work; full SGD queries, calibration, dump-mode detection. Needs one udev rule shipped in the .deb/AppImage.
- **`win_usb.py`** — pyusb against WinUSB. Same capability as Linux, but requires a WinUSB driver swap (via Zadig). "Advanced" mode for techy Windows vendors who want full features.
- **`win_spooler.py`** — `win32print` with `RAW` datatype. Default Windows path. Vendor installs the standard Zebra ZDesigner driver (or generic text-only); the app sends ZPL bytes through the spooler unfiltered. No driver swap. Trade-off: no bidirectional reads, so auto-detect of media becomes "vendor picks from dropdown."
- **`system_sheet.py`** — for the Avery inkjet/laser path. Sends generated PDFs to the system's default sheet printer via CUPS (Linux) or `win32print` (Windows).

### Cross-platform parallel dev tracks

- **Track 1 (Linux):** one dev owns `linux_usb.py` + shop-kit packaging (AppImage or .deb).
- **Track 2 (Windows):** one dev owns `win_spooler.py` first, then `win_usb.py`, plus MSI / PyInstaller `.exe` packaging.
- **Shared core** (`ui/`, `tt_client/`, `render/`, `catalog/`, `kit_profile/`, `inventory/`, `speech/`, `printer/__init__.py`) is OS-agnostic.

### Trust model

The desktop app is untrusted. Everything it sends, TT validates against the authenticated vendor session. Vendor isolation is enforced server-side:
- `quickTag` derives the vendor from the session, not from a request field.
- `generatePartNumber` only emits SKUs using the caller-vendor's `inventoryCodePrefix`.
- `/api/vendor/tag-zpl` refuses if the requested SKU doesn't start with the caller's prefix.
- `/api/vendor/items` and `/api/vendor/tag-sheet` are vendor-scoped at the query level.

Local state on the laptop (kit profile, catalog cache, item cache) is fine to persist — it's all data the vendor already owns. Ground truth is TT.

## Components

### Desktop app (Python)

| Module | Purpose | Depends on |
|---|---|---|
| `ui/app.py` | PySide6 window: login → make-a-tag → items tab → history → printer status | All below |
| `ui/items_tab.py` | Searchable item list with reprint, supports barcode-scanner keyboard input | `inventory`, `tt_client`, `printer` |
| `tt_client/session.py` | HTTPS session against TT: login, profile, item submit, ZPL fetch, catalog/kit/items sync | `requests` |
| `catalog/store.py` | Bundled + server-delta merge, lookup by code | `tt_client`, JSON on disk |
| `kit_profile/store.py` | Load/save kit profile locally and to TT, validate against schema | `tt_client`, JSON on disk |
| `inventory/store.py` | SQLite cache of vendor's items; search; sync via `?modified_since=` | `sqlite3`, `tt_client` |
| `speech/vosk_engine.py` | Vosk-based offline STT for description + numeric (price) grammars | `vosk`, `sounddevice` |
| `render/zpl.py` | Generate ZPL II for one item against a format + kit profile; dispatch by shape (rectangle vs barbell) | `catalog` |
| `render/sheet.py` | Generate a PDF of N items on an Avery grid | `reportlab` |
| `printer/__init__.py` | Abstract `Printer` interface (probe, print_bytes, print_sheet), factory selects backend from kit profile + OS | none |
| `printer/linux_usb.py` | pyusb backend; bidirectional reads | `pyusb`, `libusb1` |
| `printer/win_usb.py` | pyusb backend for Windows | `pyusb`, WinUSB |
| `printer/win_spooler.py` | Windows print spooler RAW datatype | `pywin32` |
| `printer/system_sheet.py` | Sends PDF to default sheet printer | `cups` / `win32print` |
| `commissioning/wizard.py` | First-run flow: detect printer, probe, choose format, save kit profile | `printer`, `kit_profile`, `catalog` |
| `commissioning/cli.py` | `--commission <kit_id>` flag for shop staff | same |

### TT server-side additions

| Change | Where | Purpose |
|---|---|---|
| Extend `label_formats` schema | `drizzle/<new migration>` | Add columns: `media_shape`, `shape_dims_json`, `media_sensor`, `category` (`thermal`/`sheet`), `manufacturer` (`zebra`/`avery`/`custom`), `part_number`, `dpi`, `version` |
| `GET /api/label-formats` | `src/routes/api/label-formats/+server.ts` | Catalog sync; supports `?modified_since=<version_int>` |
| `kit_profiles` table | `drizzle/<new migration>` | Per-kit config (printer model, DPI, dims, command lang, sensor mode); linked to `vendor_id` and optional `kit_id` |
| `GET/POST /api/kit-profiles` | `src/routes/api/kit-profiles/+server.ts` | Read/write kit profile; auth-scoped to caller |
| `GET /api/vendor/items` | `src/routes/api/vendor/items/+server.ts` | Paginated item feed for a vendor; supports `?modified_since=` |
| Update `generatePartNumber` | `src/lib/server/services/vendor-service.ts` | Switch to `{prefix}{MDDYY}{NNN}` |
| Extend `quickTag` action | `src/routes/(app)/vendor/inventory/+page.server.ts` | Accept optional `quantity` form field |
| Extend `/api/vendor/tag-zpl` | `src/routes/api/vendor/tag-zpl/+server.ts` | Accept optional `copies` query param; append `^PQ<n>` |
| New `/api/vendor/tag-sheet-pdf` | `src/routes/api/vendor/tag-sheet-pdf/+server.ts` | Returns Avery sheet as PDF (for the desktop sheet path) |
| Admin UI for catalog | `src/routes/(app)/admin/label-formats/` | List/add/edit/disable formats |

### Interface contracts that matter

- `Printer.probe() -> ProbeResult` — returns `{model, dpi, width_dots, length_dots, command_lang, media_type, media_sensor, in_dump_mode}` when the backend supports bidirectional reads (`linux_usb`, `win_usb`). Raises `ProbeUnsupported` on `win_spooler`; the commissioning wizard catches this and falls back to asking the vendor.
- `render.zpl.render(item, format, kit_profile) -> bytes` — pure function; no IO; trivially unit-testable with golden-file ZPL snapshots.
- `tt_client` raises typed exceptions: `AuthError`, `NotVendorError`, `ItemRejectedError`, `NetworkError`. The UI maps each to a clear message.

### Isolation boundaries

- `render/` has zero IO and zero network — pure render in, bytes out.
- `printer/` backends never talk to TT; they only talk to the printer.
- `tt_client/` never talks to the printer.
- `ui/` is the only module that knows about all three.

## Data flow

### A. Login (every app launch)

```
1. Vendor opens app           → ui shows email/password form
2. POST /login (form action)  → TT validates → sets cookie
3. GET /api/vendor/profile    → returns {vendor_id, prefix, displayName, preferredFormat}
4. GET /api/label-formats     → catalog delta merged into local store
   ?modified_since=<local_version>
5. GET /api/kit-profiles/me   → kit profile for this laptop/vendor
6. GET /api/vendor/items      → item delta merged into local SQLite
   ?modified_since=<last_synced_iso>
7. ui renders home screen     → "Make a tag" enabled if kit_profile valid
                                + printer detected
```

If step 5 returns 404 (no kit profile), the app jumps into the commissioning wizard.

### B. Commissioning

**Shop-kit path (Linux, staff present):**
```
1. Staff launches `yakima_label --commission <kit_id>`
2. App enumerates USB → finds Zebra → printer.probe()
3. probe returns {model, dpi, width, length, cmd_lang, media_type, sensor, in_dump_mode?}
4. If in_dump_mode = True   → halt, show printed recovery instructions
5. Staff picks format from catalog (filtered to manufacturer=zebra)
   • catalog format dims compared to probe dims → warn if mismatch
6. POST /api/kit-profiles    → saved server-side, kit_id linked to vendor
7. Print test tag            → staff confirms
8. Kit ready to lend
```

**BYO path (Linux or Windows, vendor doing it themselves):**
```
1. Vendor launches app first time → login → no kit profile → wizard
2. App detects printers (USB + spooler) → if multiple, vendor picks
3. probe() if backend supports it; else "what model / what stock?" form
4. Vendor picks format from catalog
   • If they have a stock not in catalog → "Custom dimensions" form
5. POST /api/kit-profiles    → saved as owner_type=vendor_byo
6. Print test tag
7. Done
```

### C. Make-a-tag (the everyday flow)

```
1. Vendor speaks/types description → ui field populated (Vosk on-device or typing)
2. Vendor speaks/types price       → parsed to cents
3. Vendor enters quantity          → default 1, optional
4. tt_client.submit_item(description, price, quantity)
   POST /vendor/inventory?/quickTag — extended to accept quantity
   → returns {partNumber, status, quantity}
5. tt_client.fetch_zpl(partNumber, copies=quantity)
   GET /api/vendor/tag-zpl?partNumber=X&copies=N
   → TT renders ZPL with ^PQN at the end of the format
6. printer backend sends bytes → printer prints N copies of same SKU
7. ui history row: "SR51626001 ×3 — Vintage Pyrex bowl — $24.99   [Reprint]"
8. ui upserts row into local SQLite item cache
```

For barbell labels, step 6's ZPL is generated by a barbell-specific layout function on the TT side (Panel A = barcode, Panel B = price + SKU text).

**Sheet (Avery) variant** — fork at step 5:
```
5a. ui shows "Print N tags on sheet" mode
5b. vendor picks Avery code + start cell
5c. tt_client.fetch_sheet_pdf(items=[partNumbers], format, start_cell)
    GET /api/vendor/tag-sheet-pdf
5d. printer.print_sheet(pdf_bytes) — system_sheet backend prints to default
```

### D. Reprint

```
1. Vendor finds item in the Items tab (search or scan barcode)
   • Scanner acts as keyboard: types SKU + Enter → app navigates to that item
2. Vendor clicks Reprint
3. tt_client.fetch_zpl(partNumber, copies=1)
4. printer.print_bytes(zpl)
```

`/api/vendor/tag-zpl` already resolves details from both `pending_inventory_changes` and `sales_transactions`, so reprint works for items that have been applied to NRS as well as those still pending.

### E. Catalog sync (background, on launch)

```
1. local_version = catalog/store.last_synced_version (0 if first run)
2. GET /api/label-formats?modified_since=<local_version>
3. response = {version: 47, added: [...], updated: [...], removed: [...]}
4. catalog merges in-memory, persists JSON to disk
5. last_synced_version = 47
```

Failures here are non-fatal — vendor keeps working against the cached/bundled catalog.

## Error handling

### Printer

| Failure | Detection | Vendor sees | Recovery |
|---|---|---|---|
| No printer detected | USB enumeration finds no Zebra (`0x0a5f`); spooler lists no Zebra | Banner: "Printer not found — check USB cable and power" | Replug → app re-enumerates on hotplug event |
| Printer in dump mode | `probe()` sees echo (response equals bytes-just-sent) | Modal: "Printer is in diagnostic mode" + model-specific steps | Vendor follows steps → re-probe |
| Ribbon mode mismatch | probe reports transfer mode but kit profile says direct, or printer signals "ribbon out" | Modal: "Remove the ribbon for direct-thermal labels, then Continue" | Sends `^MTD^JUS^XZ` → re-probes |
| Wrong label stock | probe length/width differs from kit profile by >5% | Banner with reload-or-update buttons | "Update kit profile" writes new dims locally + to TT |
| Calibration drift | First-time setup or "Recalibrate" button | Inline: "Calibrating — feeds 4–5 blank labels" | Sends `~JC`, polls until done |
| Out of media | `^HQES` paper-out flag, or write succeeds but LED red | Modal: "Out of labels — replace roll, then Continue" | Retry the print job from history |
| USB disconnect mid-job | pyusb raises ENODEV; spooler raises pywintypes.error | Banner with Reprint button | Item is safe in TT; reprint when reconnected |
| WinUSB driver missing (Win advanced) | `claim_interface` fails | Modal with Zadig link, or "switch to Standard mode" | One-click swap backend to win_spooler |
| Linux udev permission | pyusb `PermissionError` | Modal explaining udev rule install | Installer ships the rules file; modal explains manual install if missed |

### Network / TeamTime

| Failure | Detection | Vendor sees | Recovery |
|---|---|---|---|
| No internet | DNS/connect timeout to TT host | Modal: online required to submit | Reprints still work from local cache; block "Make a tag" until reconnect |
| Session expired | 401 from TT | Modal: "Signed out — please log in again" | Login screen; on success, resume queued action |
| TT down (5xx) | 500/502/503 from TT | Banner: "TeamTime unavailable — try again" | Auto-retry with backoff (1s, 3s, 9s) |
| Vendor portal not enabled | 403 with `vendor_portal_disabled` | Modal explaining the situation | Hard stop; no in-app path |
| Vendor missing prefix | 400 with `prefix_missing` | Modal: "Ask the shop to set your inventory prefix" | Hard stop |
| Item rejected | 400 with field error | Inline red text under the field | Vendor fixes and retries |
| Catalog sync fails | Network/5xx on `/api/label-formats` | Silent — log only | Falls back to bundled+last-good cache |

### Speech input

| Failure | Detection | Vendor sees | Recovery |
|---|---|---|---|
| No microphone | PortAudio enumerates no input | Mic button disabled with tooltip | Vendor types |
| Mic permission denied | OS denies access | Mic button shows red dot; click opens OS settings | Re-test on return |
| Recognition low confidence | Vosk below threshold | Description stays empty; banner "Couldn't catch that" | Vendor retries or types |
| Price parse fail | Numeric grammar fails | Price field flashes red | Vendor retries with cleaner phrasing or types digits |

### Local data

| Failure | Detection | Vendor sees | Recovery |
|---|---|---|---|
| Item DB corrupt | SQLite raises DatabaseError | Banner: "Local cache corrupted — rebuilding" | Nuke DB; full re-sync |
| Catalog corrupt | JSON parse fail | Falls back to bundled silently | None needed |
| Kit profile missing/corrupt | File read fails or schema mismatch | Wizard launches automatically | Re-commission |

### Guiding principles

1. **Never blame the vendor.** "Out of labels" not "you forgot labels."
2. **Always give a next action.** Hard stops say "contact the shop"; never leave a dead end.
3. **Print errors must never silently waste labels.** With pyusb bidirectional reads, dump-mode is detected before sending. Without bidirectional reads (Windows spooler path), the wizard at least confirms a test print at commissioning time and surfaces "Did your test label print correctly?" before saving the kit profile.
4. **Don't lose the vendor's work.** Item is submitted to TT before printing, so even if every print fails, the item is reprintable from the items tab.

## Testing

### Unit

| Module | Approach |
|---|---|
| `render/zpl.py` | Golden-file snapshots: for each (format × kit_profile × item) combo, freeze ZPL bytes in `tests/golden/<format>_<scenario>.zpl`. Tests assert exact byte match. Covers rectangular, barbell, custom shapes |
| `render/sheet.py` | Golden PDFs rendered to PNG via PIL; pixel-wise compare with ~1% tolerance |
| `catalog/store.py` | Merge: bundled-only, bundled+delta, server-override, deletes, version monotonicity |
| `kit_profile/store.py` | Schema validation; corrupt-file recovery; round-trip |
| `tt_client/session.py` | Mocked HTTPS via `responses`/`respx`: happy path, 401, 403, 500, network error |
| `inventory/store.py` | SQLite `:memory:`; sync upsert/delete; search-by-prefix |
| SKU format (server-side) | Existing TT test runner; cases for new format, daily reset, concurrent vendors |

### Integration

| Boundary | Approach |
|---|---|
| Desktop ↔ TT | Stand up TT dev server (existing Playwright config); run headless Python client through login → submit → fetch ZPL → tag-sheet against a real test DB |
| Printer abstract → real backends | `FakePrinter` ABC implementation records bytes sent and returns canned probe responses; backend-specific tests mock pyusb / pywin32 at the lib boundary |

### Hardware (manual, per release)

Checklist in `docs/release-checklist.md`:
- Rectangular labels at 1.25×1, 2.25×1.25, 3×1
- Barbell label
- Avery 5160 sheet, 10 labels, start cell = 3
- Reprint from local cache while TT unreachable
- Recover from dump mode (manually trigger → app detects and refuses)
- Recover from out-of-media mid-job
- Hot-swap printer mid-session

### CI

GitHub Actions matrix:
- Ubuntu 24.04 + Python 3.12 — full unit + integration
- Windows 2022 + Python 3.12 — unit + win-specific (pywin32 mocked)
- macOS — skip for v1

Cross-platform smoke: `--self-check` CLI mode verifies bundled catalog parses, render produces valid ZPL for one preset, app's main window opens (using `pyvirtualdisplay` on Linux CI).

### Out of scope for v1 testing

- Speech recognition accuracy across accents/dialects (Vosk is a vendored black box).
- Printer-firmware-specific edge cases beyond the failure-mode list in error handling.

## Open questions for plan phase

1. **Repository layout** — single monorepo with desktop + TT changes, or desktop in its own repo (e.g. `r0bug/yakima-label`) and TT changes as a parallel PR in `r0bug/teamtime`. Recommendation: separate repos; the desktop app and TT release independently.
2. **Packaging format** — Linux: AppImage vs. .deb; Windows: PyInstaller .exe + Inno Setup vs. MSI. Defer to plan phase.
3. **Vosk model size** — small (~50MB, lower accuracy) vs. medium (~1.6GB, better accuracy). Default to small; allow opt-in to medium via a settings download.
4. **Specific Zebra/Avery catalog seed** — which exact part numbers ship bundled. Recommendation: shop staff pick the top 20–30 stocks they actually use; everything else admin-extensible at runtime.

## Risks to monitor (not blockers)

- **Speech input schedule risk.** Speech is in v1, but Vosk integration + numeric-grammar tuning could slip. The make-a-tag flow degrades gracefully to typed input, so the feature is safe to defer to v1.1 if needed without changing the spec.
- **WinUSB driver friction** on the Windows USB-direct path. If too many BYO Windows vendors get stuck on Zadig install, the default-backend recommendation (win_spooler) is already the right escape valve.
- **Vendor isolation regression risk.** All security checks live server-side in TT. Any plan-phase change that adds a desktop-side endpoint without TT-side validation is a red flag.

## Anticipated future work (post-v1)

- **NRS API switchover** — server-side only; desktop sees no API change.
- **macOS client** — same Python codebase; add `mac_usb.py` (pyusb works on macOS but needs codesigning + entitlements for USB access).
- **Network printer support** — useful when Yakima Finds itself standardizes on a few specific printers; out of scope for vendor kits.
- **Photo capture during make-a-tag** — webcam → upload to TT for staff to review during the import-queue step (drops out of scope when NRS API lands).
