#!/usr/bin/env python3
"""Bundle Observer's dashboard into worker.js, or verify the committed build."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
source = (root / "worker_source.js").read_text(encoding="utf-8")
html = (root / "site.html").read_text(encoding="utf-8")
if source.count("__EMBEDDED_SITE_HTML__") != 1:
    raise SystemExit("Expected exactly one HTML placeholder in worker_source.js")
output = source.replace("__EMBEDDED_SITE_HTML__", json.dumps(html, ensure_ascii=False))
target = root / "worker.js"
if sys.argv[1:] == ["--check"]:
    if not target.exists() or target.read_text(encoding="utf-8") != output:
        raise SystemExit("worker.js is out of date; run python3 build_worker.py")
    print("Worker bundle is up to date")
elif not sys.argv[1:]:
    target.write_text(output, encoding="utf-8")
    print("Generated worker.js:", len(output), "bytes")
else:
    raise SystemExit("Usage: python3 build_worker.py [--check]")
