#!/usr/bin/env python3
"""Read-only Codex Desktop session observer. Python standard library only.

Does not invoke Codex, shell commands, or mutate the Codex home directory.
Only sends metadata and explicitly enabled final responses and screenshots.
"""
from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import os
import re
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

CONFIG_PATH = Path.home() / ".codex-monitor" / "config.json"
SESSIONS_PATH = Path.home() / ".codex" / "sessions"
INDEX_PATH = Path.home() / ".codex" / "session_index.jsonl"
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{6,100}$")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
URL_PATTERN = re.compile(r"https?://[^\s<>\"']+", re.I)
IMAGE_SIGNATURES = {
    ".png": ("image/png", lambda b: b.startswith(b"\x89PNG\r\n\x1a\n")),
    ".jpg": ("image/jpeg", lambda b: b.startswith(b"\xff\xd8\xff")),
    ".jpeg": ("image/jpeg", lambda b: b.startswith(b"\xff\xd8\xff")),
    ".webp": ("image/webp", lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP"),
}
MAX_PREVIEW_BYTES = 512 * 1024
MAX_LOG_TAIL = 1_200_000
KEEP_EVENTS = 22


def cleaned(value: object, limit: int = 600) -> str:
    if not isinstance(value, str):
        return ""
    return CONTROL_RE.sub("", value).strip()[:limit]


def read_tail_records(path: Path, max_bytes: int = MAX_LOG_TAIL) -> list[dict]:
    """Process complete JSONL records from the end, ignoring torn writes."""
    try:
        with path.open("rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            start = max(0, size - max_bytes)
            fh.seek(start)
            blob = fh.read(max_bytes)
    except OSError:
        return []
    if start:
        pos = blob.find(b"\n")
        if pos < 0:
            return []
        blob = blob[pos + 1 :]
    # Last line may be a partially written record; JSON parsing below ignores it.
    records = []
    for line in blob.splitlines():
        try:
            obj = json.loads(line)
        except (ValueError, UnicodeDecodeError):
            continue
        if isinstance(obj, dict):
            records.append(obj)
    return records


def load_titles(index_path: Path = INDEX_PATH) -> dict[str, str]:
    titles = {}
    for obj in read_tail_records(index_path, 1_000_000):
        sid = str(obj.get("id", ""))
        name = obj.get("thread_name") or obj.get("title")
        if ID_PATTERN.fullmatch(sid) and isinstance(name, str) and name.strip():
            titles[sid] = cleaned(name, 110)
    return titles


def event_timestamp(record: dict) -> int | None:
    stamp = record.get("timestamp")
    if not isinstance(stamp, str):
        return None
    try:
        return int(datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return None


def extract_assistant_text(p: dict) -> str:
    if p.get("type") == "agent_message":
        return cleaned(p.get("message"), 8000)
    if p.get("type") == "message" and p.get("role") == "assistant":
        parts = p.get("content")
        if isinstance(parts, list):
            return cleaned("\n".join(
                part.get("text", "") for part in parts
                if isinstance(part, dict) and part.get("type") == "output_text"
                and isinstance(part.get("text"), str)
            ), 8000)
    return ""


def parse_session(path: Path, titles: dict[str, str], content_mode: str = "metadata") -> dict | None:
    stem = path.stem
    if not stem.startswith("rollout-"):
        return None
    match = re.search(r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$", stem)
    if not match:
        return None
    thread_id = match.group(1)
    records = read_tail_records(path)
    events = []
    project = "Unknown project"
    event_state = "unknown"
    candidate_message = ""
    completed_message = ""
    last_activity_ms = 0
    first_timestamp = 0

    for item in records:
        stamp = event_timestamp(item)
        if stamp:
            last_activity_ms = max(last_activity_ms, stamp)
            if not first_timestamp:
                first_timestamp = stamp
        payload = item.get("payload", {})
        if not isinstance(payload, dict):
            continue
        kind = payload.get("type")
        if item.get("type") == "session_meta":
            cwd = payload.get("cwd", "")
            if isinstance(cwd, str) and cwd:
                project = cleaned(Path(cwd).name or "Project", 80)
        if item.get("type") == "event_msg":
            if kind in ("task_started", "turn_started"):
                event_state = "working"
                candidate_message = ""
                completed_message = ""  # Never show a previous turn's result while a new turn is running.
                events.append({"at": stamp, "kind": "start", "label": "Codex started a turn"})
            elif kind in ("task_complete", "turn_complete"):
                event_state = "completed"
                if candidate_message:
                    completed_message = candidate_message
                events.append({"at": stamp, "kind": "complete", "label": "Turn completed"})
            elif kind in ("turn_aborted", "task_aborted"):
                event_state = "interrupted"
                events.append({"at": stamp, "kind": "warning", "label": "Turn interrupted"})
            elif kind == "agent_message":
                msg = extract_assistant_text(payload)
                if msg:
                    candidate_message = msg
                    events.append({"at": stamp, "kind": "message", "label": "Codex posted a response"})
            elif kind in ("agent_reasoning", "agent_reasoning_raw_content"):
                # Never send chain-of-thought or raw reasoning text.
                events.append({"at": stamp, "kind": "thought", "label": "Codex is reasoning"})
            elif kind == "token_count":
                pass  # Avoid event noise.
            elif kind in ("exec_approval_request", "approval_request"):
                events.append({"at": stamp, "kind": "warning", "label": "Approval may be needed"})
        elif item.get("type") == "response_item":
            if kind in ("function_call", "custom_tool_call"):
                name = cleaned(payload.get("name") or "Tool", 55)
                events.append({"at": stamp, "kind": "tool", "label": "Tool: " + name})
            elif kind == "message":
                msg = extract_assistant_text(payload)
                if msg:
                    candidate_message = msg
                    events.append({"at": stamp, "kind": "message", "label": "Assistant response updated"})
    try:
        stat = path.stat()
    except OSError:
        return None
    changed = int(stat.st_mtime * 1000)
    last_activity_ms = max(last_activity_ms, changed)
    if event_state == "working" and int(time.time() * 1000) - last_activity_ms > 3 * 60_000:
        event_state = "quiet"
    if not events:
        events.append({"at": last_activity_ms, "kind": "info", "label": "Session discovered"})
    session = {
        "id": thread_id,
        "title": titles.get(thread_id) or (project if project != "Unknown project" else "Untitled Codex session"),
        "project": project,
        "status": event_state,
        "updated_at": last_activity_ms,
        "started_at": first_timestamp or last_activity_ms,
        "events": events[-KEEP_EVENTS:],
        "has_preview": False,
        "final_response": "",
    }
    if content_mode == "final" and completed_message:
        # Only include output from a completed turn. Metadata-only is the default.
        session["final_response"] = completed_message[:6000]
    return session


def gather_sessions(root: Path = SESSIONS_PATH, index: Path = INDEX_PATH,
                    max_sessions: int = 20, content_mode: str = "metadata") -> list[dict]:
    if not root.is_dir():
        return []
    root_real = root.resolve()
    paths = []
    for p in root.rglob("rollout-*.jsonl"):
        try:
            # Avoid following symlinks out of the Codex session tree.
            if not p.is_file() or not p.resolve().is_relative_to(root_real):
                continue
            paths.append((p.stat().st_mtime, p))
        except OSError:
            continue
    paths.sort(reverse=True)
    titles = load_titles(index)
    result = []
    for _, path in paths[:max_sessions]:
        item = parse_session(path, titles, content_mode)
        if item:
            result.append(item)
    return result


def preview_file(artifacts_dir: Path, thread_id: str) -> tuple[bytes, str, str] | None:
    """Explicit, allowlisted folder; never read arbitrary paths suggested by Codex."""
    if not artifacts_dir.is_dir() or not ID_PATTERN.fullmatch(thread_id):
        return None
    for ext in (".webp", ".png", ".jpg", ".jpeg"):
        for p in (artifacts_dir / (thread_id + ext),
                  artifacts_dir / thread_id / ("preview" + ext)):
            try:
                if not p.is_file() or p.is_symlink():
                    continue
                if not p.resolve().is_relative_to(artifacts_dir.resolve()):
                    continue
                if not 0 < p.stat().st_size <= MAX_PREVIEW_BYTES:
                    continue
                data = p.read_bytes()
                if len(data) > MAX_PREVIEW_BYTES:
                    continue
                mime, valid = IMAGE_SIGNATURES[ext]
                if valid(data):
                    return data, mime, p.name
            except OSError:
                continue
    return None


def validate_endpoint(endpoint: str) -> str:
    url = urllib.parse.urlsplit(endpoint)
    if url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1")):
        raise ValueError("Use an HTTPS worker URL (HTTP allowed only for localhost tests)")
    if not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError("Invalid Worker URL")
    return endpoint.rstrip("/")


def send_json(endpoint: str, token: str, path: str, payload: dict, timeout: int = 20) -> dict:
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(data) > 900_000:
        raise ValueError("Payload too large")
    request = urllib.request.Request(endpoint + path, data=data, method="POST", headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "User-Agent": "CodexMonitor/1.0",
    })
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read(20_000))


def write_config(cfg: dict, path: Path = CONFIG_PATH) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.exists() and (path.stat().st_mode & 0o077):
        raise RuntimeError("Existing config has broad filesystem permissions; run chmod 600 " + str(path))
    fd = os.open(str(path), os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2)
        fh.write("\n")
    os.chmod(path, 0o600)


def interactive_init(path: Path = CONFIG_PATH) -> None:
    print("Codex Monitor - Mac agent setup (read-only)")
    print("You must first deploy your private Cloudflare Worker.")
    endpoint = validate_endpoint(input("Worker URL (https://...workers.dev): ").strip())
    token = getpass.getpass("Agent token (Cloudflare AGENT_TOKEN secret): ").strip()
    if len(token) < 30:
        raise ValueError("Use a randomly generated agent token of at least 30 characters")
    choice = input("Share final assistant messages with Cloudflare? [y/N]: ").lower().strip()
    preview_dir = input("Optional approved screenshots folder (blank to disable): ").strip()
    if preview_dir:
        preview = Path(preview_dir).expanduser().resolve()
        if not preview.is_dir():
            raise ValueError("Screenshot folder must already exist")
    else:
        preview = None
    cfg = {
        "endpoint": endpoint,
        "agent_token": token,
        "device_id": "mac-" + uuid.uuid4().hex[:12],
        "content_mode": "final" if choice == "y" else "metadata",
        "screenshots_dir": str(preview) if preview else "",
        "interval_seconds": 30,
        "max_sessions": 20,
    }
    write_config(cfg, path)
    print("\nSaved private config:", path)
    print("Start monitoring: python3 agent.py watch")


def read_config(path: Path = CONFIG_PATH) -> dict:
    if not path.is_file():
        raise ValueError("No config found. Run: python3 agent.py init")
    if path.stat().st_mode & 0o077:
        raise ValueError("Config permissions too broad: chmod 600 " + str(path))
    cfg = json.loads(path.read_text("utf-8"))
    cfg["endpoint"] = validate_endpoint(cfg["endpoint"])
    if not isinstance(cfg.get("agent_token"), str) or len(cfg["agent_token"]) < 30:
        raise ValueError("Missing/weak agent token")
    if not ID_PATTERN.fullmatch(cfg.get("device_id", "")):
        raise ValueError("Invalid device ID")
    if cfg.get("content_mode") not in ("metadata", "final"):
        raise ValueError("Invalid content_mode")
    return cfg


def snapshot(cfg: dict, sessions_root: Path = SESSIONS_PATH, index: Path = INDEX_PATH) -> dict:
    sessions = gather_sessions(sessions_root, index, min(30, max(1, int(cfg.get("max_sessions", 20)))),
                               cfg.get("content_mode", "metadata"))
    return {"device_id": cfg["device_id"],
            "generated_at": int(time.time() * 1000),
            "threads": sessions, "protocol": 1}


def loop(cfg: dict, once: bool = False, dry_run: bool = False,
         sessions_root: Path = SESSIONS_PATH, index: Path = INDEX_PATH) -> None:
    interval = min(300, max(15, int(cfg.get("interval_seconds", 30))))
    last_fingerprint = ""
    last_send = 0.0
    sent_previews: dict[str, str] = {}
    preview_dir = cfg.get("screenshots_dir", "")
    while True:
        try:
            message = snapshot(cfg, sessions_root, index)
            fingerprint = hashlib.sha256(json.dumps(message["threads"], sort_keys=True).encode()).hexdigest()
            now = time.monotonic()
            if dry_run:
                print(json.dumps(message, indent=2, ensure_ascii=False))
            elif fingerprint != last_fingerprint or now - last_send >= 90:
                result = send_json(cfg["endpoint"], cfg["agent_token"], "/api/agent/sync", message)
                last_send = now
                last_fingerprint = fingerprint
                print(datetime.now().strftime("%H:%M:%S"), "Synced", len(message["threads"]), "threads", flush=True)
            if preview_dir and not dry_run:
                # Upload up to three most recent, explicitly approved images, only when they change.
                for thread in message["threads"][:3]:
                    preview = preview_file(Path(preview_dir), thread["id"])
                    if not preview:
                        continue
                    data, mime, filename = preview
                    digest = hashlib.sha256(data).hexdigest()
                    if sent_previews.get(thread["id"]) == digest:
                        continue
                    send_json(cfg["endpoint"], cfg["agent_token"], "/api/agent/preview", {
                        "thread_id": thread["id"], "filename": filename,
                        "mime": mime, "data": base64.b64encode(data).decode(),
                    })
                    sent_previews[thread["id"]] = digest
                    print("Uploaded approved preview for", thread["id"][:8], flush=True)
        except (OSError, ValueError, KeyError, urllib.error.URLError) as error:
            print("Sync error:", str(error)[:300], file=sys.stderr, flush=True)
            if once:
                raise
        if once:
            return
        try:
            time.sleep(interval)
        except KeyboardInterrupt:
            print("\nMonitor stopped")
            return


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("init", "watch", "once", "dry-run"))
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--sessions-root", type=Path, default=SESSIONS_PATH,
                        help="For testing / custom CODEX_HOME")
    parser.add_argument("--index", type=Path, default=INDEX_PATH)
    args = parser.parse_args()
    try:
        if args.command == "init":
            interactive_init(args.config)
        else:
            cfg = read_config(args.config)
            loop(cfg, once=args.command != "watch", dry_run=args.command == "dry-run",
                 sessions_root=args.sessions_root, index=args.index)
    except (ValueError, RuntimeError) as e:
        parser.exit(2, str(e) + "\n")


if __name__ == "__main__":
    main()
