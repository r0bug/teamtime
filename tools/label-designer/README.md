# Label Format Designer

A local web tool to design `label_formats` rows with a live preview using
TeamTime's **real** renderer, test-print to a Zebra on the network, and write the
format directly to the database through the same validated service the admin UI
uses. Run it on a fleet box (lappy/hairydel), design in a browser, save when happy.

## Run

```bash
# in the teamtime repo
DATABASE_URL=postgres://teamtime:…@localhost:5432/teamtime \
LABEL_DESIGNER_PRINTER=192.168.88.50:9100 \
npm run label-designer
# open http://127.0.0.1:5599
```

### Env vars
- `DATABASE_URL` (required) — the DB the **Save** button writes to. The UI shows
  the resolved host/name; Save confirms it.
- `LABEL_DESIGNER_PORT` — server port (default `5599`, bound to `127.0.0.1`).
- `LABEL_DESIGNER_TUNNEL` — ssh host to auto-open a Postgres tunnel before start.

## Writing to production

Prod Postgres (backoffice) listens on `127.0.0.1` only, so from another box open
an SSH tunnel and point `DATABASE_URL` at it:

```bash
ssh -fN -L 6432:localhost:5432 backoffice
DATABASE_URL=postgres://teamtime:…@localhost:6432/teamtime npm run label-designer
# or let the tool open it:
LABEL_DESIGNER_TUNNEL=backoffice DATABASE_URL=postgres://teamtime:…@localhost:6432/teamtime npm run label-designer
```

Point `DATABASE_URL` at the dev DB for a design-on-dev-then-promote workflow.

## Workflow

1. **Verify alignment first.** Set the printer, set width/height/dpi, click
   **Test print: border**. A frame + center lines + the pixel dims print. The
   frame should sit just inside all four edges; if it's clipped or off, adjust
   width/height/dpi and reprint until it lands right.
2. **Design content.** Pick `media_shape`; for barbell, edit the pad rows
   (role/x/width, optional barcode height). Watch the live preview.
3. **Test print: sample** to confirm content on the now-known-good area.
4. **Save to DB** — validated via `label-format-service` (create, or update if the
   code exists). It's in the desktop app's dropdown immediately; no rebuild.

## Safety

Server binds `127.0.0.1` only (single operator, no auth). Saves go through the
existing validation. No deletes from this tool.
