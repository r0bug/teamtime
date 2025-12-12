#!/usr/bin/env python3
"""
NRS Daily Vendor Sales Scraper

Scrapes daily vendor sales for TeamTime integration.
Outputs: vendor_id, vendor_name, total_sales, vendor_amount, retained_amount

Usage:
    # Scrape yesterday (default)
    python nrs_daily_vendor_sales.py

    # Scrape specific date
    python nrs_daily_vendor_sales.py --date 12/11/2025

    # Output as JSON for API consumption
    python nrs_daily_vendor_sales.py --format json
"""

import requests
from bs4 import BeautifulSoup
import csv
import json
import re
import argparse
from datetime import datetime, timedelta
from pathlib import Path


class NRSVendorSales:
    BASE_URL = "https://www.nrsaccounting.com"

    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        self.logged_in = False

    def login(self) -> bool:
        login_url = f"{self.BASE_URL}/"
        resp = self.session.get(login_url)
        if resp.status_code != 200:
            return False

        resp = self.session.post(login_url, data={
            'username': self.username,
            'password': self.password,
            'useCookie': 'useCookie',
            'form': 'loginForm',
            'loginFormSubmit': 'Log In',
            'ReturnTo': ''
        })

        self.logged_in = 'Log Out' in resp.text or 'applicationAction=logout' in resp.text
        return self.logged_in

    def get_daily_vendor_sales(self, date: str) -> dict:
        """
        Get vendor sales for a specific date.

        Args:
            date: Date in MM/DD/YYYY format

        Returns:
            Dict with 'date', 'vendors' list, and 'totals'
        """
        if not self.logged_in:
            raise RuntimeError("Not logged in")

        url = f"{self.BASE_URL}/ap/apVendorInventoryTotals"
        params = {
            'go': 'yes',
            'search': '1',
            'frmDateRangeOrYear': 'D',
            'invoiceDate_op': '2',
            'invoiceDate': date,
            'invoiceDate_two': date,
            'frmGrouping': 'apVendorId'
        }

        resp = self.session.get(url, params=params)
        if resp.status_code != 200:
            return {'date': date, 'vendors': [], 'totals': {}}

        return self._parse_vendor_sales(resp.text, date)

    def _parse_vendor_sales(self, html: str, date: str) -> dict:
        soup = BeautifulSoup(html, 'html.parser')
        table = soup.find('table', {'id': 'ListSectionTable'})

        if not table:
            return {'date': date, 'vendors': [], 'totals': {}}

        vendors = []
        total_sales = 0
        total_vendor_amount = 0
        total_retained = 0

        rows = table.find_all('tr', {'class': 'Hover'})

        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 6:
                vendor_name = cells[0].get_text(strip=True)

                # Extract vendor_id from PDF link
                vendor_id = None
                for link in row.find_all('a', href=True):
                    href = link.get('href', '')
                    match = re.search(r'apVendorId\[\]=(\d+)', href)
                    if match:
                        vendor_id = match.group(1)
                        break

                sales = self._parse_currency(cells[2].get_text(strip=True))
                vendor_amt = self._parse_currency(cells[4].get_text(strip=True))
                retained = self._parse_currency(cells[5].get_text(strip=True))

                vendor = {
                    'vendor_id': vendor_id,
                    'vendor_name': vendor_name,
                    'total_sales': sales,
                    'vendor_amount': vendor_amt,
                    'retained_amount': retained
                }
                vendors.append(vendor)

                total_sales += sales
                total_vendor_amount += vendor_amt
                total_retained += retained

        return {
            'date': date,
            'vendors': vendors,
            'totals': {
                'total_sales': round(total_sales, 2),
                'total_vendor_amount': round(total_vendor_amount, 2),
                'total_retained': round(total_retained, 2),
                'vendor_count': len(vendors)
            }
        }

    @staticmethod
    def _parse_currency(value: str) -> float:
        try:
            return float(value.replace('$', '').replace(',', ''))
        except (ValueError, AttributeError):
            return 0.0

    def logout(self):
        if self.logged_in:
            self.session.get(f"{self.BASE_URL}/?applicationAction=logout")
            self.logged_in = False


def load_credentials(creds_file: str = 'nrscreds.secret') -> tuple[str, str]:
    if Path(creds_file).exists():
        with open(creds_file, 'r') as f:
            parts = f.read().strip().split('\n')[0].split(':', 1)
            if len(parts) == 2:
                return parts[0], parts[1]
    raise ValueError("Could not load credentials")


def main():
    parser = argparse.ArgumentParser(description='Scrape daily vendor sales from NRS')
    parser.add_argument('--date', '-d', type=str,
                        help='Date (MM/DD/YYYY). Default: yesterday')
    parser.add_argument('--creds', '-c', type=str, default='nrscreds.secret',
                        help='Credentials file')
    parser.add_argument('--output', '-o', type=str,
                        help='Output file (default: stdout for JSON, auto-named for CSV)')
    parser.add_argument('--format', '-f', type=str, choices=['csv', 'json', 'table'],
                        default='table', help='Output format')

    args = parser.parse_args()

    # Default to yesterday
    if not args.date:
        yesterday = datetime.now() - timedelta(days=1)
        args.date = yesterday.strftime('%m/%d/%Y')

    try:
        username, password = load_credentials(args.creds)
    except ValueError as e:
        print(f"Error: {e}", file=__import__('sys').stderr)
        return 1

    scraper = NRSVendorSales(username, password)

    try:
        if not scraper.login():
            print("Login failed", file=__import__('sys').stderr)
            return 1

        data = scraper.get_daily_vendor_sales(args.date)

        if args.format == 'json':
            output = json.dumps(data, indent=2)
            if args.output:
                with open(args.output, 'w') as f:
                    f.write(output)
            else:
                print(output)

        elif args.format == 'csv':
            filename = args.output or f"vendor_sales_{args.date.replace('/', '-')}.csv"
            with open(filename, 'w', newline='') as f:
                if data['vendors']:
                    writer = csv.DictWriter(f, fieldnames=['vendor_id', 'vendor_name', 'total_sales', 'vendor_amount', 'retained_amount'])
                    writer.writeheader()
                    writer.writerows(data['vendors'])
                    # Write totals row
                    writer.writerow({
                        'vendor_id': '',
                        'vendor_name': 'TOTAL',
                        'total_sales': data['totals']['total_sales'],
                        'vendor_amount': data['totals']['total_vendor_amount'],
                        'retained_amount': data['totals']['total_retained']
                    })
            print(f"Saved to {filename}", file=__import__('sys').stderr)

        else:  # table format
            print(f"\n{'='*70}")
            print(f"  DAILY VENDOR SALES - {args.date}")
            print(f"{'='*70}")
            print(f"{'ID':<8} {'Vendor':<30} {'Sales':>10} {'Vendor Amt':>12} {'Retained':>10}")
            print(f"{'-'*70}")

            for v in data['vendors']:
                vid = v['vendor_id'] or ''
                print(f"{vid:<8} {v['vendor_name'][:30]:<30} ${v['total_sales']:>9,.2f} ${v['vendor_amount']:>11,.2f} ${v['retained_amount']:>9,.2f}")

            print(f"{'-'*70}")
            t = data['totals']
            print(f"{'TOTAL':<8} {t['vendor_count']} vendors{'':<20} ${t['total_sales']:>9,.2f} ${t['total_vendor_amount']:>11,.2f} ${t['total_retained']:>9,.2f}")
            print(f"{'='*70}\n")

    finally:
        scraper.logout()

    return 0


if __name__ == '__main__':
    exit(main())
