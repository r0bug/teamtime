// FileReaderService - Secure file reading for AI context
// Used by the Architecture Advisor to read and analyze codebase files

import fs from 'fs/promises';
import path from 'path';

// Security configuration
const ALLOWED_EXTENSIONS = new Set([
	'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
	'.svelte', '.vue',
	'.json', '.yaml', '.yml',
	'.css', '.scss', '.less',
	'.html', '.md',
	'.sql',
	'.sh', '.bash',
	'.prisma', '.graphql', '.gql'
]);

const BLOCKED_PATHS = [
	'node_modules',
	'.git',
	'.svelte-kit',
	'build',
	'dist',
	'.env',
	'.env.local',
	'.env.production',
	'.env.development',
	'secrets',
	'credentials',
	'private',
	'.ssh',
	'id_rsa',
	'id_ed25519',
	'*.pem',
	'*.key',
	'*.crt',
	'*.p12',
	'package-lock.json',
	'pnpm-lock.yaml',
	'yarn.lock'
];

const BLOCKED_PATTERNS = [
	/\.env(\.|$)/i,
	/secret/i,
	/credential/i,
	/password/i,
	/\.pem$/i,
	/\.key$/i,
	/private.*key/i,
	/api[_-]?key/i
];

// Maximum file size to read (100KB)
const MAX_FILE_SIZE = 100 * 1024;

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50; // Max files in cache

interface CachedFile {
	content: string;
	size: number;
	mtime: number;
	cachedAt: number;
}

interface FileReadResult {
	success: boolean;
	content?: string;
	path: string;
	size?: number;
	error?: string;
	fromCache?: boolean;
}

interface FileSearchResult {
	files: string[];
	truncated: boolean;
	total: number;
}

// File cache
const fileCache = new Map<string, CachedFile>();

// Access log for audit purposes
const accessLog: Array<{
	timestamp: Date;
	path: string;
	action: 'read' | 'denied' | 'search';
	success: boolean;
	reason?: string;
}> = [];

function logAccess(entry: typeof accessLog[0]) {
	accessLog.push(entry);
	// Keep only last 1000 entries
	if (accessLog.length > 1000) {
		accessLog.shift();
	}
}

/**
 * Get the project root directory
 */
function getProjectRoot(): string {
	return process.cwd();
}

/**
 * Normalize and validate a file path
 */
function normalizePath(filePath: string): { valid: boolean; normalized: string; error?: string } {
	const projectRoot = getProjectRoot();

	// Handle relative paths
	let absolutePath: string;
	if (path.isAbsolute(filePath)) {
		absolutePath = filePath;
	} else {
		absolutePath = path.join(projectRoot, filePath);
	}

	// Resolve to remove .. and . segments
	const resolved = path.resolve(absolutePath);

	// Ensure the path is within the project root
	if (!resolved.startsWith(projectRoot)) {
		return {
			valid: false,
			normalized: resolved,
			error: 'Path is outside the project directory'
		};
	}

	return { valid: true, normalized: resolved };
}

/**
 * Check if a path is blocked for security reasons
 */
function isPathBlocked(filePath: string): { blocked: boolean; reason?: string } {
	const normalizedPath = filePath.toLowerCase();
	const fileName = path.basename(filePath).toLowerCase();
	const relativePath = path.relative(getProjectRoot(), filePath);

	// Check blocked paths
	for (const blocked of BLOCKED_PATHS) {
		if (blocked.includes('*')) {
			// Glob pattern
			const pattern = blocked.replace(/\*/g, '.*');
			if (new RegExp(pattern, 'i').test(fileName)) {
				return { blocked: true, reason: `File matches blocked pattern: ${blocked}` };
			}
		} else if (relativePath.split(path.sep).includes(blocked) || fileName === blocked) {
			return { blocked: true, reason: `Path contains blocked segment: ${blocked}` };
		}
	}

	// Check blocked patterns
	for (const pattern of BLOCKED_PATTERNS) {
		if (pattern.test(relativePath) || pattern.test(fileName)) {
			return { blocked: true, reason: `Path matches security pattern` };
		}
	}

	return { blocked: false };
}

/**
 * Check if a file extension is allowed
 */
function isExtensionAllowed(filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase();
	return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Read a single file with security checks
 */
export async function readFile(filePath: string): Promise<FileReadResult> {
	// Normalize and validate path
	const { valid, normalized, error } = normalizePath(filePath);
	if (!valid) {
		logAccess({
			timestamp: new Date(),
			path: filePath,
			action: 'denied',
			success: false,
			reason: error
		});
		return { success: false, path: filePath, error };
	}

	// Check if path is blocked
	const blockCheck = isPathBlocked(normalized);
	if (blockCheck.blocked) {
		logAccess({
			timestamp: new Date(),
			path: filePath,
			action: 'denied',
			success: false,
			reason: blockCheck.reason
		});
		return { success: false, path: filePath, error: blockCheck.reason };
	}

	// Check extension
	if (!isExtensionAllowed(normalized)) {
		const ext = path.extname(normalized) || '(none)';
		logAccess({
			timestamp: new Date(),
			path: filePath,
			action: 'denied',
			success: false,
			reason: `Extension not allowed: ${ext}`
		});
		return { success: false, path: filePath, error: `File extension not allowed: ${ext}` };
	}

	// Check cache
	const cached = fileCache.get(normalized);
	if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
		logAccess({
			timestamp: new Date(),
			path: filePath,
			action: 'read',
			success: true,
			reason: 'from cache'
		});
		return {
			success: true,
			path: filePath,
			content: cached.content,
			size: cached.size,
			fromCache: true
		};
	}

	try {
		// Check file exists and get stats
		const stats = await fs.stat(normalized);

		if (!stats.isFile()) {
			return { success: false, path: filePath, error: 'Not a file' };
		}

		// Check file size
		if (stats.size > MAX_FILE_SIZE) {
			logAccess({
				timestamp: new Date(),
				path: filePath,
				action: 'denied',
				success: false,
				reason: `File too large: ${stats.size} bytes`
			});
			return {
				success: false,
				path: filePath,
				error: `File too large (${Math.round(stats.size / 1024)}KB). Maximum size is ${Math.round(MAX_FILE_SIZE / 1024)}KB`
			};
		}

		// Read the file
		const content = await fs.readFile(normalized, 'utf-8');

		// Cache the file
		if (fileCache.size >= MAX_CACHE_SIZE) {
			// Remove oldest entry
			const oldest = Array.from(fileCache.entries())
				.sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
			if (oldest) {
				fileCache.delete(oldest[0]);
			}
		}

		fileCache.set(normalized, {
			content,
			size: stats.size,
			mtime: stats.mtimeMs,
			cachedAt: Date.now()
		});

		logAccess({
			timestamp: new Date(),
			path: filePath,
			action: 'read',
			success: true
		});

		return {
			success: true,
			path: filePath,
			content,
			size: stats.size
		};
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		logAccess({
			timestamp: new Date(),
			path: filePath,
			action: 'read',
			success: false,
			reason: errorMessage
		});
		return { success: false, path: filePath, error: errorMessage };
	}
}

/**
 * Read multiple files
 */
export async function readFiles(filePaths: string[]): Promise<FileReadResult[]> {
	return Promise.all(filePaths.map(readFile));
}

/**
 * Search for files matching a pattern within the project
 */
export async function searchFiles(
	pattern: string | RegExp,
	options: {
		maxResults?: number;
		searchContent?: boolean;
		extensions?: string[];
	} = {}
): Promise<FileSearchResult> {
	const { maxResults = 50, searchContent = false, extensions } = options;
	const projectRoot = getProjectRoot();
	const results: string[] = [];
	let total = 0;

	// Safely create regex, escaping special chars if it's an invalid pattern
	let regex: RegExp;
	if (typeof pattern === 'string') {
		try {
			regex = new RegExp(pattern, 'i');
		} catch {
			// If invalid regex, escape special characters and try again
			const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			regex = new RegExp(escaped, 'i');
		}
	} else {
		regex = pattern;
	}
	const allowedExtensions = extensions
		? new Set(extensions.map(e => e.startsWith('.') ? e : `.${e}`))
		: ALLOWED_EXTENSIONS;

	// Limits to prevent hanging
	const MAX_DEPTH = 10;
	const MAX_FILES_SCANNED = 5000;
	const TIMEOUT_MS = 30000; // 30 seconds
	let filesScanned = 0;
	const startTime = Date.now();

	async function scanDir(dir: string, depth: number = 0): Promise<void> {
		// Check limits
		if (results.length >= maxResults) return;
		if (depth > MAX_DEPTH) return;
		if (filesScanned > MAX_FILES_SCANNED) return;
		if (Date.now() - startTime > TIMEOUT_MS) return;

		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				if (results.length >= maxResults) break;
				if (filesScanned > MAX_FILES_SCANNED) break;
				if (Date.now() - startTime > TIMEOUT_MS) break;

				const fullPath = path.join(dir, entry.name);
				const relativePath = path.relative(projectRoot, fullPath);

				// Check if path is blocked
				const blockCheck = isPathBlocked(fullPath);
				if (blockCheck.blocked) continue;

				if (entry.isDirectory()) {
					await scanDir(fullPath, depth + 1);
				} else if (entry.isFile()) {
					filesScanned++;
					const ext = path.extname(entry.name).toLowerCase();
					if (!allowedExtensions.has(ext)) continue;

					// Check filename match
					if (regex.test(relativePath)) {
						total++;
						if (results.length < maxResults) {
							results.push(relativePath);
						}
						continue;
					}

					// Optionally search content (but limit how many files we read)
					if (searchContent && filesScanned < 500) {
						const fileResult = await readFile(fullPath);
						if (fileResult.success && fileResult.content && regex.test(fileResult.content)) {
							total++;
							if (results.length < maxResults) {
								results.push(relativePath);
							}
						}
					}
				}
			}
		} catch {
			// Skip directories we can't read
		}
	}

	await scanDir(projectRoot, 0);

	logAccess({
		timestamp: new Date(),
		path: pattern.toString(),
		action: 'search',
		success: true,
		reason: `Found ${total} files, returned ${results.length}`
	});

	return {
		files: results,
		truncated: total > maxResults,
		total
	};
}

/**
 * Get file contents with line numbers (useful for referencing specific code)
 */
export async function readFileWithLineNumbers(
	filePath: string,
	options: { startLine?: number; endLine?: number } = {}
): Promise<FileReadResult & { lines?: { number: number; content: string }[] }> {
	const result = await readFile(filePath);

	if (!result.success || !result.content) {
		return result;
	}

	const allLines = result.content.split('\n');
	const startLine = Math.max(1, options.startLine || 1);
	const endLine = Math.min(allLines.length, options.endLine || allLines.length);

	const lines = allLines
		.slice(startLine - 1, endLine)
		.map((content, idx) => ({
			number: startLine + idx,
			content
		}));

	return {
		...result,
		lines
	};
}

/**
 * Clear the file cache
 */
export function clearCache(): void {
	fileCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
	size: number;
	maxSize: number;
	ttlMs: number;
	entries: Array<{ path: string; size: number; age: number }>;
} {
	const now = Date.now();
	return {
		size: fileCache.size,
		maxSize: MAX_CACHE_SIZE,
		ttlMs: CACHE_TTL_MS,
		entries: Array.from(fileCache.entries()).map(([filePath, cached]) => ({
			path: path.relative(getProjectRoot(), filePath),
			size: cached.size,
			age: Math.round((now - cached.cachedAt) / 1000)
		}))
	};
}

/**
 * Get recent access log
 */
export function getAccessLog(limit = 100): typeof accessLog {
	return accessLog.slice(-limit);
}

/**
 * Format file content for inclusion in AI context
 */
export function formatFileForContext(
	filePath: string,
	content: string,
	options: { includeLineNumbers?: boolean; maxLines?: number } = {}
): string {
	const { includeLineNumbers = true, maxLines = 200 } = options;

	const lines = content.split('\n');
	const truncated = lines.length > maxLines;
	const displayLines = lines.slice(0, maxLines);

	let formatted = `### File: \`${filePath}\`\n\n`;
	formatted += '```' + getLanguageFromExtension(path.extname(filePath)) + '\n';

	if (includeLineNumbers) {
		const lineNumWidth = String(displayLines.length).length;
		formatted += displayLines
			.map((line, idx) => `${String(idx + 1).padStart(lineNumWidth)} | ${line}`)
			.join('\n');
	} else {
		formatted += displayLines.join('\n');
	}

	formatted += '\n```\n';

	if (truncated) {
		formatted += `\n*[Truncated: showing ${maxLines} of ${lines.length} lines]*\n`;
	}

	return formatted;
}

/**
 * Get language identifier for syntax highlighting
 */
function getLanguageFromExtension(ext: string): string {
	const langMap: Record<string, string> = {
		'.ts': 'typescript',
		'.tsx': 'tsx',
		'.js': 'javascript',
		'.jsx': 'jsx',
		'.mjs': 'javascript',
		'.cjs': 'javascript',
		'.svelte': 'svelte',
		'.vue': 'vue',
		'.json': 'json',
		'.yaml': 'yaml',
		'.yml': 'yaml',
		'.css': 'css',
		'.scss': 'scss',
		'.less': 'less',
		'.html': 'html',
		'.md': 'markdown',
		'.sql': 'sql',
		'.sh': 'bash',
		'.bash': 'bash',
		'.prisma': 'prisma',
		'.graphql': 'graphql',
		'.gql': 'graphql'
	};

	return langMap[ext.toLowerCase()] || '';
}
