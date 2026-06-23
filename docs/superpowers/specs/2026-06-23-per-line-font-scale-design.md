# Per-Line Font Scale — Design Spec

**Date:** 2026-06-23
**Status:** Approved — build

## Problem
The rectangle/thermal label sizes each line as a fixed proportion of label
height times one global `fontScale` (small/medium/large). Operators need to size
each line independently (e.g. bigger price, smaller footer) per format.

## Design
Per-format multipliers stored in the format's existing `shape_dims_json` (jsonb),
set in the label designer, applied by the renderer. Data-driven — no rebuild.

```json
{ "lineScales": { "header": 1, "barcode": 1, "partNumber": 1, "description": 1, "price": 1, "footer": 1 } }
```

Each value multiplies the existing per-line proportion **on top of** the global
`fontScale`. Absent or `1.0` ⇒ identical to today. Coexists with barbell `pads`
in the same object.

### Rendering (rectangle/thermal path)
- `renderZplFromDimensions`: each line font (`header/partNumber/description/price/footer`)
  and the barcode row height multiply by their `lineScales` entry. Existing
  gap-distribution absorbs the resized lines.
- `renderTagSvgFromDimensions`: apply the same multipliers to its preview fonts so
  the preview tracks the print (approximate, as the SVG path already is).

### Data types
Add `LineScales` and extend `BarbellShapeDims` to `{ pads?, lineScales? }`. A
`lineScale(dims, key)` helper returns the multiplier (default 1, ignores ≤0).
`getFormatDimensions` already surfaces `shape_dims_json` as `shapeDims`.

### Designer
`FormState.lineScales`; `formStateToInput`/`formStateToDimensions` write
`lineScales` into `shape_dims_json`/`shapeDims` (merged with `pads`). UI adds a
"Line scales" panel (one number per line, default 1.0) with live preview.

## Scope
v1 = rectangle/thermal layout (the lines that exist there). Barbell's info-pad
price/description scaling is a fast follow (it has its own `barcodeHeightIn`).

## Testing (TDD)
- Render: a line's font (and barcode height) scales when its `lineScales` entry is
  set; output unchanged when absent.
- Form-model: `lineScales` round-trips into `shape_dims_json` and `shapeDims`.
