#!/usr/bin/env python3
"""
Probe the NRS Importer upload flow with logged-in session.
Uploads a deliberately-invalid CSV so we don't create real items but still
learn the upload contract.
"""
import re
import sys
from pathlib import Path
import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
CREDS = REPO_ROOT / "scraper-imports" / "nrscreds.secret"
BASE = "https://www.nrsaccounting.com"
TARGET = f"{BASE}/import/type/ImportInv"


def login(s, user, pw):
    s.get(f"{BASE}/")
    r = s.post(
        f"{BASE}/",
        data={
            "username": user,
            "password": pw,
            "useCookie": "useCookie",
            "form": "loginForm",
            "loginFormSubmit": "Log In",
            "ReturnTo": "",
        },
        allow_redirects=True,
    )
    if "Log Out" not in r.text and "applicationAction=logout" not in r.text:
        if "Invalid" in r.text or "incorrect" in r.text.lower():
            sys.exit("login failed")
    print("login OK")


def main():
    creds = CREDS.read_text().strip()
    user, _, pw = creds.partition(":")
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (compatible; TeamTime probe)"})
    login(s, user.strip(), pw.strip())

    # 1. GET the importer page to harvest any tokens / current state
    r = s.get(TARGET)
    print(f"\nGET {TARGET} → HTTP {r.status_code}, {len(r.text)} bytes")
    # Look for any CSRF / form token patterns
    tokens = re.findall(r'name="(token|csrf|nonce)"\s+value="([^"]+)"', r.text, re.I)
    if tokens:
        print(f"  CSRF-ish tokens found: {tokens}")
    else:
        print("  no obvious CSRF token in page")
    # Look for the upload URL plupload is configured with
    plupload_url = re.search(
        r'(?:url\s*:\s*|action\s*=\s*)["\']([^"\']*\bimport[^"\']*)["\']',
        r.text,
        re.I,
    )
    if plupload_url:
        print(f"  plupload URL hint: {plupload_url.group(1)}")
    # Look for data-* attributes on the upload widget
    upload_elem = re.search(r'<[^>]*\bid="importFile[^"]*"[^>]*>', r.text, re.I)
    if upload_elem:
        print(f"  importFile element: {upload_elem.group(0)[:300]}")

    # 2. Try a plain multipart upload to the same URL (plupload html5 fallback)
    invalid_csv = b"this,is,not,a,valid,nrs,csv\nintentional,probe,row\n"
    print("\n--- Probe: multipart upload to /import/type/ImportInv ---")
    files = {"importFile": ("probe.csv", invalid_csv, "text/csv")}
    r2 = s.post(TARGET, files=files)
    print(f"  POST {TARGET} (multipart) → HTTP {r2.status_code}, {len(r2.text)} bytes, ct={r2.headers.get('content-type')}")
    # Print first chunk of response
    snippet = r2.text[:1500].replace("\n", "\\n")
    print(f"  body[0..1500]: {snippet}")

    # 3. Some plupload setups use a separate uploader URL; common conventions
    print("\n--- Probe: alternate upload endpoints ---")
    for ep in ("/import/file", "/import/upload", "/import/type/ImportInv?action=upload"):
        url = f"{BASE}{ep}"
        rr = s.post(url, files={"importFile": ("probe.csv", invalid_csv, "text/csv")})
        snip = rr.text[:200].replace("\n", "\\n")
        print(f"  {url} → HTTP {rr.status_code} — {snip}")


if __name__ == "__main__":
    main()
