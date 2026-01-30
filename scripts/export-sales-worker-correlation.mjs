#!/usr/bin/env node
/**
 * Export sales-worker correlation data to CSV
 * Run: node scripts/export-sales-worker-correlation.mjs
 */

import postgres from 'postgres';
import { writeFileSync } from 'fs';
import { mkdirSync } from 'fs';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

// Helper to format date as YYYY-MM-DD
function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.split('T')[0];
  return d.toISOString().split('T')[0];
}

// Create exports directory
try { mkdirSync('exports', { recursive: true }); } catch {}

async function exportData() {
  console.log('Fetching data...\n');

  // 1. Get sales snapshots - only latest per day (using DISTINCT ON)
  const salesSnapshots = await sql`
    SELECT DISTINCT ON (sale_date)
      id,
      sale_date,
      total_sales::numeric as total_sales,
      total_retained::numeric as total_retained,
      vendor_count,
      vendors,
      created_at
    FROM sales_snapshots
    ORDER BY sale_date DESC, created_at DESC
  `;

  console.log(`Found ${salesSnapshots.length} sales snapshots`);

  // 2. Get all completed time entries
  const timeEntries = await sql`
    SELECT
      te.user_id,
      u.name as user_name,
      u.email as user_email,
      te.clock_in,
      te.clock_out,
      EXTRACT(EPOCH FROM (te.clock_out - te.clock_in))/3600 as hours_worked,
      (te.clock_in AT TIME ZONE 'America/Los_Angeles')::date as work_date
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    WHERE te.clock_out IS NOT NULL
    ORDER BY te.clock_in DESC
  `;

  console.log(`Found ${timeEntries.length} completed time entries`);

  // Build a map of work_date -> workers
  const workersByDate = new Map();
  for (const te of timeEntries) {
    const dateKey = formatDate(te.work_date);
    if (!workersByDate.has(dateKey)) {
      workersByDate.set(dateKey, []);
    }
    workersByDate.get(dateKey).push({
      userId: te.user_id,
      name: te.user_name,
      email: te.user_email,
      hours: parseFloat(te.hours_worked) || 0
    });
  }

  // EXPORT 1: Daily sales with workers who worked that day
  const dailyData = [];
  for (const snap of salesSnapshots) {
    const saleDate = formatDate(snap.sale_date);
    const workers = workersByDate.get(saleDate) || [];
    const totalHours = workers.reduce((s, w) => s + w.hours, 0);
    const totalSales = parseFloat(snap.total_sales) || 0;
    const totalRetained = parseFloat(snap.total_retained) || 0;

    // Parse vendors
    let vendors = snap.vendors;
    if (typeof vendors === 'string') {
      try { vendors = JSON.parse(vendors); } catch { vendors = []; }
    }
    if (!Array.isArray(vendors)) vendors = [];

    // Sort vendors by sales descending
    vendors.sort((a, b) => (b.total_sales || 0) - (a.total_sales || 0));
    const topVendor = vendors[0];

    if (workers.length === 0) {
      dailyData.push({
        date: saleDate,
        worker_name: '(No clock-ins)',
        worker_email: '',
        hours_worked: 0,
        pct_of_day: 0,
        total_sales: totalSales.toFixed(2),
        total_retained: totalRetained.toFixed(2),
        attributed_retained: 0,
        vendor_count: snap.vendor_count || 0,
        top_vendor: topVendor?.vendor_name || '',
        top_vendor_sales: topVendor?.total_sales || 0
      });
    } else {
      for (const worker of workers) {
        const pct = totalHours > 0 ? worker.hours / totalHours : 0;
        const attributed = totalRetained * pct;

        dailyData.push({
          date: saleDate,
          worker_name: worker.name,
          worker_email: worker.email,
          hours_worked: worker.hours.toFixed(2),
          pct_of_day: (pct * 100).toFixed(1),
          total_sales: totalSales.toFixed(2),
          total_retained: totalRetained.toFixed(2),
          attributed_retained: attributed.toFixed(2),
          vendor_count: snap.vendor_count || 0,
          top_vendor: topVendor?.vendor_name || '',
          top_vendor_sales: topVendor?.total_sales || 0
        });
      }
    }
  }

  // EXPORT 2: Worker summary - aggregate stats per worker
  const workerStats = new Map();
  for (const row of dailyData) {
    if (row.worker_name === '(No clock-ins)') continue;

    const key = row.worker_email;
    if (!workerStats.has(key)) {
      workerStats.set(key, {
        name: row.worker_name,
        email: row.worker_email,
        days_worked: 0,
        total_hours: 0,
        total_attributed_sales: 0
      });
    }
    const stats = workerStats.get(key);
    stats.days_worked++;
    stats.total_hours += parseFloat(row.hours_worked) || 0;
    stats.total_attributed_sales += parseFloat(row.attributed_retained) || 0;
  }

  const workerSummary = Array.from(workerStats.values()).map(w => ({
    ...w,
    total_hours: w.total_hours.toFixed(2),
    total_attributed_sales: w.total_attributed_sales.toFixed(2),
    sales_per_hour: w.total_hours > 0 ? (w.total_attributed_sales / w.total_hours).toFixed(2) : '0.00'
  })).sort((a, b) => parseFloat(b.total_attributed_sales) - parseFloat(a.total_attributed_sales));

  // EXPORT 3: Sales by vendor (limited - top vendors per day)
  const vendorData = [];
  for (const snap of salesSnapshots) {
    const saleDate = formatDate(snap.sale_date);
    let vendors = snap.vendors;
    if (typeof vendors === 'string') {
      try { vendors = JSON.parse(vendors); } catch { vendors = []; }
    }
    if (!Array.isArray(vendors)) vendors = [];

    // Top 10 vendors per day only
    vendors.sort((a, b) => (b.total_sales || 0) - (a.total_sales || 0));
    for (const v of vendors.slice(0, 10)) {
      vendorData.push({
        date: saleDate,
        vendor_id: v.vendor_id || '',
        vendor_name: v.vendor_name || '',
        vendor_sales: v.total_sales || 0,
        vendor_retained: v.retained_amount || 0
      });
    }
  }

  // Write CSVs
  const timestamp = new Date().toISOString().split('T')[0];

  // 1. Daily correlation
  if (dailyData.length > 0) {
    const headers = Object.keys(dailyData[0]);
    const csv = [
      headers.join(','),
      ...dailyData.map(r => headers.map(h => `"${r[h]}"`).join(','))
    ].join('\n');
    const file = `exports/daily-sales-workers-${timestamp}.csv`;
    writeFileSync(file, csv);
    console.log(`\nExported: ${file} (${dailyData.length} rows)`);
  }

  // 2. Worker summary
  if (workerSummary.length > 0) {
    const headers = Object.keys(workerSummary[0]);
    const csv = [
      headers.join(','),
      ...workerSummary.map(r => headers.map(h => `"${r[h]}"`).join(','))
    ].join('\n');
    const file = `exports/worker-summary-${timestamp}.csv`;
    writeFileSync(file, csv);
    console.log(`Exported: ${file} (${workerSummary.length} rows)`);
  }

  // 3. Top vendors per day
  if (vendorData.length > 0) {
    const headers = Object.keys(vendorData[0]);
    const csv = [
      headers.join(','),
      ...vendorData.map(r => headers.map(h => `"${r[h]}"`).join(','))
    ].join('\n');
    const file = `exports/top-vendors-by-day-${timestamp}.csv`;
    writeFileSync(file, csv);
    console.log(`Exported: ${file} (${vendorData.length} rows)`);
  }

  // Summary stats
  console.log('\n=== SUMMARY ===');
  console.log(`Sales days with data: ${salesSnapshots.length}`);
  console.log(`Days with clock-ins: ${workersByDate.size}`);
  console.log(`Unique workers: ${workerSummary.length}`);

  const totalSales = salesSnapshots.reduce((s, snap) => s + (parseFloat(snap.total_sales) || 0), 0);
  const totalRetained = salesSnapshots.reduce((s, snap) => s + (parseFloat(snap.total_retained) || 0), 0);
  console.log(`Total sales: $${totalSales.toFixed(2)}`);
  console.log(`Total retained: $${totalRetained.toFixed(2)}`);

  // Show worker summary preview
  console.log('\n=== WORKER SUMMARY ===');
  console.log('Name                    | Days | Hours  | Attributed $ | $/Hour');
  console.log('------------------------|------|--------|--------------|-------');
  for (const w of workerSummary.slice(0, 10)) {
    console.log(
      `${w.name.padEnd(24)}| ${String(w.days_worked).padStart(4)} | ${w.total_hours.padStart(6)} | $${w.total_attributed_sales.padStart(10)} | $${w.sales_per_hour}`
    );
  }

  await sql.end();
  console.log('\nFiles are in exports/ folder');
}

exportData().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
