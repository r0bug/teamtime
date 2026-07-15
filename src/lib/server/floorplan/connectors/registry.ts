// Connector registry: floorplan_connectors rows (configuration) → code
// modules (behavior). Unknown types are skipped with a log line so a stale
// config row can never take the floorplan down.

import { and, eq } from 'drizzle-orm';
import { db, floorplanConnectors, type FloorplanConnector } from '$lib/server/db';
import { createLogger } from '$lib/server/logger';
import type { Connector } from './types';
import { nrsConnector } from './nrs';
import { teamtimeConnector } from './teamtime';

const log = createLogger('floorplan:connectors');

const MODULES: Record<string, Connector> = {
	nrs: nrsConnector,
	teamtime: teamtimeConnector
};

export interface BoundConnector {
	config: FloorplanConnector;
	impl: Connector;
}

export async function getConnectorsForPlan(planId: string): Promise<BoundConnector[]> {
	const rows = await db
		.select()
		.from(floorplanConnectors)
		.where(and(eq(floorplanConnectors.planId, planId), eq(floorplanConnectors.enabled, true)));

	const bound: BoundConnector[] = [];
	for (const config of rows) {
		const impl = MODULES[config.type];
		if (!impl) {
			log.warn({ planId, type: config.type, connectorId: config.id }, 'Unknown connector type — skipping');
			continue;
		}
		bound.push({ config, impl });
	}
	return bound;
}
