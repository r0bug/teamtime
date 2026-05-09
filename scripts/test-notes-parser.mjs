// Quick sanity test of the rent/commission notes parser.
const text = `13% commissions Total Sales $192.-24.96 commissions= $167.04-100. rent Total payout due $67.04

*04/01/25
Rent Increased to 175

*04/10/25
Check #6651 - $464.63
This is for March sales minus only $100 for April rent. $75 overpayment to be deducted`;

const rentPatterns = [
	/rent(?:\s+increased)?\s+to\s+\$?\s*(\d+(?:\.\d+)?)/gi,
	/(?:^|[\s,$])\$?\s*(\d+(?:\.\d+)?)\s*(?:[\.\s]\s*)?\.?\s*rent/gi,
	/booth\s+rent\s*[:=]?\s*\$?\s*(\d+(?:\.\d+)?)/gi,
	/rent\s*[:=]\s*\$?\s*(\d+(?:\.\d+)?)/gi
];
const rents = [];
for (const re of rentPatterns) for (const m of text.matchAll(re)) rents.push(parseFloat(m[1]));
const comms = [];
for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*%\s*(?:commission|commish)/gi)) comms.push(parseFloat(m[1]));
console.log('rent matches:', rents);
console.log('comm matches:', comms);
const lastRent = rents.length ? rents[rents.length - 1] : null;
const lastComm = comms.length ? comms[comms.length - 1] : null;
console.log('last rent:', lastRent, 'last comm:', lastComm);
console.log('=> suggestedMonthlyRentCents:', lastRent !== null ? Math.round(lastRent * 100) : null);
console.log('=> suggestedVendorPaymentPercent:', lastComm !== null ? Number((100 - lastComm).toFixed(2)) : null);
