-- Add a 1.5" wide x 1" tall direct-thermal format (GK420t). Additive + idempotent.
-- Apply as the app role or postgres:  psql "$DATABASE_URL" -f <this>
-- Data-only: appears in the desktop app's thermal dropdown immediately, no rebuild.
--
-- Fixes "pushed right": prior formats were wider than the 1.5" stock, so content
-- centered for the wider ^PW landed right of the label's true center. With a
-- matching width (^PW = 1.5" = 305 dots @203dpi) content centers correctly.

INSERT INTO label_formats
  (code, name, layout, label_width_inches, label_height_inches,
   media_shape, category, manufacturer, part_number, dpi, media_sensor, is_active)
VALUES
  ('zebra_gk420t_15x1', 'Zebra 1.5 x 1 direct-thermal (GK420t)', 'thermal',
   1.500, 1.000, 'rectangle', 'thermal', 'zebra', NULL, 203, 'gap', TRUE)
ON CONFLICT (code) DO NOTHING;
