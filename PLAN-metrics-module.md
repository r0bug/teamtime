# Metrics Module Implementation Plan

## Overview

Build a comprehensive metrics module that:
1. Provides sales metrics that pivot on shift data (who was working)
2. Enables reports like "vendor sales trends by employee"
3. Creates a framework for collecting metrics from TeamTime interactions
4. Establishes a foundation for external data source integration

## Current State Analysis

### Existing Infrastructure (Leverage These)
- **`salesSnapshots`** table with per-vendor JSONB breakdown
- **`timeEntries`** + **`shifts`** tables for shift tracking
- **`sales-attribution-service.ts`** - distributes sales by hours worked
- **`analyze-sales-patterns.ts`** AI tool - has daily_summary, labor_efficiency, vendor_performance
- **`userStats`** table - aggregated per-user gamification metrics
- **`pointTransactions`** - immutable ledger of all point awards with metadata

### Gaps to Fill
1. No vendor-to-employee correlation tracking
2. No generic metric collection framework
3. No dedicated metrics dashboard UI
4. No metric source registry for external integrations

---

## Implementation Plan

### Phase 1: Database Schema (Foundation)

#### 1.1 Create `metrics` Table
Generic metrics storage for any metric type from any source.

```sql
CREATE TABLE metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL,           -- 'sales_correlation', 'task_completion', 'pricing_accuracy'
  metric_key TEXT NOT NULL,            -- Specific metric identifier
  value DECIMAL(12,4) NOT NULL,        -- The metric value
  dimensions JSONB NOT NULL DEFAULT '{}', -- Pivot dimensions: {user_id, vendor_id, location_id, etc}
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  source TEXT NOT NULL,                -- 'teamtime', 'lob_scraper', 'api', 'manual'
  source_id TEXT,                      -- Reference to source record if applicable
  metadata JSONB DEFAULT '{}',         -- Additional context
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_metrics_type_key ON metrics(metric_type, metric_key);
CREATE INDEX idx_metrics_dimensions ON metrics USING GIN(dimensions);
CREATE INDEX idx_metrics_period ON metrics(period_start, period_end);
```

#### 1.2 Create `metric_definitions` Table
Registry of all metric types and their configurations.

```sql
CREATE TABLE metric_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  unit TEXT,                           -- '$', '%', 'count', 'hours'
  aggregation TEXT DEFAULT 'sum',      -- 'sum', 'avg', 'min', 'max', 'count'
  available_dimensions TEXT[] NOT NULL, -- ['user_id', 'vendor_id', 'day_of_week']
  source_types TEXT[] NOT NULL,        -- ['teamtime', 'lob_scraper']
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 1.3 Create `vendor_employee_correlations` Table
Pre-computed correlations for fast querying.

```sql
CREATE TABLE vendor_employee_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  period_type TEXT NOT NULL,           -- 'daily', 'weekly', 'monthly'
  period_start DATE NOT NULL,

  -- When this employee worked
  shifts_count INTEGER NOT NULL DEFAULT 0,
  hours_worked DECIMAL(8,2) NOT NULL DEFAULT 0,

  -- Vendor performance when employee was working
  vendor_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
  vendor_retained DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Comparison metrics
  avg_vendor_sales_overall DECIMAL(12,2), -- Average when anyone works
  sales_delta_pct DECIMAL(8,4),           -- % difference from average

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, vendor_id, period_type, period_start)
);

CREATE INDEX idx_vec_user ON vendor_employee_correlations(user_id);
CREATE INDEX idx_vec_vendor ON vendor_employee_correlations(vendor_id);
CREATE INDEX idx_vec_period ON vendor_employee_correlations(period_type, period_start);
```

---

### Phase 2: Metric Collection Services

#### 2.1 Create `src/lib/server/services/metrics-service.ts`
Core service for recording and querying metrics.

```typescript
// Key functions:
- recordMetric(type, key, value, dimensions, period, source)
- queryMetrics(type, filters, groupBy, dateRange)
- getMetricDefinitions()
- registerMetricDefinition(definition)
```

#### 2.2 Create `src/lib/server/services/vendor-correlation-service.ts`
Service for computing vendor-employee correlations.

```typescript
// Key functions:
- computeDailyCorrelations(date: Date)
- computeWeeklyCorrelations(weekStart: Date)
- getVendorTrendsByEmployee(userId, dateRange)
- getEmployeeTrendsByVendor(vendorId, dateRange)
- getTopCorrelations(options: { positive?: boolean, minShifts?: number })
```

#### 2.3 Create `src/lib/server/services/metric-collectors/` Directory
Modular collectors for different data sources.

```
metric-collectors/
├── index.ts                    # Collector registry
├── teamtime-collector.ts       # Internal TeamTime metrics
├── sales-collector.ts          # Sales snapshot processing
└── base-collector.ts           # Abstract base class
```

**TeamTime Collector Metrics:**
- Task completion rates by user
- Average task completion time
- Pricing decision accuracy (if grade tracking exists)
- Clock-in punctuality rates
- Message response times

**Sales Collector Metrics:**
- Daily sales by vendor
- Retained earnings by vendor
- Sales per labor hour
- Vendor performance deltas

---

### Phase 3: API Endpoints

#### 3.1 Metrics Query API
`src/routes/api/metrics/+server.ts`

```typescript
GET /api/metrics?type=vendor_sales&groupBy=user_id&start=2025-01-01&end=2025-01-31
GET /api/metrics/definitions
```

#### 3.2 Vendor Correlations API
`src/routes/api/metrics/vendor-correlations/+server.ts`

```typescript
GET /api/metrics/vendor-correlations?userId=xxx
GET /api/metrics/vendor-correlations?vendorId=xxx
GET /api/metrics/vendor-correlations/top?positive=true&minShifts=5
```

#### 3.3 Reports API
`src/routes/api/metrics/reports/+server.ts`

```typescript
GET /api/metrics/reports/vendor-by-employee?start=...&end=...&format=json|csv
GET /api/metrics/reports/employee-performance?start=...&end=...
GET /api/metrics/reports/sales-trends?groupBy=week&vendorId=xxx
```

---

### Phase 4: Scheduled Processing

#### 4.1 Add Metrics Cron Job
`src/routes/api/metrics/cron/+server.ts`

Runs daily (after sales attribution cron):
1. Process new sales snapshots into metrics
2. Compute daily vendor-employee correlations
3. Aggregate weekly/monthly summaries
4. Clean up old raw metrics (configurable retention)

#### 4.2 Update Existing Points Cron
Add metric recording to `src/routes/api/points/cron/+server.ts`:
- Record sales attribution as metrics
- Record top performer data

---

### Phase 5: Admin Dashboard

#### 5.1 Create Metrics Dashboard Page
`src/routes/(app)/admin/metrics/+page.svelte`

Features:
- Date range selector
- Metric type dropdown
- Dimension filters (by user, by vendor)
- Chart visualizations (line charts for trends, bar charts for comparisons)
- Export to CSV

#### 5.2 Vendor-Employee Correlation Report
`src/routes/(app)/admin/metrics/vendor-correlations/+page.svelte`

Features:
- Heatmap showing employee vs vendor performance
- Filter by date range
- Sort by correlation strength
- Drill-down to individual employee or vendor

#### 5.3 Sales Trends Dashboard
`src/routes/(app)/admin/metrics/sales-trends/+page.svelte`

Features:
- Line chart: vendor sales over time
- Filter: by employee(s) on shift
- Compare: selected vendor vs all vendors
- Period: daily/weekly/monthly aggregation

---

### Phase 6: AI Tool Integration

#### 6.1 Create `query_metrics` AI Tool
`src/lib/ai/tools/office-manager/query-metrics.ts`

Allow Office Manager to query metrics in natural language:
- "What were sales trends last week?"
- "Which employee has the best correlation with Vendor X?"
- "Show me task completion rates for the team"

#### 6.2 Extend Revenue Optimizer
Update `analyze-sales-patterns.ts` to use new correlation data:
- Add `employee_vendor_correlation` analysis type
- Generate insights about staffing optimization

---

### Phase 7: External Data Source Framework

#### 7.1 Create Data Source Registry
`src/lib/server/services/data-sources/`

```
data-sources/
├── index.ts                    # Registry and factory
├── types.ts                    # DataSource interface
├── lob-scraper.ts             # Current scraper (existing)
├── api-source.ts              # Future direct API integration
└── manual-import.ts           # Manual data entry
```

**DataSource Interface:**
```typescript
interface DataSource {
  id: string;
  name: string;
  type: 'scraper' | 'api' | 'manual' | 'webhook';

  // Configuration
  config: DataSourceConfig;

  // Methods
  fetch(params: FetchParams): Promise<RawData>;
  transform(raw: RawData): MetricData[];
  validate(data: MetricData[]): ValidationResult;
}
```

#### 7.2 Admin Data Source Management
`src/routes/(app)/admin/metrics/data-sources/+page.svelte`

- View registered data sources
- Configure source settings
- View import history
- Manual import trigger

---

## File Structure Summary

```
src/
├── lib/
│   ├── server/
│   │   ├── db/
│   │   │   └── schema.ts                    # Add new tables
│   │   └── services/
│   │       ├── metrics-service.ts           # Core metrics service
│   │       ├── vendor-correlation-service.ts # Correlation calculations
│   │       ├── metric-collectors/
│   │       │   ├── index.ts
│   │       │   ├── base-collector.ts
│   │       │   ├── teamtime-collector.ts
│   │       │   └── sales-collector.ts
│   │       └── data-sources/
│   │           ├── index.ts
│   │           ├── types.ts
│   │           └── lob-scraper.ts
│   └── ai/
│       └── tools/
│           └── office-manager/
│               └── query-metrics.ts         # New AI tool
│
├── routes/
│   ├── api/
│   │   └── metrics/
│   │       ├── +server.ts                   # Main metrics API
│   │       ├── cron/+server.ts              # Scheduled processing
│   │       ├── vendor-correlations/+server.ts
│   │       └── reports/+server.ts
│   │
│   └── (app)/
│       └── admin/
│           └── metrics/
│               ├── +page.svelte             # Main dashboard
│               ├── +page.server.ts
│               ├── vendor-correlations/
│               │   ├── +page.svelte
│               │   └── +page.server.ts
│               ├── sales-trends/
│               │   ├── +page.svelte
│               │   └── +page.server.ts
│               └── data-sources/
│                   ├── +page.svelte
│                   └── +page.server.ts
```

---

## Implementation Order

| Order | Phase | Description | Dependencies |
|-------|-------|-------------|--------------|
| 1 | 1.1-1.3 | Database schema | None |
| 2 | 2.1 | Metrics service | Schema |
| 3 | 2.2 | Vendor correlation service | Schema, metrics service |
| 4 | 3.1-3.3 | API endpoints | Services |
| 5 | 4.1 | Metrics cron job | Services, APIs |
| 6 | 5.1 | Basic metrics dashboard | APIs |
| 7 | 5.2-5.3 | Correlation & trends dashboards | APIs |
| 8 | 2.3 | Metric collectors | Services |
| 9 | 6.1-6.2 | AI tool integration | Services |
| 10 | 7.1-7.2 | External data source framework | Services |

---

## Example Queries Enabled

After implementation, the system will support:

1. **"Show vendor sales trends when John was on shift"**
   ```sql
   SELECT vendor_name, period_start, vendor_sales, sales_delta_pct
   FROM vendor_employee_correlations
   WHERE user_id = 'john-uuid' AND period_type = 'weekly'
   ORDER BY period_start;
   ```

2. **"Which employees correlate with highest Vendor X sales?"**
   ```sql
   SELECT u.name, vec.hours_worked, vec.vendor_sales, vec.sales_delta_pct
   FROM vendor_employee_correlations vec
   JOIN users u ON vec.user_id = u.id
   WHERE vec.vendor_id = 'vendor-x' AND vec.period_type = 'monthly'
   ORDER BY vec.sales_delta_pct DESC;
   ```

3. **"Task completion rates by employee this month"**
   ```sql
   SELECT dimensions->>'user_id' as user_id, AVG(value) as completion_rate
   FROM metrics
   WHERE metric_type = 'task_completion_rate'
     AND period_start >= '2025-01-01'
   GROUP BY dimensions->>'user_id';
   ```

---

## Notes

- All dates use Pacific timezone for consistency with existing code
- Metrics are immutable once recorded (no updates, only new records)
- Correlation calculations run after sales data is imported (dependency on sales cron)
- The framework is designed to be extensible for future data sources like direct POS API
