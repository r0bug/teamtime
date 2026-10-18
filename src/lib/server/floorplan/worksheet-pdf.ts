// Floorplan worksheet as a vector PDF, written by hand (rects, lines,
// Helvetica text) — no PDF dependency. Landscape, minimal margins, the grid
// fills the page; a final page carries the how-to and color legend.
//
// Coordinates follow the editor: +x east, +y NORTH (north is up on paper).

import { autoColor } from '$lib/floorplan/colors';

export interface WorksheetCell {
	x: number;
	y: number;
	attrs: Record<string, string>;
}
export interface WorksheetInput {
	planName: string;
	cells: WorksheetCell[];
	vendorsById: Record<string, { code: string | null; name: string }>;
	pools: { name: string; color: string }[];
	zonePalette: Record<string, string> | null;
	section: { minX: number; minY: number; maxX: number; maxY: number };
	sectionLabel: string;
	paper: 'letter' | 'legal' | 'tabloid';
	/** cells per inch; 0 = fit the section on one page */
	cellsPerInch: number;
	shade: 'vendor' | 'zone' | 'kind' | 'none';
	labels: boolean;
	coords: boolean;
	marginIn: number;
	printedBy: string;
}

const PT = 72;
const PAPER: Record<WorksheetInput['paper'], [number, number]> = { letter: [11, 8.5], legal: [14, 8.5], tabloid: [17, 11] }; // landscape, inches
const KIND_PRINT: Record<string, [number, number, number]> = { sellable: [1, 1, 1], structure: [0.29, 0.33, 0.39], boh: [0.9, 0.91, 0.92], circ: [0.97, 0.98, 0.99] };

type RGB = [number, number, number];
function hslToRgb(h: number, s: number, l: number): RGB {
	s /= 100; l /= 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0), f(8), f(4)];
}
/** Parse hsl()/#hex and lighten for print (black text must read on it). */
function printColor(color: string): RGB {
	const m = color.match(/^hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)$/);
	if (m) return hslToRgb(Number(m[1]), 55, 82);
	const hex = color.match(/^#([0-9a-f]{6})$/i);
	if (hex) {
		const n = parseInt(hex[1], 16);
		const mix = (c: number) => (c + (255 - c) * 0.6) / 255;
		return [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
	}
	return [0.9, 0.9, 0.9];
}
const f3 = (n: number) => (Math.round(n * 1000) / 1000).toString();
const rgb = (c: RGB) => `${f3(c[0])} ${f3(c[1])} ${f3(c[2])}`;
function pdfText(s: string): string {
	// WinAnsi-safe: escape PDF specials, drop anything outside Latin-1.
	return s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
/** Approximate Helvetica width (pt) for centering/fitting - 0.55em average. */
const textWidth = (s: string, size: number) => s.length * size * 0.55;

class PdfBuilder {
	private objects: string[] = [];
	private pages: number[] = [];
	private fontId: number;
	constructor() {
		this.fontId = this.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
		this.boldId = this.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
	}
	private boldId: number;
	private add(body: string): number {
		this.objects.push(body);
		return this.objects.length; // 1-based object number
	}
	addPage(wPt: number, hPt: number, content: string): void {
		const stream = this.add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
		const page = this.add(`<< /Type /Page /Parent PARENT /MediaBox [0 0 ${f3(wPt)} ${f3(hPt)}] /Contents ${stream} 0 R /Resources << /Font << /F1 ${this.fontId} 0 R /F2 ${this.boldId} 0 R >> >> >>`);
		this.pages.push(page);
	}
	build(): Buffer {
		const pagesId = this.objects.length + 1;
		const kids = this.pages.map((p) => `${p} 0 R`).join(' ');
		this.objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`);
		const catalogId = this.objects.length + 1;
		this.objects.push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
		const parts: string[] = ['%PDF-1.4\n'];
		const offsets: number[] = [];
		let pos = Buffer.byteLength(parts[0], 'latin1');
		this.objects.forEach((body, i) => {
			const text = `${i + 1} 0 obj\n${body.replace('PARENT', `${pagesId} 0 R`)}\nendobj\n`;
			offsets.push(pos);
			parts.push(text);
			pos += Buffer.byteLength(text, 'latin1');
		});
		const xref = `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${this.objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
		parts.push(xref);
		return Buffer.from(parts.join(''), 'latin1');
	}
}

export function renderWorksheetPdf(input: WorksheetInput): Buffer {
	const { section: sec, cells, marginIn } = input;
	const [pwIn, phIn] = PAPER[input.paper];
	const W = pwIn * PT, H = phIn * PT, M = marginIn * PT;
	const headerPt = 14; // one text line
	const coordPt = input.coords ? 11 : 0;
	const drawW = W - 2 * M - coordPt;
	const drawH = H - 2 * M - headerPt - coordPt;
	const secW = sec.maxX - sec.minX + 1, secH = sec.maxY - sec.minY + 1;
	const cellPt = input.cellsPerInch > 0 ? PT / input.cellsPerInch : Math.min(drawW / secW, drawH / secH);
	const across = input.cellsPerInch > 0 ? Math.max(1, Math.floor(drawW / cellPt)) : secW;
	const down = input.cellsPerInch > 0 ? Math.max(1, Math.floor(drawH / cellPt)) : secH;

	const cellMap = new Map<string, WorksheetCell>(cells.map((c) => [`${c.x},${c.y}`, c]));
	const at = (x: number, y: number) => cellMap.get(`${x},${y}`);
	const poolColor = new Map(input.pools.map((p) => [p.name, p.color]));
	const outlineKey = (c: WorksheetCell | undefined) => (!c ? null : c.attrs.vendor_id ? `v:${c.attrs.vendor_id}` : c.attrs.pool ? `p:${c.attrs.pool}` : null);
	const fillFor = (c: WorksheetCell): RGB | null => {
		const a = c.attrs;
		if (a.kind === 'structure') return KIND_PRINT.structure;
		if (input.shade === 'vendor') {
			if (a.vendor_id) return printColor(autoColor(a.vendor_id));
			if (a.pool) return printColor(poolColor.get(a.pool) ?? autoColor(a.pool));
		} else if (input.shade === 'zone' && a.zone) {
			return printColor(input.zonePalette?.[a.zone] ?? autoColor(a.zone));
		} else if (input.shade === 'kind' && a.kind) {
			return KIND_PRINT[a.kind] ?? [0.93, 0.93, 0.93];
		}
		return a.kind ? KIND_PRINT[a.kind] ?? null : null;
	};

	const pdf = new PdfBuilder();
	const sheets: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
	const cols = Math.ceil(secW / across), rows = Math.ceil(secH / down);
	// Sheets run west→east, then NORTH→south (top of the map first).
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			const minX = sec.minX + c * across, maxY = sec.maxY - r * down;
			sheets.push({ minX, maxX: Math.min(sec.maxX, minX + across - 1), maxY, minY: Math.max(sec.minY, maxY - down + 1) });
		}
	const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric' });

	sheets.forEach((s, idx) => {
		const w = s.maxX - s.minX + 1, h = s.maxY - s.minY + 1;
		// Grid origin (bottom-left of the grid on the page), grid fills the page; centre if smaller.
		const gridW = w * cellPt, gridH = h * cellPt;
		const ox = M + coordPt + (drawW - gridW) / 2;
		const oy = M + (drawH - gridH) / 2;
		// PDF y goes UP — same as floorplan north. Cell (x,y) → bottom-left at (ox + (x-minX)*cell, oy + (y-minY)*cell).
		const px = (x: number) => ox + (x - s.minX) * cellPt;
		const py = (y: number) => oy + (y - s.minY) * cellPt;
		const out: string[] = [];
		// header line
		out.push(`BT /F2 9 Tf ${f3(M)} ${f3(H - M - 9)} Td (${pdfText(`${input.planName} - floorplan worksheet${input.sectionLabel ? `, ${input.sectionLabel}` : ''}${sheets.length > 1 ? ` - sheet ${idx + 1} of ${sheets.length}` : ''}`)}) Tj ET`);
		const meta = `cells ${s.minX},${s.minY} - ${s.maxX},${s.maxY} · 1 cell = 1 ft · north up · printed ${today}${input.printedBy ? ` by ${input.printedBy}` : ''}`;
		out.push(`BT /F1 7 Tf ${f3(W - M - textWidth(meta, 7))} ${f3(H - M - 9)} Td (${pdfText(meta)}) Tj ET`);
		// cells
		for (let y = s.minY; y <= s.maxY; y++)
			for (let x = s.minX; x <= s.maxX; x++) {
				const c = at(x, y);
				if (!c) continue;
				const fill = fillFor(c);
				if (fill) out.push(`${rgb(fill)} rg ${f3(px(x))} ${f3(py(y))} ${f3(cellPt)} ${f3(cellPt)} re f`);
				if (c.attrs.door === 'true') out.push(`0.61 0.64 0.69 rg ${f3(px(x) + cellPt * 0.25)} ${f3(py(y) + cellPt * 0.25)} ${f3(cellPt * 0.5)} ${f3(cellPt * 0.5)} re f`);
				if (c.attrs.level && input.shade !== 'none') out.push(`0.61 0.64 0.69 RG ${f3(cellPt * 0.04)} w ${f3(px(x))} ${f3(py(y))} m ${f3(px(x) + cellPt)} ${f3(py(y) + cellPt)} l S`);
			}
		// fine grid
		out.push(`0.78 0.8 0.83 RG ${f3(Math.max(0.2, cellPt * 0.02))} w`);
		for (let k = 0; k <= w; k++) out.push(`${f3(px(s.minX + k))} ${f3(oy)} m ${f3(px(s.minX + k))} ${f3(oy + gridH)} l S`);
		for (let k = 0; k <= h; k++) out.push(`${f3(ox)} ${f3(py(s.minY + k))} m ${f3(ox + gridW)} ${f3(py(s.minY + k))} l S`);
		// heavy grid every 10 (absolute coordinates)
		out.push(`0.42 0.45 0.5 RG ${f3(Math.max(0.5, cellPt * 0.05))} w`);
		for (let k = 0; k <= w; k++) if ((s.minX + k) % 10 === 0) out.push(`${f3(px(s.minX + k))} ${f3(oy)} m ${f3(px(s.minX + k))} ${f3(oy + gridH)} l S`);
		for (let k = 0; k <= h; k++) if ((s.minY + k) % 10 === 0) out.push(`${f3(ox)} ${f3(py(s.minY + k))} m ${f3(ox + gridW)} ${f3(py(s.minY + k))} l S`);
		// zone boundaries (dashed blue) and booth outlines (black)
		const zoneSeg: string[] = [], boothSeg: string[] = [];
		for (let y = s.minY; y <= s.maxY; y++)
			for (let x = s.minX; x <= s.maxX; x++) {
				const c = at(x, y), k = outlineKey(c), z = c?.attrs.zone ?? null;
				const e = at(x + 1, y), n = at(x, y + 1);
				const X0 = px(x), X1 = px(x) + cellPt, Y0 = py(y), Y1 = py(y) + cellPt;
				if (k !== outlineKey(e) && (k || outlineKey(e))) boothSeg.push(`${f3(X1)} ${f3(Y0)} m ${f3(X1)} ${f3(Y1)} l`);
				if (z !== (e?.attrs.zone ?? null) && (z || e?.attrs.zone)) zoneSeg.push(`${f3(X1)} ${f3(Y0)} m ${f3(X1)} ${f3(Y1)} l`);
				if (k !== outlineKey(n) && (k || outlineKey(n))) boothSeg.push(`${f3(X0)} ${f3(Y1)} m ${f3(X1)} ${f3(Y1)} l`);
				if (z !== (n?.attrs.zone ?? null) && (z || n?.attrs.zone)) zoneSeg.push(`${f3(X0)} ${f3(Y1)} m ${f3(X1)} ${f3(Y1)} l`);
				if (x === s.minX && k) boothSeg.push(`${f3(X0)} ${f3(Y0)} m ${f3(X0)} ${f3(Y1)} l`);
				if (y === s.minY && k) boothSeg.push(`${f3(X0)} ${f3(Y0)} m ${f3(X1)} ${f3(Y0)} l`);
			}
		if (zoneSeg.length) out.push(`0.15 0.39 0.92 RG ${f3(Math.max(0.6, cellPt * 0.08))} w [${f3(cellPt * 0.3)} ${f3(cellPt * 0.2)}] 0 d ${zoneSeg.join(' ')} S [] 0 d`);
		if (boothSeg.length) out.push(`0.07 0.09 0.15 RG ${f3(Math.max(0.8, cellPt * 0.12))} w 2 J ${boothSeg.join(' ')} S 0 J`);
		// coordinates
		if (input.coords) {
			const fs = Math.max(4, Math.min(7, cellPt * 0.45));
			out.push(`0.22 0.25 0.32 rg`);
			for (let k = 0; k <= w; k++) if ((s.minX + k) % 5 === 0) out.push(`BT /F1 ${f3(fs)} Tf ${f3(px(s.minX + k) - textWidth(String(s.minX + k), fs) / 2)} ${f3(oy + gridH + 2)} Td (${s.minX + k}) Tj ET`);
			for (let k = 0; k <= h; k++) if ((s.minY + k) % 5 === 0) out.push(`BT /F1 ${f3(fs)} Tf ${f3(ox - 2 - textWidth(String(s.minY + k), fs))} ${f3(py(s.minY + k) - fs * 0.35)} Td (${s.minY + k}) Tj ET`);
		}
		// labels: one per booth/pool within the sheet, at the centroid
		if (input.labels) {
			const acc = new Map<string, { sx: number; sy: number; n: number; text: string; sub: string }>();
			for (const c of cells) {
				if (c.x < s.minX || c.x > s.maxX || c.y < s.minY || c.y > s.maxY) continue;
				const k = outlineKey(c);
				if (!k) continue;
				const v = c.attrs.vendor_id ? input.vendorsById[c.attrs.vendor_id] : undefined;
				const text = c.attrs.vendor_id ? (v?.code ?? `#${c.attrs.vendor_id}`) : c.attrs.pool!;
				const sub = c.attrs.vendor_id ? (v?.name ?? '') : 'pool';
				const e = acc.get(k) ?? { sx: 0, sy: 0, n: 0, text, sub };
				e.sx += px(c.x) + cellPt / 2; e.sy += py(c.y) + cellPt / 2; e.n++;
				acc.set(k, e);
			}
			for (const e of acc.values()) {
				const cx = e.sx / e.n, cy = e.sy / e.n;
				const fs = Math.max(5, Math.min(cellPt * 1.4, Math.sqrt(e.n) * cellPt * 0.35));
				// white halo (stroke) then black fill
				out.push(`BT /F2 ${f3(fs)} Tf 2 Tr 1 1 1 RG ${f3(fs * 0.12)} w ${f3(cx - textWidth(e.text, fs) / 2)} ${f3(cy - fs * 0.35)} Td (${pdfText(e.text)}) Tj ET`);
				out.push(`BT /F2 ${f3(fs)} Tf 0 Tr 0.07 0.09 0.15 rg ${f3(cx - textWidth(e.text, fs) / 2)} ${f3(cy - fs * 0.35)} Td (${pdfText(e.text)}) Tj ET`);
				if (e.n >= 12) {
					const sub = `${e.n} sq ft${e.sub ? ` · ${e.sub}` : ''}`;
					const sfs = fs * 0.45;
					out.push(`BT /F1 ${f3(sfs)} Tf 2 Tr 1 1 1 RG ${f3(sfs * 0.15)} w ${f3(cx - textWidth(sub, sfs) / 2)} ${f3(cy - fs * 0.35 - sfs * 1.1)} Td (${pdfText(sub)}) Tj ET`);
					out.push(`BT /F1 ${f3(sfs)} Tf 0 Tr 0.22 0.25 0.32 rg ${f3(cx - textWidth(sub, sfs) / 2)} ${f3(cy - fs * 0.35 - sfs * 1.1)} Td (${pdfText(sub)}) Tj ET`);
				}
			}
		}
		pdf.addPage(W, H, out.join('\n'));
	});

	// Final page: how to record a change + color legend
	{
		const out: string[] = [];
		let y = H - M - 14;
		const line = (t: string, size = 9, bold = false, indent = 0) => { out.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${f3(M + indent)} ${f3(y)} Td (${pdfText(t)}) Tj ET`); y -= size * 1.45; };
		line(`${input.planName} - recording a change on the worksheet`, 12, true);
		y -= 4;
		line('Cells are x,y. x counts across from the left edge (numbers along the top). y counts UP from the bottom - north is up, as in the editor (numbers along the left). 1 cell = 1 ft.');
		line('A rectangle is x1,y1-x2,y2 (corner to corner, inclusive). Write one change per line, then type the lines into TeamTime: Floorplan > Worksheet > "Enter changes by text".');
		y -= 4;
		line('78,20-87,28 GSE', 9, true, 10); y += 9 * 1.45; line('vendor GSE takes that rectangle', 9, false, 150);
		line('60,31 BMC', 9, true, 10); y += 9 * 1.45; line('one cell', 9, false, 150);
		line('40,50-45,55 pool G&G', 9, true, 10); y += 9 * 1.45; line('shared space (pool)', 9, false, 150);
		line('70,12-72,14 clear', 9, true, 10); y += 9 * 1.45; line('empty those cells', 9, false, 150);
		y -= 4;
		line('Only sellable cells (white or colored) take a vendor; walls (dark gray) and back-of-house (light gray) are skipped automatically.');
		line('Dashed blue lines are zone boundaries; heavy black lines are booth edges; small gray squares are doors; a diagonal marks a raised level.');
		y -= 8;
		// legend
		const items: { color: RGB; text: string }[] = [];
		if (input.shade === 'vendor') {
			const seen = new Map<string, string>();
			for (const c of cells) if (c.attrs.vendor_id && !seen.has(c.attrs.vendor_id)) seen.set(c.attrs.vendor_id, input.vendorsById[c.attrs.vendor_id]?.code ?? `#${c.attrs.vendor_id}`);
			for (const [id, code] of [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))) items.push({ color: printColor(autoColor(id)), text: `${code}  ${input.vendorsById[id]?.name ?? ''}`.trim() });
			for (const p of input.pools) items.push({ color: printColor(p.color), text: `pool ${p.name}` });
		} else if (input.shade === 'zone') {
			const zones = [...new Set(cells.map((c) => c.attrs.zone).filter((z): z is string => !!z))].sort();
			for (const z of zones) items.push({ color: printColor(input.zonePalette?.[z] ?? autoColor(z)), text: `zone ${z}` });
		} else if (input.shade === 'kind') {
			for (const [k, color] of Object.entries(KIND_PRINT)) items.push({ color, text: k });
		}
		if (items.length) {
			line('Legend', 10, true);
			const colW = (W - 2 * M) / 3;
			let col = 0, rowY = y;
			for (const it of items) {
				const x = M + col * colW;
				out.push(`${rgb(it.color)} rg 0.3 0.3 0.3 RG 0.5 w ${f3(x)} ${f3(rowY - 7)} 12 8 re B`);
				out.push(`BT /F1 8 Tf 0 0 0 rg ${f3(x + 16)} ${f3(rowY - 6)} Td (${pdfText(it.text.slice(0, 40))}) Tj ET`);
				col++;
				if (col === 3) { col = 0; rowY -= 12; }
				if (rowY < M + 20) break;
			}
		}
		pdf.addPage(W, H, out.join('\n'));
	}
	return pdf.build();
}
