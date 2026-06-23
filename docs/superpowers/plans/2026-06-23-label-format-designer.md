# Label Format Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web tool, run on a fleet box, to design `label_formats` rows with a live preview using TeamTime's real renderer, test-print to a network Zebra (alignment border + sample), and write directly to the DB via the existing validated service.

**Architecture:** A `tools/label-designer/` directory in the TeamTime repo, launched with `vite-node` so `$lib`/`$env` resolve and it can import TeamTime's `tag-render-service`, `label-format-service`, and `db` in-process. A tiny `node:http` server bound to `127.0.0.1` serves a single-page UI and JSON endpoints. Preview reuses the production renderer; saves reuse `createFormat`/`updateFormat`.

**Tech Stack:** TypeScript, `vite-node`, Node `http`/`net`/`child_process`, Vitest, the existing SvelteKit project (Svelte 4, Drizzle, bwip-js).

## Global Constraints

- Server binds `127.0.0.1` only — no auth, single operator.
- No new heavyweight deps; only `vite-node` (dev) is added. Preview = SVG via `renderTagSvgFromDimensions`; no external services.
- Production render output must not change: existing `tests/unit/services/tag-render-*.test.ts` stay green.
- Saves go through `label-format-service` (validation, dup-code → update). No deletes from this tool.
- Run command: `npm run label-designer`. Env: `DATABASE_URL` (target), `LABEL_DESIGNER_PRINTER` (`host:port`), `LABEL_DESIGNER_TUNNEL` (optional ssh host), `LABEL_DESIGNER_PORT` (default 5599).
- Never read/commit `.env*`. Commit messages end with the project trailer.
- Tool source in `tools/label-designer/`; tool tests in `tests/unit/label-designer/`.

---

### Task 1: Split render-from-dimensions out of the renderer (production refactor)

**Files:**
- Modify: `src/lib/server/services/tag-render-service.ts`
- Test: `tests/unit/services/tag-render-from-dimensions.test.ts`

**Interfaces:**
- Produces: `renderZplFromDimensions(dims: TagDimensions, ctx: TagRenderContext): string` and `renderTagSvgFromDimensions(dims: TagDimensions, ctx: TagRenderContext): Promise<string>`. `renderZpl`/`renderTagSvg` keep their signatures and delegate after resolving `dims`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/services/tag-render-from-dimensions.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
	db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }) },
	labelFormats: {}
}));

import { renderZplFromDimensions } from '$lib/server/services/tag-render-service';

const ctx = {
	vendorDisplayName: 'Acme',
	settings: null,
	item: { partNumber: 'SR51626001', name: null, description: 'Widget', priceCents: 999 }
} as any;

describe('renderZplFromDimensions', () => {
	it('renders ZPL from explicit dimensions without a DB lookup', async () => {
		const dims = { widthInches: 2.0, heightInches: 1.0, cssClass: 'x' };
		const zpl = renderZplFromDimensions(dims, ctx);
		expect(zpl.startsWith('^XA')).toBe(true);
		expect(zpl).toContain('^PW406'); // 2.0 * 203
		expect(zpl).toContain('^LL203'); // 1.0 * 203
	});

	it('honors barbell dims (two-pad path)', async () => {
		const dims = {
			widthInches: 2.125, heightInches: 0.6125, cssClass: 'x',
			mediaShape: 'barbell',
			shapeDims: { pads: [{ role: 'barcode', xIn: 0, widthIn: 0.85 }, { role: 'info', xIn: 1.275, widthIn: 0.85 }] }
		};
		const zpl = renderZplFromDimensions(dims as any, ctx);
		const origins = [...zpl.matchAll(/^\^FO(\d+),/gm)].map((m) => parseInt(m[1], 10));
		expect(origins.some((x) => x >= Math.round(1.275 * 203))).toBe(true); // info pad on the right
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/services/tag-render-from-dimensions.test.ts`
Expected: FAIL — `renderZplFromDimensions` is not exported.

- [ ] **Step 3: Refactor `renderZpl` to delegate**

In `src/lib/server/services/tag-render-service.ts`, change the start of `renderZpl` so it resolves dims then delegates, and add the new exported function holding the existing body. Concretely:

Replace the current `renderZpl` opening:
```typescript
export async function renderZpl(ctx: TagRenderContext): Promise<string> {
	const copies = Math.max(1, Math.min(99, Math.floor(ctx.copies ?? 1)));
	const eff = resolveSettings(ctx.settings);
	const dims = await getFormatDimensions(ctx.formatCode || eff.preferredFormat);
	const dpi = ctx.dpi || eff.zebraDpi || 203;
	const widthDots = Math.round(dims.widthInches * dpi);
	const heightDots = Math.round(dims.heightInches * dpi);
```
with:
```typescript
export async function renderZpl(ctx: TagRenderContext): Promise<string> {
	const eff = resolveSettings(ctx.settings);
	const dims = await getFormatDimensions(ctx.formatCode || eff.preferredFormat);
	return renderZplFromDimensions(dims, ctx);
}

/** Render ZPL from already-resolved dimensions (no DB lookup). */
export function renderZplFromDimensions(dims: TagDimensions, ctx: TagRenderContext): string {
	const copies = Math.max(1, Math.min(99, Math.floor(ctx.copies ?? 1)));
	const eff = resolveSettings(ctx.settings);
	const dpi = ctx.dpi || eff.zebraDpi || 203;
	const widthDots = Math.round(dims.widthInches * dpi);
	const heightDots = Math.round(dims.heightInches * dpi);
```
The rest of the original `renderZpl` body (from the barbell branch through `return cmds.join('\n');`) stays unchanged inside `renderZplFromDimensions`.

- [ ] **Step 4: Do the same for `renderTagSvg`**

Replace the opening of `renderTagSvg`:
```typescript
export async function renderTagSvg(ctx: TagRenderContext): Promise<string> {
	const dims = await getFormatDimensions(...);
```
with a thin resolver that delegates to a new `renderTagSvgFromDimensions(dims, ctx)`, moving the existing body into that function (keep it `async` — it awaits `renderBarcodeSvg`):
```typescript
export async function renderTagSvg(ctx: TagRenderContext): Promise<string> {
	const eff = resolveSettings(ctx.settings);
	const dims = await getFormatDimensions(ctx.formatCode || eff.preferredFormat);
	return renderTagSvgFromDimensions(dims, ctx);
}

export async function renderTagSvgFromDimensions(dims: TagDimensions, ctx: TagRenderContext): Promise<string> {
	// ...existing renderTagSvg body, using `dims` instead of the removed lookup...
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/services/tag-render-from-dimensions.test.ts tests/unit/services/tag-render-zpl-copies.test.ts tests/unit/services/tag-render-barbell.test.ts`
Expected: PASS (new tests green; existing render tests unchanged).

- [ ] **Step 6: Type-check and commit**

Run: `npm run check 2>&1 | grep tag-render || echo clean`
```bash
git add src/lib/server/services/tag-render-service.ts tests/unit/services/tag-render-from-dimensions.test.ts
git commit -m "refactor(labels): render-from-dimensions split so unsaved formats can preview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Alignment-border ZPL builder

**Files:**
- Create: `tools/label-designer/zpl-border.ts`
- Test: `tests/unit/label-designer/zpl-border.test.ts`

**Interfaces:**
- Produces: `buildAlignmentBorderZpl(opts: { widthInches: number; heightInches: number; dpi: number; pads?: { xIn: number; widthIn: number }[] }): string`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/label-designer/zpl-border.test.ts
import { describe, it, expect } from 'vitest';
import { buildAlignmentBorderZpl } from '../../../tools/label-designer/zpl-border';

describe('buildAlignmentBorderZpl', () => {
	it('frames the full printable area with center lines and dims', () => {
		const zpl = buildAlignmentBorderZpl({ widthInches: 1.5, heightInches: 1.0, dpi: 203 });
		expect(zpl).toContain('^PW305'); // round(1.5*203)
		expect(zpl).toContain('^LL203');
		expect(zpl).toContain('^FO0,0^GB305,203,2^FS'); // outer border
		expect(zpl).toContain('^FO152,0^GB1,203,1^FS'); // vertical center
		expect(zpl).toContain('^FD305x203@203^FS'); // dims label
		expect(zpl.trimEnd().endsWith('^XZ')).toBe(true);
	});

	it('draws a box per barbell pad when pads given', () => {
		const zpl = buildAlignmentBorderZpl({
			widthInches: 2.125, heightInches: 0.6125, dpi: 203,
			pads: [{ xIn: 0, widthIn: 0.85 }, { xIn: 1.275, widthIn: 0.85 }]
		});
		expect(zpl).toContain('^FO0,0^GB173,124,1^FS'); // pad 1 box (round(0.85*203)=173, round(0.6125*203)=124)
		expect(zpl).toContain('^FO259,0^GB173,124,1^FS'); // pad 2 box (round(1.275*203)=259)
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/label-designer/zpl-border.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// tools/label-designer/zpl-border.ts
export interface BorderOpts {
	widthInches: number;
	heightInches: number;
	dpi: number;
	pads?: { xIn: number; widthIn: number }[];
}

/** ZPL that frames the printable area (+ center lines, dims, optional pad boxes)
 *  so an operator can verify the label is aligned before designing content. */
export function buildAlignmentBorderZpl(opts: BorderOpts): string {
	const w = Math.round(opts.widthInches * opts.dpi);
	const l = Math.round(opts.heightInches * opts.dpi);
	const cmds: string[] = ['^XA', `^PW${w}`, `^LL${l}`, '^LH0,0'];
	cmds.push(`^FO0,0^GB${w},${l},2^FS`); // outer border
	cmds.push(`^FO${Math.round(w / 2)},0^GB1,${l},1^FS`); // vertical center line
	cmds.push(`^FO0,${Math.round(l / 2)}^GB${w},1,1^FS`); // horizontal center line
	for (const p of opts.pads ?? []) {
		const px = Math.round(p.xIn * opts.dpi);
		const pw = Math.round(p.widthIn * opts.dpi);
		cmds.push(`^FO${px},0^GB${pw},${l},1^FS`);
	}
	cmds.push(`^FO6,6^A0N,18,18^FD${w}x${l}@${opts.dpi}^FS`);
	cmds.push('^XZ');
	return cmds.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/label-designer/zpl-border.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/label-designer/zpl-border.ts tests/unit/label-designer/zpl-border.test.ts
git commit -m "feat(label-designer): alignment-border ZPL builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Form → model mapping

**Files:**
- Create: `tools/label-designer/form-model.ts`
- Test: `tests/unit/label-designer/form-model.test.ts`

**Interfaces:**
- Produces: `FormState` interface; `formStateToInput(f: FormState): LabelFormatInput`; `formStateToDimensions(f: FormState): TagDimensions`; `formStateToCtx(f: FormState): TagRenderContext`; `parsePriceToCents(s: string): number | null`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/label-designer/form-model.test.ts
import { describe, it, expect } from 'vitest';
import { formStateToInput, formStateToDimensions, parsePriceToCents } from '../../../tools/label-designer/form-model';

const base = {
	code: 'zebra_gk420t_15x1', name: 'Zebra 1.5 x 1', layout: 'thermal', dpi: 203,
	widthIn: 1.5, heightIn: 1.0, mediaShape: 'rectangle', mediaSensor: 'gap',
	manufacturer: 'zebra', partNumber: null,
	sample: { vendorName: 'Acme', price: '$9.99', sku: 'SR1', description: 'Widget' }
} as any;

describe('form-model', () => {
	it('maps a rectangle thermal form to LabelFormatInput', () => {
		const input = formStateToInput(base);
		expect(input).toMatchObject({
			code: 'zebra_gk420t_15x1', layout: 'thermal', category: 'thermal',
			labelWidthInches: 1.5, labelHeightInches: 1.0, mediaShape: 'rectangle',
			dpi: 203, shapeDimsJson: null
		});
	});

	it('maps barbell pads into shapeDimsJson', () => {
		const f = { ...base, mediaShape: 'barbell', pads: [{ role: 'barcode', xIn: 0, widthIn: 0.85, barcodeHeightIn: 0.28 }, { role: 'info', xIn: 1.275, widthIn: 0.85 }] };
		const input = formStateToInput(f);
		expect(input.shapeDimsJson).toEqual({ pads: f.pads });
		expect(input.mediaShape).toBe('barbell');
	});

	it('builds preview dimensions', () => {
		const dims = formStateToDimensions(base);
		expect(dims).toMatchObject({ widthInches: 1.5, heightInches: 1.0, mediaShape: 'rectangle' });
	});

	it('parses prices to cents', () => {
		expect(parsePriceToCents('$9.99')).toBe(999);
		expect(parsePriceToCents('12')).toBe(1200);
		expect(parsePriceToCents('')).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/label-designer/form-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// tools/label-designer/form-model.ts
import type { LabelFormatInput } from '$lib/server/services/label-format-service';
import type { TagDimensions, TagRenderContext } from '$lib/server/services/tag-render-service';

export interface PadInput {
	role: 'barcode' | 'info';
	xIn: number;
	widthIn: number;
	barcodeHeightIn?: number;
}

export interface FormState {
	code: string;
	name: string;
	layout: 'thermal' | 'sheet';
	dpi: number;
	widthIn: number;
	heightIn: number;
	pageWidthIn?: number | null;
	pageHeightIn?: number | null;
	cols?: number | null;
	rows?: number | null;
	marginTopIn?: number | null;
	marginLeftIn?: number | null;
	vPitchIn?: number | null;
	hPitchIn?: number | null;
	mediaShape: 'rectangle' | 'barbell';
	pads?: PadInput[];
	mediaSensor?: 'gap' | 'mark' | 'continuous' | null;
	manufacturer?: 'zebra' | 'avery' | 'custom';
	partNumber?: string | null;
	fontScale?: 'small' | 'medium' | 'large';
	sample: { vendorName: string; price: string; sku: string; description: string };
}

export function parsePriceToCents(s: string): number | null {
	const t = (s ?? '').replace(/[^0-9.]/g, '').trim();
	if (!t) return null;
	const n = Number(t);
	return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function formStateToInput(f: FormState): LabelFormatInput {
	const sheet = f.layout === 'sheet';
	return {
		code: f.code,
		name: f.name,
		layout: f.layout,
		labelWidthInches: f.widthIn,
		labelHeightInches: f.heightIn,
		pageWidthInches: sheet ? f.pageWidthIn ?? null : null,
		pageHeightInches: sheet ? f.pageHeightIn ?? null : null,
		cols: sheet ? f.cols ?? null : null,
		rows: sheet ? f.rows ?? null : null,
		marginTopInches: sheet ? f.marginTopIn ?? null : null,
		marginLeftInches: sheet ? f.marginLeftIn ?? null : null,
		verticalPitchInches: sheet ? f.vPitchIn ?? null : null,
		horizontalPitchInches: sheet ? f.hPitchIn ?? null : null,
		mediaShape: f.mediaShape,
		shapeDimsJson: f.mediaShape === 'barbell' && f.pads?.length ? { pads: f.pads } : null,
		mediaSensor: f.mediaSensor ?? (sheet ? null : 'gap'),
		category: f.layout,
		manufacturer: f.manufacturer ?? 'custom',
		partNumber: f.partNumber ?? null,
		dpi: sheet ? null : f.dpi
	};
}

export function formStateToDimensions(f: FormState): TagDimensions {
	return {
		widthInches: f.widthIn,
		heightInches: f.heightIn,
		cssClass: 'preview',
		mediaShape: f.mediaShape,
		shapeDims: f.mediaShape === 'barbell' && f.pads?.length ? { pads: f.pads } : null
	};
}

export function formStateToCtx(f: FormState): TagRenderContext {
	return {
		vendorDisplayName: f.sample.vendorName,
		settings: { fontScale: f.fontScale ?? 'medium' } as any,
		item: {
			partNumber: f.sample.sku,
			name: null,
			description: f.sample.description,
			priceCents: parsePriceToCents(f.sample.price)
		},
		copies: 1,
		dpi: f.layout === 'thermal' ? f.dpi : undefined
	} as TagRenderContext;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/label-designer/form-model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/label-designer/form-model.ts tests/unit/label-designer/form-model.test.ts
git commit -m "feat(label-designer): form-state to model mapping

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Raw-9100 printer send

**Files:**
- Create: `tools/label-designer/printer.ts`
- Test: `tests/unit/label-designer/printer.test.ts`

**Interfaces:**
- Produces: `sendZplToPrinter(zpl: string, host: string, port?: number, timeoutMs?: number): Promise<void>`; `parsePrinterTarget(s: string): { host: string; port: number }`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/label-designer/printer.test.ts
import { describe, it, expect } from 'vitest';
import { createServer } from 'node:net';
import { sendZplToPrinter, parsePrinterTarget } from '../../../tools/label-designer/printer';

describe('printer', () => {
	it('parses host:port', () => {
		expect(parsePrinterTarget('10.0.0.5:9100')).toEqual({ host: '10.0.0.5', port: 9100 });
		expect(parsePrinterTarget('zt230.local')).toEqual({ host: 'zt230.local', port: 9100 });
	});

	it('sends bytes to a TCP listener', async () => {
		const received: Buffer[] = [];
		const srv = createServer((sock) => sock.on('data', (d) => received.push(d)));
		await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
		const port = (srv.address() as any).port;
		await sendZplToPrinter('^XA^XZ', '127.0.0.1', port);
		await new Promise((r) => setTimeout(r, 50));
		srv.close();
		expect(Buffer.concat(received).toString()).toBe('^XA^XZ');
	});

	it('rejects when the host is unreachable', async () => {
		await expect(sendZplToPrinter('^XA^XZ', '127.0.0.1', 1, 300)).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/label-designer/printer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// tools/label-designer/printer.ts
import { Socket } from 'node:net';

export function parsePrinterTarget(s: string): { host: string; port: number } {
	const [host, port] = s.trim().split(':');
	return { host, port: port ? parseInt(port, 10) : 9100 };
}

export function sendZplToPrinter(zpl: string, host: string, port = 9100, timeoutMs = 4000): Promise<void> {
	return new Promise((resolve, reject) => {
		const sock = new Socket();
		const fail = (e: Error) => { sock.destroy(); reject(e); };
		sock.setTimeout(timeoutMs, () => fail(new Error(`Printer ${host}:${port} timed out`)));
		sock.on('error', (e) => fail(new Error(`Printer ${host}:${port}: ${e.message}`)));
		sock.connect(port, host, () => {
			sock.write(zpl, () => sock.end());
		});
		sock.on('close', () => resolve());
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/label-designer/printer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/label-designer/printer.ts tests/unit/label-designer/printer.test.ts
git commit -m "feat(label-designer): raw 9100 printer send

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Barbell preview SVG (tool-side, reuses TT barcode renderer)

**Files:**
- Create: `tools/label-designer/barbell-svg.ts`
- Test: `tests/unit/label-designer/barbell-svg.test.ts`

**Interfaces:**
- Consumes: `renderBarcodeSvg` from `$lib/server/services/tag-render-service`.
- Produces: `renderBarbellPreviewSvg(f: FormState): Promise<string>` — outline + pad/neck boxes + barcode in barcode pad + price/desc in info pad.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/label-designer/barbell-svg.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('$lib/server/db', () => ({ db: {}, labelFormats: {} }));
import { renderBarbellPreviewSvg } from '../../../tools/label-designer/barbell-svg';

const f = {
	widthIn: 2.125, heightIn: 0.6125, mediaShape: 'barbell',
	pads: [{ role: 'barcode', xIn: 0, widthIn: 0.85 }, { role: 'info', xIn: 1.275, widthIn: 0.85 }],
	sample: { vendorName: 'Acme', price: '$9.99', sku: 'SR1', description: 'Widget' }
} as any;

describe('renderBarbellPreviewSvg', () => {
	it('draws two pad rects and places the price text in the info pad region', async () => {
		const svg = await renderBarbellPreviewSvg(f);
		expect(svg).toContain('<svg');
		expect((svg.match(/<rect/g) || []).length).toBeGreaterThanOrEqual(3); // outline + 2 pads
		expect(svg).toContain('$9.99');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/label-designer/barbell-svg.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (96px/inch screen scale; mirrors the ZPL barbell layout visually)

```typescript
// tools/label-designer/barbell-svg.ts
import { renderBarcodeSvg } from '$lib/server/services/tag-render-service';
import type { FormState } from './form-model';
import { parsePriceToCents } from './form-model';

const PX = 96; // screen px per inch

export async function renderBarbellPreviewSvg(f: FormState): Promise<string> {
	const w = f.widthIn * PX;
	const h = f.heightIn * PX;
	const pads = f.pads ?? [];
	const parts: string[] = [];
	parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="white" stroke="#bbb"/>`);
	for (const p of pads) {
		const px = p.xIn * PX;
		const pw = p.widthIn * PX;
		parts.push(`<rect x="${px}" y="0" width="${pw}" height="${h}" fill="none" stroke="#3b82f6" stroke-dasharray="3 2"/>`);
	}
	const barcodePad = pads.find((p) => p.role === 'barcode');
	const infoPad = pads.find((p) => p.role === 'info');
	if (barcodePad) {
		const bc = await renderBarcodeSvg(f.sample.sku, { heightMm: 8 });
		const bx = barcodePad.xIn * PX + 6;
		const bw = barcodePad.widthIn * PX - 12;
		parts.push(`<g transform="translate(${bx}, ${h * 0.2})"><svg width="${bw}" height="${h * 0.45}" viewBox="0 0 200 80" preserveAspectRatio="none">${stripSvgWrapper(bc)}</svg></g>`);
		parts.push(`<text x="${barcodePad.xIn * PX + barcodePad.widthIn * PX / 2}" y="${h * 0.9}" font-size="9" text-anchor="middle" font-family="monospace">${f.sample.sku}</text>`);
	}
	if (infoPad) {
		const cx = infoPad.xIn * PX + infoPad.widthIn * PX / 2;
		const cents = parsePriceToCents(f.sample.price);
		if (cents !== null) parts.push(`<text x="${cx}" y="${h * 0.45}" font-size="16" font-weight="700" text-anchor="middle">$${(cents / 100).toFixed(2)}</text>`);
		parts.push(`<text x="${cx}" y="${h * 0.75}" font-size="10" text-anchor="middle">${escapeXml(f.sample.description)}</text>`);
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`;
}

function stripSvgWrapper(svg: string): string {
	return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
function escapeXml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/label-designer/barbell-svg.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/label-designer/barbell-svg.ts tests/unit/label-designer/barbell-svg.test.ts
git commit -m "feat(label-designer): barbell preview SVG

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Request router (endpoints, testable without a port)

**Files:**
- Create: `tools/label-designer/router.ts`
- Test: `tests/unit/label-designer/router.test.ts`

**Interfaces:**
- Consumes: `renderTagSvgFromDimensions`, `renderZplFromDimensions` (Task 1); `createFormat`, `updateFormat`, `getFormatByCode`, `listFormats` from `label-format-service`; `formStateToInput/Dimensions/Ctx` (Task 3); `buildAlignmentBorderZpl` (Task 2); `renderBarbellPreviewSvg` (Task 5); `sendZplToPrinter`, `parsePrinterTarget` (Task 4).
- Produces: `route(req: { method: string; path: string; body: any }, deps?: Partial<Deps>): Promise<{ status: number; json?: any; svg?: string; html?: string }>` and `dbLabel(): string`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/label-designer/router.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('$lib/server/db', () => ({ db: {}, labelFormats: {} }));

import { route } from '../../../tools/label-designer/router';

const form = {
	code: 'x_15x1', name: 'X', layout: 'thermal', dpi: 203, widthIn: 1.5, heightIn: 1.0,
	mediaShape: 'rectangle', sample: { vendorName: 'Acme', price: '$9.99', sku: 'SR1', description: 'W' }
};

describe('route', () => {
	it('previews a rectangle to SVG', async () => {
		const res = await route({ method: 'POST', path: '/api/preview', body: form });
		expect(res.status).toBe(200);
		expect(res.svg).toContain('<svg');
	});

	it('test-prints an alignment border to a stub printer', async () => {
		const sent: string[] = [];
		const res = await route(
			{ method: 'POST', path: '/api/test-print', body: { form, mode: 'border', printer: '1.2.3.4:9100' } },
			{ sendZpl: async (zpl) => { sent.push(zpl); } }
		);
		expect(res.status).toBe(200);
		expect(sent[0]).toContain('^GB305,203,2'); // border ZPL
	});

	it('saves via createFormat when code is new', async () => {
		const created: any[] = [];
		const res = await route(
			{ method: 'POST', path: '/api/save', body: form },
			{ getFormatByCode: async () => null, createFormat: async (i) => { created.push(i); return { id: '1', ...i } as any; } }
		);
		expect(res.status).toBe(200);
		expect(created[0].code).toBe('x_15x1');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/label-designer/router.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (dependency-injectable so tests don't touch the DB/printer)

```typescript
// tools/label-designer/router.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderTagSvgFromDimensions, renderZplFromDimensions } from '$lib/server/services/tag-render-service';
import * as formats from '$lib/server/services/label-format-service';
import { formStateToInput, formStateToDimensions, formStateToCtx, type FormState } from './form-model';
import { buildAlignmentBorderZpl } from './zpl-border';
import { renderBarbellPreviewSvg } from './barbell-svg';
import { sendZplToPrinter, parsePrinterTarget } from './printer';

export interface Deps {
	sendZpl: (zpl: string, host: string, port: number) => Promise<void>;
	getFormatByCode: typeof formats.getFormatByCode;
	createFormat: typeof formats.createFormat;
	updateFormat: typeof formats.updateFormat;
	listFormats: typeof formats.listFormats;
}

const defaults: Deps = {
	sendZpl: (zpl, host, port) => sendZplToPrinter(zpl, host, port),
	getFormatByCode: formats.getFormatByCode,
	createFormat: formats.createFormat,
	updateFormat: formats.updateFormat,
	listFormats: formats.listFormats
};

export function dbLabel(): string {
	const url = process.env.DATABASE_URL ?? '';
	const m = url.match(/@([^/]+)\/([^?]+)/);
	return m ? `${m[1]}/${m[2]}` : '(DATABASE_URL unset)';
}

export async function route(
	req: { method: string; path: string; body: any },
	deps: Partial<Deps> = {}
): Promise<{ status: number; json?: any; svg?: string; html?: string }> {
	const d = { ...defaults, ...deps };
	try {
		if (req.method === 'GET' && req.path === '/api/db') return { status: 200, json: { db: dbLabel() } };
		if (req.method === 'GET' && req.path === '/api/formats') {
			return { status: 200, json: { formats: await d.listFormats({ includeInactive: true }) } };
		}
		if (req.method === 'POST' && req.path === '/api/preview') {
			const f = req.body as FormState;
			if (f.mediaShape === 'barbell') return { status: 200, svg: await renderBarbellPreviewSvg(f) };
			const svg = await renderTagSvgFromDimensions(formStateToDimensions(f), formStateToCtx(f));
			return { status: 200, svg };
		}
		if (req.method === 'POST' && req.path === '/api/test-print') {
			const { form, mode, printer } = req.body as { form: FormState; mode: 'border' | 'sample'; printer: string };
			const zpl = mode === 'border'
				? buildAlignmentBorderZpl({ widthInches: form.widthIn, heightInches: form.heightIn, dpi: form.dpi, pads: form.mediaShape === 'barbell' ? form.pads : undefined })
				: renderZplFromDimensions(formStateToDimensions(form), formStateToCtx(form));
			const { host, port } = parsePrinterTarget(printer);
			await d.sendZpl(zpl, host, port);
			return { status: 200, json: { ok: true } };
		}
		if (req.method === 'POST' && req.path === '/api/save') {
			const input = formStateToInput(req.body as FormState);
			const existing = await d.getFormatByCode(input.code);
			const saved = existing ? await d.updateFormat(existing.id, input) : await d.createFormat(input);
			return { status: 200, json: { saved } };
		}
		return { status: 404, json: { error: 'not found' } };
	} catch (e) {
		return { status: 400, json: { error: e instanceof Error ? e.message : String(e) } };
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/label-designer/router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/label-designer/router.ts tests/unit/label-designer/router.test.ts
git commit -m "feat(label-designer): request router with injectable deps

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Browser UI + HTTP server + launcher

**Files:**
- Create: `tools/label-designer/ui/index.html`
- Create: `tools/label-designer/main.ts`
- Modify: `package.json` (add script + `vite-node` devDependency)

**Interfaces:**
- Consumes: `route`, `dbLabel` (Task 6).
- Produces: an HTTP server on `127.0.0.1:${LABEL_DESIGNER_PORT||5599}` serving `index.html` at `/` and dispatching JSON to `route`.

- [ ] **Step 1: Create the UI** (`tools/label-designer/ui/index.html`)

A single page: a form (code/name/layout/dpi/width/height, sheet fields, media_shape with a barbell pad editor, sample fields), a live `<img>`/inline `<div id="preview">` that POSTs `/api/preview` (debounced) and injects the returned SVG, a printer field + "Alignment border" / "Sample label" / test-print buttons hitting `/api/test-print`, and a "Save to DB" button (shows `dbLabel()` from `/api/db`, confirms, POSTs `/api/save`). Plain vanilla JS, no build step. Include element ids `#preview`, `#dbLabel`, `#saveBtn`, `#borderBtn`, `#sampleBtn`.

- [ ] **Step 2: Implement the server/launcher** (`tools/label-designer/main.ts`)

```typescript
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { route } from './router';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'ui/index.html'), 'utf8');
const port = parseInt(process.env.LABEL_DESIGNER_PORT ?? '5599', 10);

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost');
	if (req.method === 'GET' && url.pathname === '/') {
		res.writeHead(200, { 'content-type': 'text/html' });
		return res.end(html);
	}
	let body: any = undefined;
	if (req.method === 'POST') {
		const chunks: Buffer[] = [];
		for await (const c of req) chunks.push(c as Buffer);
		try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { body = {}; }
	}
	const r = await route({ method: req.method ?? 'GET', path: url.pathname, body });
	if (r.svg !== undefined) { res.writeHead(r.status, { 'content-type': 'image/svg+xml' }); return res.end(r.svg); }
	res.writeHead(r.status, { 'content-type': 'application/json' });
	res.end(JSON.stringify(r.json ?? {}));
});

server.listen(port, '127.0.0.1', () => {
	console.log(`label-designer: http://127.0.0.1:${port}`);
});
```

- [ ] **Step 3: Add the npm script + dep**

In `package.json` `scripts`: `"label-designer": "vite-node tools/label-designer/main.ts"`. Add `vite-node` to `devDependencies` (run `npm i -D vite-node`).

- [ ] **Step 4: Manual smoke (documented, not a unit test)**

Run: `DATABASE_URL="$DATABASE_URL" npm run label-designer` then open `http://127.0.0.1:5599`, confirm the page loads, the preview renders for a 1.5×1 rectangle, and the DB banner shows the target. (If `$env/static/private` fails to resolve under vite-node, add a fallback in `src/lib/server/db/index.ts`: `const url = DATABASE_URL ?? process.env.DATABASE_URL;` — guard import with try/catch — and re-run.)

- [ ] **Step 5: Commit**

```bash
git add tools/label-designer/ui/index.html tools/label-designer/main.ts package.json package-lock.json
git commit -m "feat(label-designer): browser UI + http server + npm script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: SSH tunnel helper + README

**Files:**
- Create: `tools/label-designer/tunnel.ts`
- Create: `tools/label-designer/README.md`
- Test: `tests/unit/label-designer/tunnel.test.ts`
- Modify: `tools/label-designer/main.ts` (open tunnel when `LABEL_DESIGNER_TUNNEL` set)

**Interfaces:**
- Produces: `buildTunnelArgs(sshHost: string, localPort: number, remotePort?: number): string[]`; `openTunnel(sshHost: string, localPort: number): Promise<() => void>`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/label-designer/tunnel.test.ts
import { describe, it, expect } from 'vitest';
import { buildTunnelArgs } from '../../../tools/label-designer/tunnel';

describe('buildTunnelArgs', () => {
	it('forwards localPort to remote 5432 by default', () => {
		expect(buildTunnelArgs('backoffice', 6432)).toEqual(['-fN', '-L', '6432:localhost:5432', 'backoffice']);
	});
	it('honors a custom remote port', () => {
		expect(buildTunnelArgs('hairydel', 6500, 5433)).toEqual(['-fN', '-L', '6500:localhost:5433', 'hairydel']);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/label-designer/tunnel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// tools/label-designer/tunnel.ts
import { spawn } from 'node:child_process';

export function buildTunnelArgs(sshHost: string, localPort: number, remotePort = 5432): string[] {
	return ['-fN', '-L', `${localPort}:localhost:${remotePort}`, sshHost];
}

export async function openTunnel(sshHost: string, localPort: number): Promise<() => void> {
	const child = spawn('ssh', buildTunnelArgs(sshHost, localPort), { stdio: 'ignore' });
	await new Promise((r) => setTimeout(r, 800));
	return () => { try { child.kill(); } catch { /* ignore */ } };
}
```

- [ ] **Step 4: Run test, then wire into main.ts**

Run: `npx vitest run tests/unit/label-designer/tunnel.test.ts` → PASS.
In `main.ts`, before `server.listen`, add:
```typescript
if (process.env.LABEL_DESIGNER_TUNNEL) {
	const { openTunnel } = await import('./tunnel');
	const localPort = parseInt((process.env.DATABASE_URL?.match(/:(\d+)\//)?.[1]) ?? '6432', 10);
	await openTunnel(process.env.LABEL_DESIGNER_TUNNEL, localPort);
	console.log(`label-designer: ssh tunnel to ${process.env.LABEL_DESIGNER_TUNNEL} on ${localPort}`);
}
```

- [ ] **Step 5: Write `README.md`** documenting run, env vars, the tunnel for prod (`ssh -fN -L 6432:localhost:5432 backoffice`), the alignment-border-first workflow, and the localhost-only safety note.

- [ ] **Step 6: Commit**

```bash
git add tools/label-designer/tunnel.ts tools/label-designer/README.md tools/label-designer/main.ts tests/unit/label-designer/tunnel.test.ts
git commit -m "feat(label-designer): ssh tunnel helper + README

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** local web app (T7) ✓; real-renderer preview (T1 refactor + T6 router) ✓; barbell pad editor + preview (T3 mapping, T5 svg, T7 UI) ✓; alignment border test print (T2, T6) ✓; sample test print (T6) ✓; direct DB write via service (T6 save, T8 tunnel) ✓; load/clone existing (T6 `/api/formats`, T7 UI) ✓; shows target DB + confirm (T6 `dbLabel`, T7 UI) ✓; localhost-only (T7) ✓.

**Placeholders:** UI HTML (T7 S1) is described, not shown in full — acceptable as it's boilerplate vanilla form markup with the named element ids; everything testable has complete code.

**Type consistency:** `FormState` defined in T3, consumed by T5/T6/T7 with matching field names. `route`/`Deps` in T6 used by T7. `buildAlignmentBorderZpl` opts match between T2 and T6. `renderZplFromDimensions`/`renderTagSvgFromDimensions` defined T1, consumed T6.
