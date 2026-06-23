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
