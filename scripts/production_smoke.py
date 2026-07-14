from html.parser import HTMLParser
import json
import os
import sys
from urllib.error import HTTPError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


FRONTEND_URL = os.getenv("NOTES_FRONTEND_URL", "https://notevault-lovat.vercel.app")
BACKEND_URL = os.getenv("NOTES_BACKEND_URL", "https://notevault-api.vercel.app")
FORBIDDEN_BUNDLE_VALUES = (
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "e2e@example.com",
    "not-a-jwt",
)


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "script" and values.get("src"):
            self.assets.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet" and values.get("href"):
            self.assets.append(values["href"] or "")


def fetch(path: str, *, base: str, method: str = "GET", headers=None):
    request = Request(
        urljoin(f"{base.rstrip('/')}/", path.lstrip('/')),
        method=method,
        headers={"User-Agent": "NoteVault-production-smoke/1.1", **(headers or {})},
    )
    try:
        with urlopen(request, timeout=30) as response:
            return response.status, response.headers, response.read()
    except HTTPError as error:
        return error.code, error.headers, error.read()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> int:
    frontend_status, frontend_headers, frontend_body = fetch("/", base=FRONTEND_URL)
    require(frontend_status == 200, f"frontend / returned {frontend_status}")
    require("text/html" in frontend_headers.get_content_type(), "frontend / is not HTML")
    html = frontend_body.decode("utf-8")

    parser = AssetParser()
    parser.feed(html)
    frontend_host = urlparse(FRONTEND_URL).netloc
    bundle_text = html
    for asset in parser.assets:
        asset_url = urljoin(FRONTEND_URL, asset)
        require(urlparse(asset_url).netloc == frontend_host, f"unexpected asset host: {asset_url}")
        status, _, body = fetch(asset_url, base=FRONTEND_URL)
        require(status == 200, f"frontend asset returned {status}: {asset_url}")
        bundle_text += body.decode("utf-8", errors="replace")
    for forbidden in FORBIDDEN_BUNDLE_VALUES:
        require(forbidden not in bundle_text, f"production bundle contains {forbidden}")

    health_status, _, health_body = fetch("/health", base=BACKEND_URL)
    require(health_status == 200, f"backend /health returned {health_status}")
    require(json.loads(health_body).get("ok") is True, "backend /health payload is not ok")

    docs_status, docs_headers, _ = fetch("/docs", base=BACKEND_URL)
    require(docs_status == 200, f"backend /docs returned {docs_status}")
    require("text/html" in docs_headers.get_content_type(), "backend /docs is not HTML")

    openapi_status, _, openapi_body = fetch("/openapi.json", base=BACKEND_URL)
    require(openapi_status == 200, f"backend /openapi.json returned {openapi_status}")
    openapi = json.loads(openapi_body)
    require(openapi.get("info", {}).get("title") == "NoteVault API", "unexpected OpenAPI title")

    notes_status, _, _ = fetch("/notes", base=BACKEND_URL)
    require(notes_status == 401, f"anonymous backend /notes returned {notes_status}, expected 401")

    options_status, options_headers, _ = fetch(
        "/notes",
        base=BACKEND_URL,
        method="OPTIONS",
        headers={
            "Origin": FRONTEND_URL,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    require(options_status == 200, f"backend OPTIONS /notes returned {options_status}")
    require(
        options_headers.get("Access-Control-Allow-Origin") == FRONTEND_URL,
        "backend CORS origin does not exactly match the frontend",
    )

    print("Production anonymous smoke passed for frontend, backend, auth, assets, and CORS.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Production smoke failed: {error}", file=sys.stderr)
        raise SystemExit(1)
