#!/usr/bin/env node
/**
 * Compute historical correlations for all dates with both sales and worker data
 */

import postgres from 'postgres';
import { config } from 'dotenv';

config();

const sql = postgres(process.env.DATABASE_URL);

async function computeDailyCorrelation(saleDate) {
  // Get sales for this date
  const [snapshot] = await sql`
    SELECT id, sale_date, total_sales::numeric, total_retained::numeric, vendors
    FROM sales_snapshots
    WHERE sale_date = ${saleDate}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!snapshot) return 0;

  // Get workers for this date
  const workers = await sql`
    SELECT
      te.user_id,
      u.name as user_name,
      SUM(EXTRACT(EPOCH FROM (te.clock_out - te.clock_in))/3600) as hours_worked,
      COUNT(*) as shifts
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    WHERE DATE(te.clock_in AT TIME ZONE 'America/Los_Angeles') = ${saleDate}::date
      AND te.clock_out IS NOT NULL
    GROUP BY te.user_id, u.name
  `;

  if (workers.length === 0) return 0;

  // Parse vendors
  let vendors = snapshot.vendors;
  if (typeof vendors === 'string') vendors = JSON.parse(vendors);
  if (!Array.isArray(vendors)) vendors = [];

  let inserted = 0;

  // For each worker-vendor combination
  for (const worker of workers) {
    for (const vendor of vendors) {
      // Skip vendors without valid ID
      if (!vendor.vendor_id) continue;
      await sql`
        INSERT INTO vendor_employee_correlations (
          user_id, vendor_id, vendor_name, period_type, period_start,
          shifts_count, hours_worked, vendor_sales, vendor_retained,
          transaction_count, sample_size, confidence_score
        ) VALUES (
          ${worker.user_id}, ${vendor.vendor_id}, ${vendor.vendor_name}, 'daily', ${saleDate},
          ${worker.shifts}, ${worker.hours_worked}, ${vendor.total_sales || 0}, ${vendor.retained_amount || 0},
          1, 1, 0.067
        )
        ON CONFLICT (user_id, vendor_id, period_type, period_start)
        DO UPDATE SET
          vendor_sales = ${vendor.total_sales || 0},
          vendor_retained = ${vendor.retained_amount || 0},
          hours_worked = ${worker.hours_worked},
          shifts_count = ${worker.shifts},
          updated_at = NOW()
      `;
      inserted++;
    }
  }

  return inserted;
}

async function main() {
  // Get all dates with overlapping data
  const dates = await sql`
    SELECT DISTINCT ss.sale_date::date as date
    FROM sales_snapshots ss
    JOIN time_entries te ON DATE(te.clock_in AT TIME ZONE 'America/Los_Angeles') = ss.sale_date::date
    WHERE te.clock_out IS NOT NULL
    ORDER BY ss.sale_date DESC
  `;

  console.log('Computing correlations for', dates.length, 'days...');

  let total = 0;
  for (const row of dates) {
    const dateStr = row.date.toISOString().split('T')[0];
    const count = await computeDailyCorrelation(dateStr);
    total += count;
    if (count > 0) {
      process.stdout.write('.');
    }
  }

  console.log('');
  console.log('Total correlation records created:', total);

  // Verify
  const [result] = await sql`SELECT COUNT(*) as count FROM vendor_employee_correlations`;
  console.log('Records in table:', result.count);

  await sql.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
