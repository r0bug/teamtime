-- OPTIONAL / hand-apply (run as postgres: sudo -u postgres psql -d teamtime -f <this>).
-- Not part of the drizzle journal, so `db:migrate` will not pick it up.
--
-- The code fix (renderZpl barbell branch) already renders correctly using a
-- default 40/20/40 pad split when shape_dims_json is NULL. This script just
-- makes the geometry explicit (so it's tunable from data, no redeploy) and
-- corrects the stock height to the measured 0.6125".  Idempotent.
--
-- Pads are in inches from the label's left edge. The gap between them is the
-- fold/neck and prints blank. Tune xIn / widthIn here if a real print shows the
-- barcode or text crowding the fold.

UPDATE label_formats
SET
  label_height_inches = 0.6125,           -- measured; was 0.625 (≈3 dots @203dpi)
  shape_dims_json = '{
    "pads": [
      { "role": "barcode", "xIn": 0.00,  "widthIn": 0.85, "barcodeHeightIn": 0.28 },
      { "role": "info",    "xIn": 1.275, "widthIn": 0.85 }
    ]
  }'::jsonb,
  updated_at = now()
WHERE code = 'zebra_barbell_2125x0625';
