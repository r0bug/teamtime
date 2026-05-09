#!/usr/bin/env python3
"""Download the NRS ImportInv template + sample previous-import CSVs."""
import re
import sys
from pathlib import Path
import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
CREDS = REPO_ROOT / "scraper-imports" / "nrscreds.secret"
BASE = "https://www.nrsaccounting.com"


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


def fetch(s, label, path, save_to=None):
    url = f"{BASE}{path}"
    r = s.get(url)
    ct = r.headers.get("content-type", "")
    print(f"\n=== {label} → {path} ===")
    print(f"  HTTP {r.status_code}, content-type: {ct}, size: {len(r.content)} bytes")
    if save_to:
        save_to.write_bytes(r.content)
        print(f"  saved → {save_to}")
    body = r.text if "text" in ct or len(r.content) < 4000 else "(binary, skipping preview)"
    if isinstance(body, str) and not body.startswith("<!DOCTYPE"):
        print(f"  preview:\n{body[:1200]}")
    elif isinstance(body, str):
        # HTML — extract title
        title = re.search(r"<title[^>]*>([\s\S]*?)</title>", body, re.I)
        if title:
            print(f"  HTML title: {title.group(1).strip()}")
    return r


def main():
    creds = CREDS.read_text().strip()
    user, _, pw = creds.partition(":")
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (compatible; TeamTime probe)"})
    login(s, user.strip(), pw.strip())
    print("login OK")

    out_dir = Path("/tmp")
    fetch(s, "Template", "/import/template/ImportInv", save_to=out_dir / "nrs-import-template.csv")
    fetch(s, "Sample 1 (ellen import)", "/import/file/39805", save_to=out_dir / "nrs-import-sample-39805.csv")
    fetch(s, "Sample 2 (509retro)", "/import/file/52179", save_to=out_dir / "nrs-import-sample-52179.csv")


if __name__ == "__main__":
    main()
