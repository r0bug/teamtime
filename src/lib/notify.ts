/**
 * Canonical user-feedback API for TeamTime.
 *
 * Prefer this over inline red/green banners or native alert():
 *   import { notify } from '$lib/notify';
 *   notify.success('Saved');
 *   notify.error('Could not save changes');
 *   notify.warning('Heads up'); notify.info('FYI');
 *
 * Toasts render via <ToastContainer> mounted globally in src/routes/+layout.svelte.
 * For toasting from a SvelteKit form action result, use showToast(type, message).
 */
export { toasts as notify, showToast } from '$lib/stores/toast';
export type { ToastType } from '$lib/stores/toast';
