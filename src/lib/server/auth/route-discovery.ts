// Route Discovery Service
// Scans the filesystem to discover routes and form actions for permission management

import { db, permissions } from '$lib/server/db';
import { eq, and, isNull } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface DiscoveredRoute {
	routePattern: string;
	module: string;
	hasPage: boolean;
	actions: string[];
	filePath: string;
}

/**
 * Discover all routes in the (app) directory
 */
export async function discoverRoutes(): Promise<DiscoveredRoute[]> {
	const routesDir = path.resolve(process.cwd(), 'src/routes/(app)');
	const routes: DiscoveredRoute[] = [];

	if (!fs.existsSync(routesDir)) {
		console.log('[Route Discovery] Routes directory not found:', routesDir);
		return routes;
	}

	await scanDirectory(routesDir, '', routes);
	return routes;
}

/**
 * Recursively scan a directory for route files
 */
async function scanDirectory(
	baseDir: string,
	currentPath: string,
	routes: DiscoveredRoute[]
): Promise<void> {
	const fullPath = path.join(baseDir, currentPath);

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(fullPath, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (entry.isDirectory()) {
			// Skip groups (parentheses) in path calculation but recurse into them
			const nextPath = entry.name.startsWith('(')
				? currentPath
				: path.join(currentPath, entry.name);

			await scanDirectory(baseDir, path.join(currentPath, entry.name), routes);
		} else if (entry.name === '+page.server.ts' || entry.name === '+page.svelte') {
			const routePattern = '/' + currentPath.replace(/\\/g, '/').replace(/^\/*/, '').replace(/\/*$/, '') || '/';
			const module = extractModule(routePattern);
			const filePath = path.join(fullPath, entry.name);

			// Find existing route or create new
			let route = routes.find((r) => r.routePattern === routePattern);
			if (!route) {
				route = {
					routePattern,
					module,
					hasPage: false,
					actions: [],
					filePath: path.join(fullPath, '+page.server.ts')
				};
				routes.push(route);
			}

			if (entry.name === '+page.svelte') {
				route.hasPage = true;
			}

			if (entry.name === '+page.server.ts') {
				// Parse the file to find actions
				const actions = await extractActions(filePath);
				route.actions = [...new Set([...route.actions, ...actions])];
			}
		}
	}
}

/**
 * Extract module name from route pattern
 */
function extractModule(routePattern: string): string {
	const parts = routePattern.split('/').filter(Boolean);
	if (parts.length === 0) return 'dashboard';

	// First segment is usually the module
	const first = parts[0];

	// Handle common patterns
	if (first === 'admin') {
		if (parts[1]) return `admin/${parts[1]}`;
		return 'admin';
	}

	return first;
}

/**
 * Extract form actions from a +page.server.ts file
 */
async function extractActions(filePath: string): Promise<string[]> {
	const actions: string[] = [];

	try {
		const content = fs.readFileSync(filePath, 'utf-8');

		// Look for "export const actions = { ... }" pattern
		// Match both "actions = {" and "actions: Actions = {"
		const actionsMatch = content.match(/export\s+const\s+actions\s*(?::\s*\w+)?\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);

		if (actionsMatch) {
			const actionsBlock = actionsMatch[1];

			// Extract action names (keys in the object)
			// Match: "actionName: async" or "actionName(" or "'action-name':" etc
			const actionPattern = /(?:^|[,{])\s*(?:'([^']+)'|"([^"]+)"|(\w+))\s*(?::|(?=\())/gm;

			let match;
			while ((match = actionPattern.exec(actionsBlock)) !== null) {
				const actionName = match[1] || match[2] || match[3];
				if (actionName && !['async', 'function', 'const', 'let', 'var', 'return'].includes(actionName)) {
					actions.push(actionName);
				}
			}
		}
	} catch (error) {
		console.log(`[Route Discovery] Error parsing ${filePath}:`, error);
	}

	return actions;
}

/**
 * Sync discovered routes to the permissions table
 * Only adds new permissions, doesn't remove existing ones
 */
export async function syncPermissions(): Promise<{
	added: number;
	existing: number;
	routes: DiscoveredRoute[];
}> {
	const routes = await discoverRoutes();
	let added = 0;
	let existing = 0;

	for (const route of routes) {
		if (!route.hasPage) continue;

		// Check/add page-level permission
		const pagePermName = formatPermissionName(route.routePattern, null);
		const [existingPagePerm] = await db
			.select()
			.from(permissions)
			.where(
				and(eq(permissions.routePattern, route.routePattern), isNull(permissions.actionName))
			)
			.limit(1);

		if (existingPagePerm) {
			existing++;
		} else {
			await db.insert(permissions).values({
				routePattern: route.routePattern,
				actionName: null,
				name: pagePermName,
				description: `Access to ${route.routePattern}`,
				module: route.module,
				isAutoDiscovered: true,
				defaultGranted: !route.routePattern.startsWith('/admin'),
				requiresRole: inferRequiredRole(route.routePattern)
			});
			added++;
		}

		// Check/add action-level permissions
		for (const action of route.actions) {
			const actionPermName = formatPermissionName(route.routePattern, action);
			const [existingActionPerm] = await db
				.select()
				.from(permissions)
				.where(
					and(
						eq(permissions.routePattern, route.routePattern),
						eq(permissions.actionName, action)
					)
				)
				.limit(1);

			if (existingActionPerm) {
				existing++;
			} else {
				await db.insert(permissions).values({
					routePattern: route.routePattern,
					actionName: action,
					name: actionPermName,
					description: `Action: ${action} on ${route.routePattern}`,
					module: route.module,
					isAutoDiscovered: true,
					defaultGranted: !route.routePattern.startsWith('/admin'),
					requiresRole: inferRequiredRole(route.routePattern)
				});
				added++;
			}
		}
	}

	return { added, existing, routes };
}

/**
 * Format a human-readable permission name
 */
function formatPermissionName(routePattern: string, actionName: string | null): string {
	// Convert route pattern to readable name
	const parts = routePattern.split('/').filter(Boolean);
	const routeName = parts
		.map((p) => {
			// Handle dynamic segments like [id]
			if (p.startsWith('[') && p.endsWith(']')) {
				return p.slice(1, -1);
			}
			// Handle rest parameters like [...rest]
			if (p.startsWith('[...') && p.endsWith(']')) {
				return p.slice(4, -1);
			}
			return p;
		})
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join(' > ');

	if (actionName) {
		// Format action name: createUser -> Create User
		const formattedAction = actionName
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, (s) => s.toUpperCase())
			.trim();
		return `${routeName}: ${formattedAction}`;
	}

	return routeName || 'Dashboard';
}

/**
 * Infer required role based on route pattern
 */
function inferRequiredRole(routePattern: string): 'admin' | 'manager' | 'purchaser' | 'staff' | null {
	if (routePattern.startsWith('/admin')) return 'admin';
	if (routePattern.includes('/manage') || routePattern.includes('/approve')) return 'manager';
	if (routePattern.startsWith('/purchases') || routePattern.startsWith('/atm')) return 'purchaser';
	return null;
}

/**
 * Get summary of discovered routes
 */
export async function getDiscoverySummary(): Promise<{
	totalRoutes: number;
	totalActions: number;
	byModule: Record<string, { routes: number; actions: number }>;
}> {
	const routes = await discoverRoutes();

	const byModule: Record<string, { routes: number; actions: number }> = {};
	let totalActions = 0;

	for (const route of routes) {
		if (!route.hasPage) continue;

		if (!byModule[route.module]) {
			byModule[route.module] = { routes: 0, actions: 0 };
		}
		byModule[route.module].routes++;
		byModule[route.module].actions += route.actions.length;
		totalActions += route.actions.length;
	}

	return {
		totalRoutes: routes.filter((r) => r.hasPage).length,
		totalActions,
		byModule
	};
}
