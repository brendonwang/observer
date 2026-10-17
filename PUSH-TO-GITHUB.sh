#!/bin/sh
set -eu
if ! command -v git >/dev/null 2>&1; then echo 'Git is required.' >&2; exit 1; fi
if [ ! -f agent.py ] || [ ! -f worker_source.js ]; then echo 'Run this from the codex-monitor folder.' >&2; exit 1; fi
if [ ! -d .git ]; then git init -b main; fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin https://github.com/brendonwang/observer.git
git add .
git commit -m 'Add Observer monitoring dashboard' || true
git fetch origin main
git merge --allow-unrelated-histories --no-edit origin/main
git push -u origin main
