<!--
  StatusBadge.svelte - Renders a status/state string as a consistent .badge-* pill,
  so the same status looks the same on every page. Use this instead of hand-rolled
  `rounded-full bg-X-100 text-X-800` spans.

  Props:
  - status: the raw status string (e.g. "in_progress"). Auto-mapped to a color.
  - label: optional display override (defaults to a prettified `status`).
  - variant: optional explicit color override when the status isn't in the map.

  Example: <StatusBadge status={task.status} />
-->
<script lang="ts">
	type Variant = 'primary' | 'success' | 'warning' | 'danger' | 'gray';

	export let status = '';
	export let label: string | undefined = undefined;
	export let variant: Variant | undefined = undefined;

	// Shared semantic mapping. Extend here (one place) rather than per-page.
	const map: Record<string, Variant> = {
		// success / positive
		active: 'success', approved: 'success', completed: 'success', complete: 'success',
		done: 'success', paid: 'success', open: 'success', success: 'success', online: 'success',
		available: 'success', published: 'success', resolved: 'success', confirmed: 'success',
		// warning / in-flight
		pending: 'warning', in_progress: 'warning', processing: 'warning', review: 'warning',
		in_review: 'warning', on_break: 'warning', draft: 'warning', partial: 'warning',
		scheduled: 'warning', waiting: 'warning', submitted: 'warning',
		// danger / negative
		inactive: 'danger', rejected: 'danger', denied: 'danger', failed: 'danger', error: 'danger',
		cancelled: 'danger', canceled: 'danger', overdue: 'danger', offline: 'danger',
		expired: 'danger', archived: 'danger', blocked: 'danger',
		// primary / informational
		new: 'primary', info: 'primary'
	};

	function prettify(s: string): string {
		return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	$: resolved = variant ?? map[status?.toLowerCase?.().trim()] ?? 'gray';
	$: text = label ?? (status ? prettify(status) : '');
</script>

<span class="badge-{resolved}">{text}</span>
