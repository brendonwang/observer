#!/usr/bin/env python3
"""Bundle site.html into a one-file Worker for dashboard copy/paste deployment."""
import json
from pathlib import Path
root = Path(__file__).resolve().parent
source = (root / 'worker_source.js').read_text(encoding='utf-8')
html = (root / 'site.html').read_text(encoding='utf-8')
assert '__EMBEDDED_SITE_HTML__' in source
output = source.replace('__EMBEDDED_SITE_HTML__', json.dumps(html, ensure_ascii=False))
(root / 'worker.js').write_text(output, encoding='utf-8')
print('Generated worker.js:', len(output), 'bytes')
