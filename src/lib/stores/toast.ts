/**
 * Toast Notification Store
 *
 * Provides a centralized toast notification system for user feedback.
 * Toasts auto-dismiss after a configurable duration.
 */

import { writable, derived } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	title?: string;
	duration: number;
	dismissible: boolean;
	createdAt: number;
}

interface ToastOptions {
	title?: string;
	duration?: number;
	dismissible?: boolean;
}

// Default durations by type (in milliseconds)
const DEFAULT_DURATIONS: Record<ToastType, number> = {
	success: 3000,
	error: 5000,
	warning: 4000,
	info: 3500
};

// Maximum number of toasts to show at once
const MAX_TOASTS = 5;

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	let idCounter = 0;

	function generateId(): string {
		idCounter += 1;
		return `toast-${idCounter}-${Date.now()}`;
	}

	function add(type: ToastType, message: string, options: ToastOptions = {}): string {
		const id = generateId();
		const duration = options.duration ?? DEFAULT_DURATIONS[type];

		const toast: Toast = {
			id,
			type,
			message,
			title: options.title,
			duration,
			dismissible: options.dismissible ?? true,
			createdAt: Date.now()
		};

		update((toasts) => {
			// Remove oldest if we're at max capacity
			const newToasts = toasts.length >= MAX_TOASTS ? toasts.slice(1) : toasts;
			return [...newToasts, toast];
		});

		// Auto-dismiss after duration
		if (duration > 0) {
			setTimeout(() => {
				dismiss(id);
			}, duration);
		}

		return id;
	}

	function dismiss(id: string): void {
		update((toasts) => toasts.filter((t) => t.id !== id));
	}

	function dismissAll(): void {
		update(() => []);
	}

	return {
		subscribe,
		add,
		dismiss,
		dismissAll,

		// Convenience methods
		success: (message: string, options?: ToastOptions) => add('success', message, options),
		error: (message: string, options?: ToastOptions) => add('error', message, options),
		warning: (message: string, options?: ToastOptions) => add('warning', message, options),
		info: (message: string, options?: ToastOptions) => add('info', message, options)
	};
}

// Export the singleton store
export const toasts = createToastStore();

// Helper to use in form actions
export function showToast(
	type: ToastType,
	message: string,
	options?: ToastOptions
): void {
	toasts.add(type, message, options);
}

// Derived store for checking if there are any toasts
export const hasToasts = derived(toasts, ($toasts) => $toasts.length > 0);
