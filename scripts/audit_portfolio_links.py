"""Audit every homepage link without logging in or modifying remote content."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import json
from pathlib import Path
import time
from urllib.parse import urljoin, urlsplit, unquote

import requests

ROOT = Path(__file__).resolve().parents[1]
PORTFOLIO = ROOT / "S3_content" / "portfolio"


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = set()
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and attrs.get("href"):
            self.links.add(attrs["href"])
        if attrs.get("id"):
            self.ids.add(attrs["id"])


def probe(url):
    started = time.perf_counter()
    try:
        with requests.get(url, timeout=(6, 12), stream=True) as response:
            return {"url": url, "status": response.status_code,
                    "final_url": response.url, "seconds": round(time.perf_counter()-started, 2)}
    except requests.RequestException as exc:
        return {"url": url, "error": type(exc).__name__,
                "seconds": round(time.perf_counter()-started, 2)}


def run(live):
    parser = Links()
    parser.feed((PORTFOLIO / "index.html").read_text(encoding="utf-8"))
    local = []
    urls = set()
    for href in sorted(parser.links):
        parsed = urlsplit(href)
        if href.startswith("#"):
            local.append({"href": href, "exists": parsed.fragment in parser.ids})
        elif not parsed.scheme:
            path = ROOT / "S3_content" / "index.html" if parsed.path == "/site/" else PORTFOLIO / unquote(parsed.path).lstrip("/")
            if path.is_dir():
                path = path / "index.html"
            local.append({"href": href, "exists": path.is_file()})
        if not href.startswith("#"):
            urls.add(urljoin("https://ctreeder.com/", href))
    report = {"source_links": local, "public_urls": sorted(urls)}
    if live:
        with ThreadPoolExecutor(max_workers=3) as pool:
            report["live_checks"] = list(pool.map(probe, sorted(urls)))
    output = ROOT / "browser-checks" / "portfolio-links.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    assert all(item["exists"] for item in local), "Homepage has missing local targets"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true")
    run(parser.parse_args().live)
