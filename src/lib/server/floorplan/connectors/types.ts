// Connector contract (spec §4). Connectors are the ONLY place where external
// meaning (rent, sales, status) touches the floorplan. The core stores keys
// and counts cells; a connector resolves the values of one cell attribute
// (its joinAttribute) into labeled data for hover popovers, and may supply a
// keyed table for transient render injection. Connectors never write to
// their upstream system.

export type ConnectorResult = Record<string, Record<string, unknown>>;

export interface Connector {
	type: 'nrs' | 'teamtime';
	/** Cell attribute this connector keys on, e.g. 'vendor_id'. */
	joinAttribute: string;
	caps: { resolve: boolean; render: boolean };
	/** Fields this connector exposes (for the Build-mode connector UI). */
	schema(): { name: string; type: string }[];
	/** Resolve attribute values → { value: { field: data } }. Missing values simply absent. */
	resolve(keys: string[]): Promise<ConnectorResult>;
	/** Optional keyed table for render injection (spec §3.4): rows of { [joinAttribute], v }. */
	renderData?(): Promise<Record<string, number>>;
}
