// Client-side mirror of the server's GEOMETRY_KEYS
// (src/lib/server/floorplan/permissions.ts) — keys only Build mode paints.
// Keep the two in sync; the server remains the enforcer.
export const GEOMETRY_KEYS = new Set(['kind', 'door', 'label', 'level']);
