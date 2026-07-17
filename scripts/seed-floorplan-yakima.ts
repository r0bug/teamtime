/**
 * Seed the "Yakima Finds" floorplan from scripts/data/yakima-finds-floorplan.json
 * (the canonical schema-1.0 survey, surveyed 2026-07-12).
 *
 * Rasterizes envelope/zones/fixed-structures into 1 ft² floorplan_cell_attrs
 * rows (see src/lib/server/floorplan/rasterize.ts for the geometry rules),
 * then loads attr defs + connectors (defined below — the survey carries
 * geometry only). No vendor_id assignments are seeded — staff assign vendors
 * in Edit mode. The North Warehouse and parking lot are intentionally absent
 * (void until rented; see the survey's open_questions).
 *
 * Idempotent: skips if a plan named "Yakima Finds" already exists.
 * Re-seed from scratch with --force (deletes that plan; cascades wipe its
 * cells/attr defs/connectors — floorplan data only, nothing else).
 *
 * Run: npx vite-node scripts/seed-floorplan-yakima.ts [-- --force]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';
import { rasterizeSurvey, cellMapToRows, type FloorplanSurvey } from '../src/lib/server/floorplan/rasterize';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

// Canvas layout: the building floats with a uniform void margin on all
// sides (elbow room for painting outward — future warehouse/parking are
// void until rented). ORIGIN_OFFSET translates the survey frame (origin =
// west/south wall lines) onto the canvas: canvas = survey + OFFSET.
const ORIGIN_OFFSET = 20;
const GRID_W = 144; // 104-cell building span + 2 × 20 margin
const GRID_H = 109; // 69-cell building span + 2 × 20 margin

// Render/visibility config (spec §2.3). The survey file is geometry-only.
const ATTR_DEFS = [
	{
		key: 'kind',
		type: 'enum',
		owner_system: 'floorplan',
		visibility: 'public',
		render_hint: {
			mode: 'fill',
			palette: { sellable: '#1C2630', structure: '#3A4550', boh: '#2C2640', circ: '#20323C' }
		}
	},
	{
		key: 'zone',
		type: 'categorical',
		owner_system: 'floorplan',
		visibility: 'public',
		render_hint: {
			mode: 'fill',
			palette: { main: '#1B2730', storsly: '#2E2A18', backroom: '#241E2E', ralph: '#202020' }
		}
	},
	{
		key: 'vendor_id',
		type: 'categorical',
		owner_system: 'floorplan',
		visibility: 'public',
		render_hint: { mode: 'fill', palette: 'auto' }
	},
	{
		key: 'level',
		type: 'enum',
		owner_system: 'floorplan',
		visibility: 'staff',
		render_hint: { mode: 'fill', palette: { raised18: '#4A3A20' } }
	},
	{
		key: 'label',
		type: 'categorical',
		owner_system: 'floorplan',
		visibility: 'staff',
		render_hint: null
	},
	{
		key: 'door',
		type: 'boolean',
		owner_system: 'floorplan',
		visibility: 'public',
		render_hint: null
	}
];

const CONNECTORS = [
	{ type: 'nrs', label: 'NRS Billing', join_attr: 'vendor_id', caps: { resolve: true, render: false }, enabled: true },
	{ type: 'teamtime', label: 'TeamTime', join_attr: 'vendor_id', caps: { resolve: true, render: true }, enabled: true }
];

const force = process.argv.includes('--force');
const seedPath = resolve(dirname(fileURLToPath(import.meta.url)), 'data/yakima-finds-floorplan.json');
const survey = JSON.parse(readFileSync(seedPath, 'utf8')) as FloorplanSurvey;

const sql = postgres(url);

async function main() {
	const planName = survey.site.name;
	const existing = await sql`SELECT id FROM floorplan_plans WHERE name = ${planName}`;
	if (existing.length > 0) {
		if (!force) {
			console.log(`Plan "${planName}" already exists (${existing[0].id}) — skipping. Use --force to re-seed.`);
			return;
		}
		console.log(`--force: deleting existing plan ${existing[0].id} (cascades to cells/defs/connectors)`);
		await sql`DELETE FROM floorplan_plans WHERE id = ${existing[0].id}`;
	}

	const cells = rasterizeSurvey(survey);
	const rows = cellMapToRows(cells).map((r) => ({ ...r, x: r.x + ORIGIN_OFFSET, y: r.y + ORIGIN_OFFSET }));
	console.log(`Rasterized ${cells.size} painted cells → ${rows.length} attr rows`);

	await sql.begin(async (tx) => {
		const [plan] = await tx`
			INSERT INTO floorplan_plans (name, grid_w, grid_h)
			VALUES (${planName}, ${GRID_W}, ${GRID_H})
			RETURNING id
		`;
		const planId = plan.id as string;

		const CHUNK = 2000;
		for (let i = 0; i < rows.length; i += CHUNK) {
			const chunk = rows.slice(i, i + CHUNK).map((r) => ({ plan_id: planId, ...r }));
			await tx`INSERT INTO floorplan_cell_attrs ${tx(chunk, 'plan_id', 'x', 'y', 'key', 'value')}`;
		}

		for (const def of ATTR_DEFS) {
			await tx`
				INSERT INTO floorplan_attr_defs (plan_id, key, type, owner_system, visibility, render_hint)
				VALUES (${planId}, ${def.key}, ${def.type}, ${def.owner_system}, ${def.visibility},
					${def.render_hint ? tx.json(def.render_hint) : null})
			`;
		}

		for (const conn of CONNECTORS) {
			await tx`
				INSERT INTO floorplan_connectors (plan_id, type, label, join_attr, caps, enabled)
				VALUES (${planId}, ${conn.type}, ${conn.label}, ${conn.join_attr}, ${tx.json(conn.caps)}, ${conn.enabled})
			`;
		}

		console.log(`Seeded plan ${planId}`);
	});

	// Verification (spec §7.4)
	const kindCounts = await sql`
		SELECT value, count(*)::int AS cells FROM floorplan_cell_attrs ca
		JOIN floorplan_plans p ON p.id = ca.plan_id
		WHERE p.name = ${planName} AND ca.key = 'kind' GROUP BY value ORDER BY cells DESC
	`;
	const zoneCounts = await sql`
		SELECT value, count(*)::int AS cells FROM floorplan_cell_attrs ca
		JOIN floorplan_plans p ON p.id = ca.plan_id
		WHERE p.name = ${planName} AND ca.key = 'zone' GROUP BY value ORDER BY cells DESC
	`;
	const doors = await sql`
		SELECT x, y FROM floorplan_cell_attrs ca
		JOIN floorplan_plans p ON p.id = ca.plan_id
		WHERE p.name = ${planName} AND ca.key = 'door' ORDER BY y
	`;
	console.log('kind:', Object.fromEntries(kindCounts.map((r) => [r.value, r.cells])));
	console.log('zone:', Object.fromEntries(zoneCounts.map((r) => [r.value, r.cells])));
	console.log('doors:', doors.map((r) => `(${r.x},${r.y})`).join(' ') || 'NONE');
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => sql.end());
