# NRS Accounting Scraper Documentation

## Overview

This package contains tools for scraping data from NRS Accounting (nrsaccounting.com), a LAMP-based web accounting application. These scrapers authenticate via session cookies and extract vendor sales data for integration with TeamTime.

## Table of Contents

1. [Authentication](#authentication)
2. [Available Scripts](#available-scripts)
3. [NRS URL Structure](#nrs-url-structure)
4. [Data Formats](#data-formats)
5. [Cron Setup](#cron-setup)
6. [Troubleshooting](#troubleshooting)

---

## Authentication

### Login URL
```
POST https://www.nrsaccounting.com/
```

### Login Parameters
| Parameter | Value |
|-----------|-------|
| `username` | Email address |
| `password` | Password |
| `useCookie` | `useCookie` |
| `form` | `loginForm` |
| `loginFormSubmit` | `Log In` |
| `ReturnTo` | (empty) |

### Session
- Authentication is cookie-based
- Session persists across requests using `requests.Session()`
- Logout: `GET https://www.nrsaccounting.com/?applicationAction=logout`

### Credentials File Format
Create `nrscreds.secret` with format:
```
email@example.com:password
```

**Important:** Keep this file secure (chmod 600) and never commit to git.

---

## Available Scripts

### 1. `nrs_scraper.py` - Monthly/Yearly Vendor Totals

Full-featured scraper for AP Vendor Inventory Totals report.

**Features:**
- Monthly, yearly, or date range filtering
- Summary totals by vendor
- Individual item detail per vendor (--detail flag)
- PDF URLs for each vendor report
- CSV and JSON output

**Usage:**
```bash
# Monthly report
python3 nrs_scraper.py --month 12 --year 2025

# With individual item details
python3 nrs_scraper.py --month 11 --year 2025 --detail

# Date range
python3 nrs_scraper.py --start 01/01/2025 --end 12/31/2025

# Full year
python3 nrs_scraper.py --year 2025

# Output formats
python3 nrs_scraper.py --month 12 --year 2025 --format both  # csv + json
```

**Output Files:**
- `vendor_totals_YYYY_MM_summary.csv` - Vendor totals
- `vendor_totals_YYYY_MM_detail.csv` - Individual item sales (with --detail)

### 2. `nrs_daily_vendor_sales.py` - Daily Sales for TeamTime

Simplified daily scraper designed for TeamTime integration.

**Features:**
- Single-day vendor sales
- Outputs vendor_id, vendor_name, total_sales, vendor_amount, retained_amount
- JSON output for API consumption
- Table output for human review

**Usage:**
```bash
# Yesterday's sales (default)
python3 nrs_daily_vendor_sales.py

# Specific date
python3 nrs_daily_vendor_sales.py --date 12/11/2025

# JSON output (for TeamTime)
python3 nrs_daily_vendor_sales.py --format json

# Save to file
python3 nrs_daily_vendor_sales.py --format json -o daily_sales.json

# CSV output
python3 nrs_daily_vendor_sales.py --format csv
```

---

## NRS URL Structure

### Base URL
```
https://www.nrsaccounting.com
```

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `/ap/apVendorInventoryTotals` | Vendor inventory sales report |
| `/ap/vendorInventorySalesPDF` | PDF export of vendor report |
| `/ar/arInvoiceHistoryForm` | Posted AR invoices |
| `/ar/arCashRegForm` | Sales receipts |
| `/ar/arCashRegAnalysis` | Cash register sales analysis |
| `/inventory/invSalesReport` | Inventory sales report |

### Vendor Totals Report Parameters

**URL:** `GET /ap/apVendorInventoryTotals`

| Parameter | Description | Values |
|-----------|-------------|--------|
| `go` | Execute report | `yes` |
| `search` | Enable search | `1` |
| `frmGrouping` | Group by | `apVendorId` (vendor), `invStockId` (item) |
| `frmDateRangeOrYear` | Date filter type | `M` (month), `Y` (year), `D` (date range) |
| `frmMonth` | Month number | `1-12` |
| `frmYear` | Year | `2025` |
| `invoiceDate_op` | Date operator | `2` (Between) |
| `invoiceDate` | Start date | `MM/DD/YYYY` |
| `invoiceDate_two` | End date | `MM/DD/YYYY` |
| `apVendorId[]` | Filter by vendor | Vendor ID number |

### PDF URL Structure

```
https://www.nrsaccounting.com/ap/vendorInventorySalesPDF?
  go=yes&
  search=1&
  apVendorId[]=17011&
  rptSetupId=434&
  invoiceMonth=11&
  invoiceYear=2025&
  pdf=download
```

**Note:** PDF URLs require authentication - must be accessed within an active session.

---

## Data Formats

### Vendor Summary (from nrs_scraper.py)

```json
{
  "vendor": "Amber Alvarez",
  "quantity": 75,
  "total_price": 1396.0,
  "vendor_payment_pct": 87.0,
  "vendor_amount": 1214.54,
  "retained_amount": 181.46,
  "vendor_id": "17011",
  "pdf_url": "https://www.nrsaccounting.com/ap/vendorInventorySalesPDF?..."
}
```

### Vendor Detail (individual items)

```json
{
  "vendor": "Amber Alvarez",
  "vendor_id": "17011",
  "stock_number": "EMV",
  "item_name": "",
  "description": "cow cookie jar was 26$ on sale for $10",
  "quantity": 75,
  "total_price": 1396.0,
  "vendor_amount": 1214.54,
  "retained_amount": 181.46,
  "pdf_url": "https://..."
}
```

### Daily Sales (for TeamTime)

```json
{
  "date": "12/11/2025",
  "vendors": [
    {
      "vendor_id": "17011",
      "vendor_name": "Amber Alvarez",
      "total_sales": 54.0,
      "vendor_amount": 46.98,
      "retained_amount": 7.02
    }
  ],
  "totals": {
    "total_sales": 1121.5,
    "total_vendor_amount": 797.57,
    "total_retained": 323.93,
    "vendor_count": 22
  }
}
```

---

## Cron Setup

### Daily Sales to TeamTime

```bash
# Run at 6am daily, scrape yesterday's sales
0 6 * * * cd /path/to/NRS && python3 nrs_daily_vendor_sales.py --format json -o /path/to/teamtime/import/daily_vendor_sales.json 2>> /var/log/nrs_scraper.log

# Or POST directly to TeamTime API
0 6 * * * cd /path/to/NRS && python3 nrs_daily_vendor_sales.py --format json | curl -X POST -H "Content-Type: application/json" -d @- http://teamtime.local/api/vendor_sales
```

### Monthly Report

```bash
# Run on 1st of each month at 7am, scrape previous month
0 7 1 * * cd /path/to/NRS && python3 nrs_scraper.py --month $(date -d "last month" +\%m) --year $(date -d "last month" +\%Y) --detail --format both
```

---

## Troubleshooting

### Login Issues

1. **Check credentials format** - Must be `email:password` on first line
2. **Session timeout** - NRS sessions expire; script handles re-login
3. **IP blocking** - If scraping too frequently, may get rate limited

### No Data Returned

1. **Check date format** - Must be `MM/DD/YYYY`
2. **No sales on date** - Verify data exists in NRS web interface
3. **Wrong parameters** - Check `frmDateRangeOrYear` matches filter type

### HTML Structure Changes

If NRS updates their UI, these selectors may need updating:
- Table ID: `ListSectionTable`
- Data rows: `tr.Hover`
- Headers: `thead th`

### Debug Mode

Add verbose output:
```python
# In the scraper, after login:
print(f"Cookies: {session.cookies.get_dict()}")
print(f"Response length: {len(resp.text)}")
```

---

## Dependencies

```bash
pip install requests beautifulsoup4
```

### Requirements
- Python 3.10+
- `requests` - HTTP client
- `beautifulsoup4` - HTML parsing

---

## File Structure

```
NRS/
├── nrs_scraper.py           # Full-featured monthly/yearly scraper
├── nrs_daily_vendor_sales.py # Daily scraper for TeamTime
├── nrscreds.secret          # Credentials (email:password)
├── sample_output.json       # Example JSON output
└── README.md                # This documentation
```

---

## Contact

For issues with NRS Accounting itself, contact their support.
For scraper bugs, check the HTML structure hasn't changed.
