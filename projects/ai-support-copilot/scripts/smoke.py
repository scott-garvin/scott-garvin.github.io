"""Verify the complete sample stack through the frontend, including built assets."""

import argparse
import json
from html.parser import HTMLParser
from urllib.request import Request, urlopen


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        url = attributes.get("src") if tag == "script" else attributes.get("href")
        if url and url.startswith("/_next/static/"):
            self.urls.append(url)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3001")
    base = parser.parse_args().base_url.rstrip("/")

    def read(path, body=None):
        request = Request(
            base + path,
            data=json.dumps(body).encode() if body else None,
            headers={"Content-Type": "application/json"},
        )
        with urlopen(request, timeout=15) as response:
            assert response.status == 200, f"Unexpected status for {path}"
            return response.read()

    health = json.loads(read("/api/health"))
    assert health["mode"] == "sample", "Smoke test requires sample mode; no paid calls allowed"
    html = read("/").decode()
    assert "Harbor" in html
    assets = Assets()
    assets.feed(html)
    assert assets.urls, "No Next.js static assets found"
    for url in set(assets.urls):
        assert read(url), f"Empty static asset: {url}"
    tickets = json.loads(read("/api/tickets"))["tickets"]
    assert len(tickets) == 4
    result = json.loads(read("/api/drafts", {"ticket_id": "HBR-1042"}))
    assert result["mode"] == "sample"
    assert result["citation_ids"] == ["reporting-access-0"]
    assert "sign out" in result["reply"]
    print("PASS: frontend assets, API proxy, bundled seed data, retrieval, and cited sample draft")


if __name__ == "__main__":
    main()
