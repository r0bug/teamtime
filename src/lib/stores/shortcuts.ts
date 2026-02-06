// Keyboard Shortcut Registry
import { writable, get } from 'svelte/store';
import { goto } from '$app/navigation';

export interface Shortcut {
	key: string;
	description: string;
	action: () => void;
	category: string;
}

export const shortcuts = writable<Shortcut[]>([]);
export const showShortcutHelp = writable(false);
export const showGlobalSearch = writable(false);

// Sequence key tracking for two-key shortcuts (g then h)
let pendingKey: string | null = null;
let pendingTimer: ReturnType<typeof setTimeout>;

export function registerDefaultShortcuts() {
	shortcuts.set([
		{ key: 'ctrl+k', description: 'Open search', category: 'Global', action: () => showGlobalSearch.update(v => !v) },
		{ key: '?', description: 'Show shortcuts', category: 'Global', action: () => showShortcutHelp.update(v => !v) },
		{ key: 'Escape', description: 'Close modal/panel', category: 'Global', action: () => {
			showShortcutHelp.set(false);
			showGlobalSearch.set(false);
		}},
		{ key: 'g h', description: 'Go to Home', category: 'Navigation', action: () => goto('/dashboard') },
		{ key: 'g t', description: 'Go to Tasks', category: 'Navigation', action: () => goto('/tasks') },
		{ key: 'g m', description: 'Go to Messages', category: 'Navigation', action: () => goto('/messages') },
		{ key: 'g s', description: 'Go to Schedule', category: 'Navigation', action: () => goto('/schedule') },
		{ key: 'g l', description: 'Go to Leaderboard', category: 'Navigation', action: () => goto('/leaderboard') }
	]);
}

export function handleKeydown(event: KeyboardEvent) {
	// Don't trigger shortcuts when typing in inputs
	const target = event.target as HTMLElement;
	if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
		// Allow Escape to close modals even in inputs
		if (event.key === 'Escape') {
			showShortcutHelp.set(false);
			showGlobalSearch.set(false);
		}
		return;
	}

	const allShortcuts = get(shortcuts);
	const ctrlOrCmd = event.ctrlKey || event.metaKey;

	// Handle ctrl+k / cmd+k
	if (ctrlOrCmd && event.key === 'k') {
		event.preventDefault();
		showGlobalSearch.update(v => !v);
		return;
	}

	// Handle Escape
	if (event.key === 'Escape') {
		showShortcutHelp.set(false);
		showGlobalSearch.set(false);
		return;
	}

	// Handle ? for help
	if (event.key === '?' && !ctrlOrCmd) {
		showShortcutHelp.update(v => !v);
		return;
	}

	// Handle two-key sequences (g then h, etc.)
	if (pendingKey) {
		const combo = `${pendingKey} ${event.key}`;
		const shortcut = allShortcuts.find(s => s.key === combo);
		pendingKey = null;
		clearTimeout(pendingTimer);
		if (shortcut) {
			event.preventDefault();
			shortcut.action();
		}
		return;
	}

	// Start a sequence
	if (event.key === 'g') {
		pendingKey = 'g';
		pendingTimer = setTimeout(() => { pendingKey = null; }, 1000);
		return;
	}
}
