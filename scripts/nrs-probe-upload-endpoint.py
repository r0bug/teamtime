#!/usr/bin/env python3
"""Probe /attachments/upload.php — the actual plupload destination."""
import sys
from pathlib import Path
import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
CREDS = REPO_ROOT / "scraper-imports" / "nrscreds.secret"
BASE = "https://www.nrsaccounting.com"
UPLOAD = f"{BASE}/attachments/upload.php"


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


def main():
    creds = CREDS.read_text().strip()
    user, _, pw = creds.partition(":")
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (compatible; TeamTime probe)"})
    login(s, user.strip(), pw.strip())
    print("login OK")

    # Try a tiny CSV upload — plupload's html4 runtime sends a simple multipart
    # POST with a "file" field. Let's try that shape first.
    body = b"Part #,Name *\nPROBE_DELETE_ME,probe row\n"
    print(f"\n--- Probe 1: simple multipart POST with field 'file' ---")
    r1 = s.post(UPLOAD, files={"file": ("probe.csv", body, "text/csv")})
    print(f"  HTTP {r1.status_code}, ct={r1.headers.get('content-type')}, body={r1.text[:500]}")

    print(f"\n--- Probe 2: with field 'importFile' ---")
    r2 = s.post(UPLOAD, files={"importFile": ("probe.csv", body, "text/csv")})
    print(f"  HTTP {r2.status_code}, ct={r2.headers.get('content-type')}, body={r2.text[:500]}")

    print(f"\n--- Probe 3: GET /attachments/upload.php (no body, see what error it gives) ---")
    r3 = s.get(UPLOAD)
    print(f"  HTTP {r3.status_code}, ct={r3.headers.get('content-type')}, body={r3.text[:500]}")


if __name__ == "__main__":
    main()
