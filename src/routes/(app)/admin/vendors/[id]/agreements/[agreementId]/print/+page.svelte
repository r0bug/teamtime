<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	const v = data.vendor;
	const terms = data.agreement.termsSnapshot;
	const extra = terms?.extraFieldValues ?? {};

	function dollarsFromCents(c: number | null | undefined): string {
		return c != null ? `$${(c / 100).toFixed(2)}` : '—';
	}
	function dollarsFromAny(c: unknown): string {
		const n = typeof c === 'number' ? c : Number(c);
		return Number.isFinite(n) && n > 0 ? `$${(n / 100).toFixed(2)}` : '—';
	}

	const address = [v.addressLine1, v.addressLine2, [v.city, v.state, v.zip].filter(Boolean).join(', ')]
		.filter(Boolean)
		.join('\n');

	const completedTerms: { label: string; value: string }[] = [
		{ label: 'Vendor / Consignor', value: v.displayName },
		{ label: 'Contact', value: v.contactName || '—' },
		{ label: 'Phone', value: v.contactPhone || '—' },
		{ label: 'Email', value: v.contactEmail || '—' },
		{ label: 'Address', value: address || '—' },
		{ label: 'Booth number', value: terms?.boothNumber || '—' },
		{ label: 'Booth size', value: extra.booth_size_sqft ? `${extra.booth_size_sqft} sq ft` : '—' },
		{ label: 'Monthly rent', value: dollarsFromCents(terms?.monthlyRentCents) },
		{ label: 'Custom cabinet rent', value: dollarsFromAny(extra.custom_cabinet_rent) },
		{ label: 'Standard discount', value: extra.standard_discount_percent != null ? `${extra.standard_discount_percent}%` : '0%' },
		{ label: 'Max discount', value: terms?.maxDiscountPercent ? `${terms.maxDiscountPercent}%` : '—' },
		{ label: 'Preferred payout', value: (extra.preferred_payout_method as string) || '—' },
		{ label: 'Start date', value: v.startDate || '____________' }
	];

	onMount(() => {
		// Give the layout a tick to paint, then open the print dialog.
		const t = setTimeout(() => window.print(), 400);
		return () => clearTimeout(t);
	});
</script>

<svelte:head><title>Contract · {v.displayName}</title></svelte:head>

<div class="contract-page">
	<div class="no-print toolbar">
		<a href="/admin/vendors/{v.id}" class="btn-secondary btn-sm">← Back to vendor</a>
		<button class="btn-primary btn-sm" on:click={() => window.print()}>Print</button>
	</div>

	<section class="terms-summary">
		<h2>Completed Terms</h2>
		<table>
			<tbody>
				{#each completedTerms as t}
					<tr><th>{t.label}</th><td>{t.value}</td></tr>
				{/each}
			</tbody>
		</table>
		<p class="note">
			Signature lines are at the end of the agreement. Print, sign on paper, then upload the
			scanned copy from the vendor's Agreements tab.
		</p>
	</section>

	<!-- Frozen agreement body (markdown rendered server-side) -->
	<article class="contract-body">
		{@html data.bodyHtml}
	</article>
</div>

<style>
	.contract-page {
		max-width: 7.5in;
		margin: 0 auto;
		padding: 1rem;
		color: #111;
		background: #fff;
	}
	.toolbar {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.terms-summary {
		border: 1px solid #999;
		border-radius: 6px;
		padding: 0.75rem 1rem;
		margin-bottom: 1.25rem;
	}
	.terms-summary h2 {
		font-size: 1rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}
	.terms-summary table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.terms-summary th {
		text-align: left;
		font-weight: 600;
		color: #444;
		width: 40%;
		padding: 2px 8px 2px 0;
		vertical-align: top;
		white-space: pre-line;
	}
	.terms-summary td {
		padding: 2px 0;
		white-space: pre-line;
	}
	.terms-summary .note {
		font-size: 0.75rem;
		color: #666;
		margin: 0.5rem 0 0;
	}
	.contract-body :global(h1) {
		font-size: 1.3rem;
		margin: 0 0 0.75rem;
	}
	.contract-body :global(h2) {
		font-size: 1.05rem;
		margin: 1rem 0 0.4rem;
		border-bottom: 1px solid #ddd;
		padding-bottom: 2px;
	}
	.contract-body :global(p),
	.contract-body :global(li) {
		font-size: 0.9rem;
		line-height: 1.4;
	}
	.contract-body :global(ul) {
		margin: 0.25rem 0 0.5rem 1.25rem;
	}

	@media print {
		.no-print {
			display: none !important;
		}
		.contract-page {
			max-width: none;
			padding: 0;
		}
		.terms-summary {
			border-color: #000;
		}
		.contract-body :global(h2) {
			break-after: avoid;
		}
	}
</style>
