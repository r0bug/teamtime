-- Backfill catalog-sync fields on existing rows: thermal layouts get category='thermal'.
-- (New rows default category='sheet'; this corrects pre-existing thermal formats.)
UPDATE label_formats SET category = layout WHERE category = 'sheet' AND layout = 'thermal';
--> statement-breakpoint

-- Starter catalog. Codes are stable identifiers; admins can edit names/dims later.
-- Idempotent via ON CONFLICT (code) DO NOTHING.
INSERT INTO label_formats
  (code, name, layout, label_width_inches, label_height_inches,
   page_width_inches, page_height_inches, cols, rows,
   margin_top_inches, margin_left_inches,
   vertical_pitch_inches, horizontal_pitch_inches,
   media_shape, category, manufacturer, part_number, dpi, media_sensor,
   is_active)
VALUES
  ('avery_5160', 'Avery 5160 — 30-up address (2.625 x 1)', 'sheet',
     2.625, 1.000, 8.500, 11.000, 3, 10, 0.500, 0.188, 0.000, 0.125,
     'rectangle', 'sheet', 'avery', '5160', NULL, NULL, TRUE),
  ('avery_5163', 'Avery 5163 — 10-up shipping (4 x 2)', 'sheet',
     4.000, 2.000, 8.500, 11.000, 2, 5, 0.500, 0.188, 0.000, 0.125,
     'rectangle', 'sheet', 'avery', '5163', NULL, NULL, TRUE),
  ('avery_5167', 'Avery 5167 — 80-up return address (1.75 x 0.5)', 'sheet',
     1.750, 0.500, 8.500, 11.000, 4, 20, 0.500, 0.300, 0.000, 0.187,
     'rectangle', 'sheet', 'avery', '5167', NULL, NULL, TRUE),
  ('zebra_gk420t_1125x1', 'Zebra 1.125 x 1 direct-thermal (GK420t)', 'thermal',
     1.125, 1.000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'rectangle', 'thermal', 'zebra', '10010044', 203, 'gap', TRUE),
  ('zebra_gk420t_2x1', 'Zebra 2 x 1 direct-thermal (GK420t)', 'thermal',
     2.000, 1.000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'rectangle', 'thermal', 'zebra', '10010029', 203, 'gap', TRUE),
  ('zebra_gk420t_225x125', 'Zebra 2.25 x 1.25 direct-thermal (GK420t)', 'thermal',
     2.250, 1.250, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'rectangle', 'thermal', 'zebra', '10015341', 203, 'gap', TRUE),
  ('zebra_gk420t_3x1', 'Zebra 3 x 1 direct-thermal (GK420t)', 'thermal',
     3.000, 1.000, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'rectangle', 'thermal', 'zebra', '10010047', 203, 'gap', TRUE),
  ('zebra_barbell_2125x0625', 'Zebra barbell — 2.125 x 0.625 jewelry', 'thermal',
     2.125, 0.625, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'barbell', 'thermal', 'zebra', '10003051', 203, 'mark', TRUE)
ON CONFLICT (code) DO NOTHING;
