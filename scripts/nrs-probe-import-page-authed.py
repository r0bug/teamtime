#!/usr/bin/env python3
"""
Probe https://www.nrsaccounting.com/import/type/ImportInv with a logged-in
session, using the same login flow as scraper-imports/nrs_scraper.py.

Reads creds from scraper-imports/nrscreds.secret (format: email:password).
Never prints credentials.
"""
import os
import re
import sys
import requests
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CREDS = REPO_ROOT / "scraper-imports" / "nrscreds.secret"
BASE = "https://www.nrsaccounting.com"
TARGET = f"{BASE}/import/type/ImportInv"


def load_creds(path: Path) -> tuple[str, str]:
    if not path.exists():
        sys.exit(f"creds file not found: {path}")
    raw = path.read_text().strip()
    if ":" not in raw:
        sys.exit("creds file must be 'email:password'")
    user, _, pw = raw.partition(":")
    return user.strip(), pw.strip()


def login(session: requests.Session, user: str, pw: str) -> None:
    session.get(f"{BASE}/")
    resp = session.post(
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
    if "Log Out" not in resp.text and "applicationAction=logout" not in resp.text:
        if "Invalid" in resp.text or "incorrect" in resp.text.lower():
            sys.exit("login failed: invalid credentials")
        # accept anyway — same heuristic as the scraper
    print("login OK")


def summarize_html(html: str) -> None:
    title = re.search(r"<title[^>]*>([\s\S]*?)</title>", html, re.I)
    notice = re.search(r'<span class="Notice"[^>]*>([\s\S]*?)</span>', html, re.I)
    forms = re.findall(
        r'<form[^>]*?(?:action="([^"]*)"|method="([^"]*)"|enctype="([^"]*)"|id="([^"]*)")[^>]*>',
        html,
        re.I,
    )
    inputs = re.findall(
        r'<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"[^>]*?(?:type="([^"]*)")?',
        html,
        re.I,
    )
    links = re.findall(r'<a[^>]+href="([^"]+)"[^>]*>([^<]{1,80})</a>', html, re.I)
    sample_links = [
        f"{text.strip()} → {href}"
        for href, text in links
        if any(k in (href + text).lower() for k in ("template", "sample", "download", "import"))
    ][:15]

    print(f"\nTitle: {title.group(1).strip() if title else '?'}")
    if notice:
        print(f"Notice: {notice.group(1).strip()}")
    if forms:
        print(f"\nForms ({len(forms)}):")
        for action, method, enctype, id_ in forms[:5]:
            print(f"  - method={method or '?'}, action={action or '(self)'}, enctype={enctype or '?'}, id={id_ or '?'}")
    if inputs:
        print(f"\nInput field names ({len(inputs)}):")
        for name, type_ in inputs[:60]:
            print(f"  - {name}{f' ({type_})' if type_ else ''}")
    if sample_links:
        print("\nNotable links (template/sample/download/import):")
        for s in sample_links:
            print(f"  - {s}")
    # Look for plupload config or expected-format hints
    plupload_url = re.search(r'plupload[^{]*\{[^}]*url\s*:\s*[\'"]([^\'"]+)', html, re.I)
    if plupload_url:
        print(f"\nplupload URL: {plupload_url.group(1)}")
    # Hunt for any references to /import/* paths in inline JS/HTML
    paths = sorted(set(m for m in re.findall(r'["\'](/import[^\s"\']+)["\']', html)))
    if paths:
        print("\n/import/* paths referenced inline:")
        for p in paths[:20]:
            print(f"  - {p}")
    # Hunt for expected column headers (template hints)
    expected = re.findall(r'(?:expected|required|columns?|headers?)[^.<\n]{0,80}', html, re.I)
    if expected:
        print("\nExpected/required hints:")
        for s in expected[:8]:
            print(f"  - {s.strip()}")


def main() -> None:
    user, pw = load_creds(CREDS)
    s = requests.Session()
    s.headers.update({"User-Agent": "Mozilla/5.0 (compatible; TeamTime probe)"})
    login(s, user, pw)
    r = s.get(TARGET)
    print(f"\nGET {TARGET} → HTTP {r.status_code} ({len(r.text)} bytes)")
    summarize_html(r.text)
    out_path = Path("/tmp/import-inv-authed.html")
    out_path.write_text(r.text)
    print(f"\nFull HTML saved to {out_path}")


if __name__ == "__main__":
    main()
