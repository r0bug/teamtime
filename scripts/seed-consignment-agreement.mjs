/**
 * Seed the standard Yakima Finds Consignment Agreement.
 *
 * 1. Creates the primary agreement template (code 'consignment-agreement')
 *    if it doesn't exist. The template is editable afterwards at
 *    /admin/vendor-agreements/templates — editing creates a new version,
 *    so these backfilled signatures keep displaying this exact body.
 * 2. Backfills a signed instance for every vendor that doesn't already
 *    have one on this template: paper_original_on_file = true (the signed
 *    paper copies are in the file cabinet), terms snapshotted from the
 *    vendor record.
 *
 * Idempotent — safe to re-run; it only fills gaps.
 */
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const CODE = 'consignment-agreement';
const TITLE = 'Consignment Agreement';

const BODY = `# Consignment Agreement for Yakima Finds

This Consignment Agreement (the "Agreement") is made on ____________ between:

**Yakima Finds** ("Consignee")
111 S. 2nd St, Yakima, WA 98901

and __________________________ ("Consignor")

## 1. Purpose

This Agreement sets forth the terms and conditions under which the Consignor will provide items for sale by the Consignee.

## 2. Booth Rental (if applicable)

**Rental Terms**

- Custom Rental Cabinets: $_______ per month (e.g., locking display cabinet)
- Booth Size: _______ square feet
- Monthly Rent: $_______ ($1 per square foot per month)
- Initial Rent Payment: First month's rent due at signing, prorated to the first of the month.
- Subsequent Rent Payments: Deducted from commissions if sufficient funds are available.

## 3. Commission Rates

- Booth Rentals: 13% of the selling price
- Individual Items: 25% of the selling price

## 4. Term

This Agreement commences on ____________ and continues month-to-month until terminated by either party with 30 days' written notice.

## 5. Consigned Items

- The Consignor warrants ownership and right to sell all consigned items.
- The Consignee reserves the right to reject any item for any reason.
- For individual items, the Consignee will display and price items in consultation with the Consignor.

## 6. Pricing and Sales

Consignors will specify a standard discount percentage they are willing to offer on all items. This can be 0% if no discount is offered.

Standard Discount: _______% (to be filled by Consignor)

For items eligible for deeper discounts, Consignors must add this information to their vendor inventory, which includes a "maximum discount" field for each item.

Yakima Finds staff will only be aware of the standard discount specified by the Consignor. Access to information about deeper discounts on specific items is restricted and requires a manager's passkey.

Consignors may offer additional structured discounts, such as:

- A percentage off if a certain number of items are purchased (e.g., 15% off for 3-6 items, 20% off for 7-10 items)
- A percentage off if a total purchase amount is reached (e.g., 15% off for $200 total, 20% off for $300 total)
- A percentage off if a minimum number of items are purchased from any category (e.g., 20% off for 8 or more items)
- Seasonal sale discounts (e.g., 15% off during specified sales, increasing to 20% if the purchase total exceeds $400)

The Consignee may apply the standard discount specified by the Consignor without additional approval.

Discounts exceeding the standard discount, up to the maximum specified in the vendor inventory, require manager approval and the use of a passkey.

For any discount exceeding the maximum specified in the vendor inventory, Consignor approval is required. If unreachable, such discount offers will be declined.

## 7. Payment to Consignor

The Consignee will pay the Consignor their share of sales, minus rent (if applicable) and commissions, on the 10th day of each month for the previous month's sales.

Payment methods include check, direct deposit, Venmo, Cashapp, PayPal, or other available electronic payment methods. Cash payments are not available.

## 8. Insurance and Liability

The Consignee will take reasonable precautions to protect consigned items but is not responsible for loss, theft, or damage.

Consignors are encouraged to procure their own personal property insurance. Yakima Finds can provide guidance on insurance providers.

## 9. Termination

Either party may terminate this Agreement with 30 days' written notice.

Upon termination, Yakima Finds (YF) will remove all items from the space and store them securely.

Rent will continue to accrue at the contract rate, prorated daily until retrieval.

The Consignor must retrieve all items within 30 days of termination. After this period:

- YF may dispose of or sell items at its discretion.
- Proceeds will cover outstanding rent and fees; any balance will be paid to the Consignor minus a handling fee.

## 10. Dispute Resolution

Any disputes arising from this Agreement shall be resolved through mediation before pursuing legal action.

## 11. Individual Item Consignment

For consignment of individual items without booth rental, please list items on a separate sheet and attach.

## 12. Ethics and First Right of Refusal

Selling directly to Yakima Finds customers outside YF is prohibited and grounds for removal.

YF reserves first right of refusal on buying opportunities from walk-in customers.

## 13. Multi-Platform Selling

YF acknowledges that consignors may sell on multiple platforms.

Notify YF staff within 24 hours if an item sells elsewhere so it can be removed from display.

## 14. Sales and Promotions

YF may run store-wide sales; vendor participation is preferred with ample notice provided.

Vendors must notify YF staff at least three days prior to their own sales for POS adjustments.

## 15. Acknowledgement

By signing below, both parties acknowledge that they have read, understood, and agree to the terms and conditions of this Agreement.

Yakima Finds Representative __________________________ Date __________

Consignor __________________________ Date __________

Name: __________________________

Phone Number(s): __________________________

Address: __________________________

Preferred Payout Method: __________________________

Max Discount: __________________________

Notes: __________________________
`;

// Collected at signing time for new signings (paper backfills leave them empty).
const EXTRA_FIELDS = [
	{ key: 'standard_discount_percent', label: 'Standard Discount (%)', type: 'number', required: false },
	{ key: 'booth_size_sqft', label: 'Booth Size (sq ft)', type: 'number', required: false },
	{ key: 'custom_cabinet_rent', label: 'Custom Rental Cabinets ($/month)', type: 'currency', required: false },
	{ key: 'preferred_payout_method', label: 'Preferred Payout Method', type: 'text', required: false }
];

const sql = postgres(url);

try {
	// 1. Template — create once; reuse the active version on re-run.
	let [template] = await sql`
		SELECT id, body_markdown, version FROM agreement_templates
		WHERE code = ${CODE} AND is_active = true
		LIMIT 1`;

	if (!template) {
		[template] = await sql`
			INSERT INTO agreement_templates (code, title, kind, body_markdown, extra_fields_schema, version, is_active)
			VALUES (${CODE}, ${TITLE}, 'primary', ${BODY}, ${sql.json(EXTRA_FIELDS)}, 1, true)
			RETURNING id, body_markdown, version`;
		console.log('Created template', template.id);
	} else {
		console.log('Template already exists', template.id, '(version', template.version + ')');
	}

	// 2. Backfill — every vendor without a signed agreement on this template
	// (any version of the code) gets one, marked paper-original-on-file.
	const vendorsToBackfill = await sql`
		SELECT v.id, v.display_name, v.contact_name, v.monthly_rent_cents, v.max_discount_percent, v.booth_number
		FROM vendors v
		WHERE NOT EXISTS (
			SELECT 1 FROM vendor_agreements va
			JOIN agreement_templates t ON t.id = va.template_id
			WHERE va.vendor_id = v.id AND t.code = ${CODE} AND va.status = 'signed'
		)`;

	// NRS sync leaves placeholder contact names like '---'; require a real one.
	const hasContent = (s) => typeof s === 'string' && /[A-Za-z0-9]/.test(s);

	let created = 0;
	for (const v of vendorsToBackfill) {
		const terms = {
			monthlyRentCents: v.monthly_rent_cents,
			maxDiscountPercent: v.max_discount_percent,
			boothNumber: v.booth_number
		};
		const signedBy = hasContent(v.contact_name) ? v.contact_name : v.display_name;
		await sql`
			INSERT INTO vendor_agreements
				(vendor_id, template_id, status, signed_by_name, signature_data_url,
				 paper_original_on_file, body_snapshot, template_version, terms_snapshot)
			VALUES
				(${v.id}, ${template.id}, 'signed', ${signedBy},
				 NULL, true, ${template.body_markdown}, ${template.version}, ${sql.json(terms)})`;
		created++;
	}

	const [{ total }] = await sql`
		SELECT count(*)::int AS total FROM vendor_agreements va
		JOIN agreement_templates t ON t.id = va.template_id
		WHERE t.code = ${CODE} AND va.status = 'signed'`;
	console.log(`Backfilled ${created} agreements; ${total} vendors now hold a signed '${TITLE}'.`);
} catch (e) {
	console.error('Seed failed:', e.message);
	process.exitCode = 1;
} finally {
	await sql.end();
}
