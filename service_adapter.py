"""Opt-in read-only monitoring of explicitly configured HTTP health endpoints.

Only the URL supplied by the local user is contacted. We send HEAD requests,
never follow redirects, and never read response bodies.
"""
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CONFIG = Path.home() / ".observer" / "services.json"


def allowed(url):
    if not isinstance(url, str) or len(url) > 2048:
        return False
    try:
        parsed = urllib.parse.urlsplit(url)
        if (parsed.username or parsed.password or parsed.fragment
                or not parsed.hostname or parsed.scheme not in ("https", "http")):
            return False
        if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            return False
        return parsed.port is None or 0 < parsed.port < 65536
    except ValueError:
        return False


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def monitor_service(item, now=None, opener=None):
    now = int(time.time() * 1000) if now is None else now
    name, url = item["name"], item["url"]
    if not allowed(url):
        raise ValueError("Unsupported health URL")
    opener = opener or urllib.request.build_opener(NoRedirect).open
    started = time.monotonic()
    status = None
    try:
        request = urllib.request.Request(
            url, method="HEAD", headers={"User-Agent": "Observer/0.2"})
        with opener(request, timeout=3) as response:
            status = response.status
    except urllib.error.HTTPError as exc:
        status = exc.code
    except (urllib.error.URLError, TimeoutError, OSError):
        pass
    elapsed = int((time.monotonic() - started) * 1000)
    healthy = status is not None and 200 <= status < 300
    uid = hashlib.sha256((name + "\0" + url).encode("utf-8")).hexdigest()[:24]
    return {
        "id": "service-" + uid,
        "project": item.get("project") or "Services",
        "source": "Service",
        "title": name,
        "status": "completed" if healthy else "failed",
        "started_at": now,
        "updated_at": now,
        "events": [{
            "at": now,
            "kind": "complete" if healthy else "warning",
            "label": ("Healthy" if healthy else "Unreachable") + " (" + str(elapsed) + "ms)",
        }],
        "final_response": "HTTP " + str(status) if status is not None else "No response",
    }


def gather_services(config=CONFIG, max_services=10, content_mode="metadata"):
    try:
        items = json.loads(Path(config).read_text("utf-8"))
    except (OSError, ValueError):
        return []
    if not isinstance(items, list):
        return []
    results = []
    for item in items[:max_services]:
        if not isinstance(item, dict):
            continue
        name, url = item.get("name"), item.get("url")
        if not isinstance(name, str) or not 0 < len(name) <= 60 or not allowed(url):
            continue
        try:
            activity = monitor_service(item)
        except (OSError, ValueError):
            continue
        if content_mode != "final":
            activity["final_response"] = ""
        results.append(activity)
    return results
