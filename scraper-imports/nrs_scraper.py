#!/usr/bin/env python3
"""
NRS Accounting - AP Vendor Totals & Detail Scraper

Scrapes the AP Vendor Totals report from nrsaccounting.com
with optional individual vendor sales detail and PDF URLs.
"""

import requests
from bs4 import BeautifulSoup
import csv
import json
import argparse
import re
from urllib.parse import urlencode
from datetime import datetime
from pathlib import Path


class NRSScraper:
    BASE_URL = "https://www.nrsaccounting.com"
    PDF_URL = "https://www.nrsaccounting.com/ap/vendorInventorySalesPDF"

    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        self.logged_in = False

    def login(self) -> bool:
        """Login to NRS Accounting and establish session."""
        login_url = f"{self.BASE_URL}/"

        resp = self.session.get(login_url)
        if resp.status_code != 200:
            print(f"Failed to load login page: {resp.status_code}")
            return False

        login_data = {
            'username': self.username,
            'password': self.password,
            'useCookie': 'useCookie',
            'form': 'loginForm',
            'loginFormSubmit': 'Log In',
            'ReturnTo': ''
        }

        resp = self.session.post(login_url, data=login_data, allow_redirects=True)

        if 'Log Out' in resp.text or 'applicationAction=logout' in resp.text:
            self.logged_in = True
            print("Login successful")
            return True
        elif 'Invalid' in resp.text or 'incorrect' in resp.text.lower():
            print("Login failed: Invalid credentials")
            return False
        else:
            self.logged_in = True
            print("Login appears successful")
            return True

    def _build_date_params(self, month: int = None, year: int = None,
                           start_date: str = None, end_date: str = None) -> dict:
        """Build date filter parameters."""
        if start_date and end_date:
            return {
                'frmDateRangeOrYear': 'D',
                'invoiceDate_op': '2',
                'invoiceDate': start_date,
                'invoiceDate_two': end_date,
                'invoiceDate_thr': '',
                'invoiceDate_rg': '0',
                'invoiceDate_d': '',
            }
        elif month:
            return {
                'frmDateRangeOrYear': 'M',
                'frmMonth': str(month),
                'frmYear': str(year),
            }
        else:
            return {
                'frmDateRangeOrYear': 'Y',
                'frmYear': str(year),
            }

    def _build_pdf_url(self, vendor_id: str, month: int = None, year: int = None,
                       start_date: str = None, end_date: str = None,
                       pdf_mode: str = 'download') -> str:
        """
        Build PDF URL for a specific vendor.

        Args:
            vendor_id: The vendor's ID
            month: Month number (1-12)
            year: Year
            start_date: Start date (MM/DD/YYYY)
            end_date: End date (MM/DD/YYYY)
            pdf_mode: 'download' or 'view'

        Returns:
            Full PDF URL
        """
        params = {
            'go': 'yes',
            'search': '1',
            'apVendorId[]': vendor_id,
            'rptSetupId': '434',
            'pdf': pdf_mode
        }

        if start_date and end_date:
            params.update({
                'invoiceDate_op': '2',
                'invoiceDate': start_date,
                'invoiceDate_two': end_date,
                'invoiceDate_thr': '',
                'invoiceDate_rg': '0',
                'invoiceDate_d': '',
            })
        elif month:
            params.update({
                'invoiceMonth': str(month),
                'invoiceYear': str(year),
            })
        else:
            params.update({
                'invoiceYear': str(year),
            })

        return f"{self.PDF_URL}?{urlencode(params)}"

    def get_vendor_totals(self, month: int = None, year: int = None,
                          start_date: str = None, end_date: str = None) -> tuple[list[dict], dict]:
        """
        Fetch AP Vendor Totals report.

        Returns:
            Tuple of (vendor_data_list, vendor_id_mapping)
        """
        if not self.logged_in:
            raise RuntimeError("Not logged in. Call login() first.")

        report_url = f"{self.BASE_URL}/ap/apVendorInventoryTotals"
        params = {
            'go': 'yes',
            'search': '1',
            'frmGrouping': 'apVendorId',
            **self._build_date_params(month, year, start_date, end_date)
        }

        period = self._format_period(month, year, start_date, end_date)
        print(f"Fetching vendor totals for {period}...")

        resp = self.session.get(report_url, params=params)
        if resp.status_code != 200:
            print(f"Failed to fetch report: {resp.status_code}")
            return [], {}

        vendors, vendor_ids = self._parse_vendor_totals(resp.text)

        # Add PDF URLs to vendor data
        for vendor in vendors:
            vendor_name = vendor['vendor']
            if vendor_name in vendor_ids:
                vendor['vendor_id'] = vendor_ids[vendor_name]
                vendor['pdf_url'] = self._build_pdf_url(
                    vendor_ids[vendor_name],
                    month=month, year=year,
                    start_date=start_date, end_date=end_date
                )
            else:
                vendor['vendor_id'] = ''
                vendor['pdf_url'] = ''

        return vendors, vendor_ids

    def _parse_vendor_totals(self, html: str) -> tuple[list[dict], dict]:
        """Parse vendor totals and extract vendor IDs."""
        soup = BeautifulSoup(html, 'html.parser')
        table = soup.find('table', {'class': 'ListingTable', 'id': 'ListSectionTable'})

        if not table:
            if 'theForm' in html:
                print("Got form page - report may require different parameters")
            else:
                print("Could not find vendor totals table")
            return [], {}

        vendors = []
        vendor_ids = {}

        rows = table.find_all('tr', {'class': 'Hover'})

        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 6:
                vendor_name = cells[0].get_text(strip=True)

                vendor_data = {
                    'vendor': vendor_name,
                    'quantity': self._parse_int(cells[1].get_text(strip=True)),
                    'total_price': self._parse_currency(cells[2].get_text(strip=True)),
                    'vendor_payment_pct': self._parse_percent(cells[3].get_text(strip=True)),
                    'vendor_amount': self._parse_currency(cells[4].get_text(strip=True)),
                    'retained_amount': self._parse_currency(cells[5].get_text(strip=True))
                }
                vendors.append(vendor_data)

                # Extract vendor ID from PDF link
                for link in row.find_all('a', href=True):
                    href = link.get('href', '')
                    match = re.search(r'apVendorId\[\]=(\d+)', href)
                    if match:
                        vendor_ids[vendor_name] = match.group(1)
                        break

        print(f"Parsed {len(vendors)} vendor records")
        return vendors, vendor_ids

    def get_vendor_detail(self, vendor_id: str, vendor_name: str,
                          month: int = None, year: int = None,
                          start_date: str = None, end_date: str = None) -> list[dict]:
        """
        Fetch individual item sales for a specific vendor.

        Returns:
            List of dicts with item-level sales data
        """
        if not self.logged_in:
            raise RuntimeError("Not logged in. Call login() first.")

        report_url = f"{self.BASE_URL}/ap/apVendorInventoryTotals"
        params = {
            'go': 'yes',
            'search': '1',
            'frmGrouping': 'invStockId',  # Group by item
            'apVendorId[]': vendor_id,
            **self._build_date_params(month, year, start_date, end_date)
        }

        resp = self.session.get(report_url, params=params)
        if resp.status_code != 200:
            return []

        items = self._parse_vendor_detail(resp.text, vendor_name, vendor_id)

        # Add PDF URL to each item row
        pdf_url = self._build_pdf_url(
            vendor_id,
            month=month, year=year,
            start_date=start_date, end_date=end_date
        )
        for item in items:
            item['pdf_url'] = pdf_url

        return items

    def _parse_vendor_detail(self, html: str, vendor_name: str, vendor_id: str) -> list[dict]:
        """Parse individual item sales for a vendor."""
        soup = BeautifulSoup(html, 'html.parser')
        table = soup.find('table', {'class': 'ListingTable', 'id': 'ListSectionTable'})

        if not table:
            return []

        items = []
        rows = table.find_all('tr', {'class': 'Hover'})

        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 7:
                item_data = {
                    'vendor': vendor_name,
                    'vendor_id': vendor_id,
                    'stock_number': cells[0].get_text(strip=True),
                    'item_name': cells[1].get_text(strip=True),
                    'description': cells[2].get_text(strip=True),
                    'quantity': self._parse_int(cells[3].get_text(strip=True)),
                    'total_price': self._parse_currency(cells[4].get_text(strip=True)),
                    'vendor_amount': self._parse_currency(cells[5].get_text(strip=True)),
                    'retained_amount': self._parse_currency(cells[6].get_text(strip=True))
                }
                items.append(item_data)

        return items

    def get_all_vendor_details(self, vendor_ids: dict,
                               month: int = None, year: int = None,
                               start_date: str = None, end_date: str = None) -> list[dict]:
        """
        Fetch individual sales for all vendors.

        Args:
            vendor_ids: Dict mapping vendor name to vendor ID

        Returns:
            List of all item-level sales across all vendors
        """
        all_items = []
        total = len(vendor_ids)

        for i, (vendor_name, vendor_id) in enumerate(vendor_ids.items(), 1):
            print(f"  [{i}/{total}] Fetching details for {vendor_name}...")
            items = self.get_vendor_detail(
                vendor_id, vendor_name,
                month=month, year=year,
                start_date=start_date, end_date=end_date
            )
            all_items.extend(items)

        print(f"Total items fetched: {len(all_items)}")
        return all_items

    def download_vendor_pdf(self, vendor_id: str, output_path: str,
                            month: int = None, year: int = None,
                            start_date: str = None, end_date: str = None) -> bool:
        """
        Download a vendor's PDF report.

        Returns:
            True if successful, False otherwise
        """
        if not self.logged_in:
            raise RuntimeError("Not logged in. Call login() first.")

        pdf_url = self._build_pdf_url(
            vendor_id,
            month=month, year=year,
            start_date=start_date, end_date=end_date,
            pdf_mode='download'
        )

        resp = self.session.get(pdf_url, stream=True)
        if resp.status_code == 200 and 'application/pdf' in resp.headers.get('Content-Type', ''):
            with open(output_path, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            return True
        return False

    @staticmethod
    def _format_period(month: int = None, year: int = None,
                       start_date: str = None, end_date: str = None) -> str:
        """Format period string for display."""
        if start_date and end_date:
            return f"{start_date} - {end_date}"
        elif month:
            return f"{month}/{year}"
        else:
            return f"Year {year}"

    @staticmethod
    def _parse_currency(value: str) -> float:
        try:
            return float(value.replace('$', '').replace(',', ''))
        except (ValueError, AttributeError):
            return 0.0

    @staticmethod
    def _parse_percent(value: str) -> float:
        try:
            return float(value.replace('%', ''))
        except (ValueError, AttributeError):
            return 0.0

    @staticmethod
    def _parse_int(value: str) -> int:
        try:
            return int(value.replace(',', ''))
        except (ValueError, AttributeError):
            return 0

    def logout(self):
        if self.logged_in:
            self.session.get(f"{self.BASE_URL}/?applicationAction=logout")
            self.logged_in = False
            print("Logged out")


def save_to_csv(data: list[dict], filename: str):
    if not data:
        print(f"No data to save to {filename}")
        return

    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)

    print(f"Saved {len(data)} records to {filename}")


def save_to_json(data: list[dict], filename: str, metadata: dict = None):
    output = metadata or {}
    output['data'] = data

    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)

    print(f"Saved to {filename}")


def load_credentials(creds_file: str = None) -> tuple[str, str]:
    if creds_file and Path(creds_file).exists():
        with open(creds_file, 'r') as f:
            lines = f.read().strip().split('\n')
            if lines:
                parts = lines[0].split(':', 1)
                if len(parts) == 2:
                    return parts[0], parts[1]

    raise ValueError("Could not load credentials")


def print_summary(data: list[dict], period: str, is_detail: bool = False):
    if not data:
        return

    total_sales = sum(v['total_price'] for v in data)
    total_vendor_amount = sum(v['vendor_amount'] for v in data)
    total_retained = sum(v['retained_amount'] for v in data)
    total_qty = sum(v['quantity'] for v in data)

    print(f"\n--- {'Detail' if is_detail else 'Summary'} for {period} ---")
    if is_detail:
        print(f"Total Items: {len(data)}")
        print(f"Unique Vendors: {len(set(v['vendor'] for v in data))}")
    else:
        print(f"Vendors: {len(data)}")
    print(f"Total Quantity: {total_qty:,}")
    print(f"Total Sales: ${total_sales:,.2f}")
    print(f"Total Vendor Amount: ${total_vendor_amount:,.2f}")
    print(f"Total Retained: ${total_retained:,.2f}")


def main():
    parser = argparse.ArgumentParser(
        description='Scrape AP Vendor Totals from NRS Accounting',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Get vendor summary for December 2025
  python nrs_scraper.py --month 12 --year 2025

  # Get vendor summary + individual item details
  python nrs_scraper.py --month 11 --year 2025 --detail

  # Get report for date range with details
  python nrs_scraper.py --start 01/01/2025 --end 12/31/2025 --detail

  # Output to both CSV and JSON
  python nrs_scraper.py --month 12 --year 2025 --format both --detail
        """
    )

    date_group = parser.add_mutually_exclusive_group()
    date_group.add_argument('--month', '-m', type=int,
                            help='Month number (1-12), requires --year')
    date_group.add_argument('--start', '-s', type=str,
                            help='Start date (MM/DD/YYYY), requires --end')

    parser.add_argument('--year', '-y', type=int,
                        help='Year (e.g., 2025). Use alone for full year, or with --month')
    parser.add_argument('--end', '-e', type=str,
                        help='End date (MM/DD/YYYY), requires --start')

    parser.add_argument('--detail', '-d', action='store_true',
                        help='Also fetch individual item sales per vendor')
    parser.add_argument('--creds', '-c', type=str, default='nrscreds.secret',
                        help='Credentials file (email:password format)')
    parser.add_argument('--output', '-o', type=str, default='vendor_totals',
                        help='Output filename (without extension)')
    parser.add_argument('--format', '-f', type=str, choices=['csv', 'json', 'both'],
                        default='csv', help='Output format')

    args = parser.parse_args()

    # Validate arguments
    if args.start and not args.end:
        parser.error("--start requires --end")
    if args.end and not args.start:
        parser.error("--end requires --start")
    if args.month and not args.year:
        parser.error("--month requires --year")

    if not args.month and not args.year and not args.start:
        args.month = datetime.now().month
        args.year = datetime.now().year

    try:
        username, password = load_credentials(args.creds)
    except ValueError as e:
        print(f"Error loading credentials: {e}")
        return 1

    scraper = NRSScraper(username, password)

    try:
        if not scraper.login():
            return 1

        # Build date params for reuse
        date_kwargs = {}
        if args.start and args.end:
            date_kwargs = {'start_date': args.start, 'end_date': args.end}
            period = f"{args.start} - {args.end}"
            output_base = f"{args.output}_range"
        elif args.month:
            date_kwargs = {'month': args.month, 'year': args.year}
            period = f"{args.month}/{args.year}"
            output_base = f"{args.output}_{args.year}_{args.month:02d}"
        else:
            date_kwargs = {'year': args.year}
            period = f"Year {args.year}"
            output_base = f"{args.output}_{args.year}"

        # Get vendor totals
        vendor_data, vendor_ids = scraper.get_vendor_totals(**date_kwargs)

        if vendor_data:
            # Save summary
            if args.format in ('csv', 'both'):
                save_to_csv(vendor_data, f"{output_base}_summary.csv")

            if args.format in ('json', 'both'):
                metadata = {
                    'report': 'AP Vendor Totals - Summary',
                    'period': period,
                    'generated': datetime.now().isoformat(),
                    'record_count': len(vendor_data)
                }
                save_to_json(vendor_data, f"{output_base}_summary.json", metadata)

            print_summary(vendor_data, period)

            # Get individual item details if requested
            if args.detail and vendor_ids:
                print(f"\nFetching individual item sales for {len(vendor_ids)} vendors...")
                detail_data = scraper.get_all_vendor_details(vendor_ids, **date_kwargs)

                if detail_data:
                    if args.format in ('csv', 'both'):
                        save_to_csv(detail_data, f"{output_base}_detail.csv")

                    if args.format in ('json', 'both'):
                        metadata = {
                            'report': 'AP Vendor Totals - Item Detail',
                            'period': period,
                            'generated': datetime.now().isoformat(),
                            'record_count': len(detail_data)
                        }
                        save_to_json(detail_data, f"{output_base}_detail.json", metadata)

                    print_summary(detail_data, period, is_detail=True)
        else:
            print("No data retrieved")

    finally:
        scraper.logout()

    return 0


if __name__ == '__main__':
    exit(main())
