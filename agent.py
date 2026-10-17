#!/usr/bin/env python3
"""Read-only multi-source activity observer. Python standard library only.

Codex, Claude Code, and opted-in JSON snapshot directories are supported.
Never invokes tools, runs commands, or mutates monitored sources.
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

import conversation
from datetime import datetime, timezone
from pathlib import Path

CONFIG_PATH = Path.home() / ".observer" / "config.json"
LEGACY_CONFIG_PATH = Path.home() / ".codex-monitor" / "config.json"
SESSIONS_PATH = Path.home() / ".codex" / "sessions"
INDEX_PATH = Path.home() / ".codex" / "session_index.jsonl"
CLAUDE_PATH = Path.home() / ".claude" / "projects"
PI_PATH = Path.home() / ".pi" / "agent" / "sessions"
FEEDS_PATH = Path.home() / ".observer" / "feeds"
STATUSES = {"working", "completed", "quiet", "interrupted", "unknown"}
EVENT_KINDS = {"start", "complete", "warning", "tool", "message", "thought", "info"}
UUID_PATTERN = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")

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



def first_record(path: Path, limit: int = 128_000) -> dict:
    """Read session metadata even when the JSONL tail no longer includes its header."""
    try:
        with path.open("rb") as fh:
            line = fh.readline(limit + 1)
        if len(line) > limit:
            return {}
        item = json.loads(line)
        return item if isinstance(item, dict) else {}
    except (OSError, ValueError, UnicodeDecodeError):
        return {}


def small_json(path: Path, max_bytes: int = 8192) -> dict:
    """Read an optional, bounded sidecar (never follow symlinks)."""
    try:
        if path.is_symlink() or not 0 < path.stat().st_size <= max_bytes:
            return {}
        value = json.loads(path.read_text("utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError, UnicodeDecodeError):
        return {}


def is_codex_guardian(meta: dict) -> bool:
    """Identify internal Codex approval reviewers using explicit rollout metadata."""
    if not isinstance(meta, dict):
        return False
    if meta.get("thread_source") == "guardian_review":
        return True
    source = meta.get("source")
    if not isinstance(source, dict):
        return False
    subagent = source.get("subagent")
    return isinstance(subagent, dict) and subagent.get("other") == "guardian"


def codex_parent(meta: dict) -> str:
    """Prefer the rollout's explicit relationship; never infer from prompts."""
    parent = meta.get("parent_thread_id")
    src = meta.get("source")
    if not parent and isinstance(src, dict):
        subagent = src.get("subagent")
        if isinstance(subagent, dict):
            spawn = subagent.get("thread_spawn")
            if isinstance(spawn, dict):
                parent = spawn.get("parent_thread_id")
    return parent.lower() if isinstance(parent, str) and UUID_PATTERN.fullmatch(parent) else ""


def codex_agent_label(meta: dict) -> str:
    src = meta.get("source")
    if isinstance(src, dict) and isinstance(src.get("subagent"), dict):
        details = src["subagent"]
        spawn = details.get("thread_spawn")
        if isinstance(spawn, dict):
            for key in ("agent_nickname", "agent_role", "agent_path"):
                value = spawn.get(key)
                if isinstance(value, str) and value.strip():
                    return cleaned(value.split("/")[-1] if key == "agent_path" else value, 65)
        other = details.get("other")
        if isinstance(other, str):
            return cleaned(other, 65)
    for key in ("agent_nickname", "agent_role"):
        if isinstance(meta.get(key), str):
            return cleaned(meta[key], 65)
    return "Subagent"


def parse_session(path: Path, titles: dict[str, str], content_mode: str = "metadata") -> dict | None:
    stem = path.stem
    if not stem.startswith("rollout-"):
        return None
    match = re.search(r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$", stem)
    if not match:
        return None
    thread_id = match.group(1)
    records = read_tail_records(path)
    first = first_record(path)
    metadata = first.get("payload", {}) if first.get("type") == "session_meta" else {}
    if not isinstance(metadata, dict):
        metadata = {}
    if is_codex_guardian(metadata):
        return None
    events = []
    cwd = metadata.get("cwd")
    project = cleaned(Path(cwd).name, 80) if isinstance(cwd, str) and cwd else "Unknown project"
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
            metadata = payload
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
    if is_codex_guardian(metadata):
        return None
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
        "title": titles.get(thread_id) or (project if project != "Unknown project" else "Codex session"),
        "project": project,
        "source": "Codex",
        "parent_id": codex_parent(metadata) if codex_parent(metadata) != thread_id.lower() else "",
        "agent_label": codex_agent_label(metadata) if codex_parent(metadata) or metadata.get("thread_source") == "subagent" else "",
        "status": event_state,
        "updated_at": last_activity_ms,
        "started_at": first_timestamp or last_activity_ms,
        "events": events[-KEEP_EVENTS:],
        "has_preview": False,
        "final_response": "",
    }
    if content_mode in ("final", "transcript") and completed_message:
        session["final_response"] = completed_message[:6000]
    if content_mode == "transcript":
        session["conversation"], session["conversation_truncated"], session["summary"] = conversation.codex(records)
    return session


def gather_sessions(root: Path = SESSIONS_PATH, index: Path = INDEX_PATH,
                    max_sessions: int = 20, content_mode: str = "metadata") -> list[dict]:
    if not root.is_dir():
        return []
    root_real = root.resolve()
    paths = []
    for p in root.rglob("rollout-*.jsonl"):
        try:
            # Never read a symlink or a file outside the selected source tree.
            if p.is_symlink() or not p.is_file() or not p.resolve().is_relative_to(root_real):
                continue
            paths.append((p.stat().st_mtime, p))
        except OSError:
            continue
    paths.sort(reverse=True)
    # Index filenames so recent child rollouts can bring along older parents.
    indexed = {}
    for _, path in paths:
        match = UUID_PATTERN.search(path.stem)
        if match and path.stem.endswith(match.group()):
            indexed[match.group().lower()] = path
    chosen = {}
    eligible = 0
    for _, path in paths:
        entry = first_record(path)
        meta = entry.get("payload") if entry.get("type") == "session_meta" else None
        if isinstance(meta, dict) and is_codex_guardian(meta):
            continue  # Internal reviews must not displace real sessions.
        eligible += 1
        cursor = path
        for _ in range(10):  # bounded ancestor walk
            if cursor in chosen:
                break
            entry = first_record(cursor)
            meta = entry.get("payload") if entry.get("type") == "session_meta" else None
            if isinstance(meta, dict) and is_codex_guardian(meta):
                break
            chosen[cursor] = True
            parent = codex_parent(meta) if isinstance(meta, dict) else ""
            cursor = indexed.get(parent)
            if cursor is None:
                break
        if eligible >= max_sessions * 4:
            break
    titles = load_titles(index)
    result = []
    for path in chosen:
        item = parse_session(path, titles, content_mode)
        if item:
            result.append(item)
    return result




def source_files(root: Path, pattern: str, max_files: int) -> list[Path]:
    """Newest files inside a designated directory; no symlinks or escapes."""
    root = root.expanduser()
    if not root.is_dir() or root.is_symlink():
        return []
    resolved = root.resolve()
    found = []
    for path in root.rglob(pattern):
        try:
            if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(resolved):
                continue
            found.append((path.stat().st_mtime, path))
        except OSError:
            continue
    found.sort(key=lambda item: item[0], reverse=True)
    return [path for _, path in found[:max_files]]


def claude_text(message: dict) -> str:
    """Extract only visible assistant text, never thinking/tool arguments."""
    content = message.get("content")
    if not isinstance(content, list):
        return ""
    return cleaned("\n".join(
        part["text"] for part in content
        if isinstance(part, dict) and part.get("type") == "text"
        and isinstance(part.get("text"), str)
    ), 8000)


def parse_claude_session(path: Path, content_mode: str = "metadata") -> dict | None:
    match = UUID_PATTERN.fullmatch(path.stem)
    child = path.stem.startswith("agent-") and path.parent.name == "subagents"
    if not match and not child:
        return None
    agent_key = path.stem[6:] if child else ""
    if child and not re.fullmatch(r"[A-Za-z0-9_-]{3,100}", agent_key):
        return None
    sidecar = small_json(path.with_suffix(".meta.json")) if child else {}
    parent_id = ("claude-" + path.parent.parent.name.lower()
                 if child and UUID_PATTERN.fullmatch(path.parent.parent.name)
                 else "")
    if child and not parent_id and isinstance(sidecar.get("parentSessionId"), str) and UUID_PATTERN.fullmatch(sidecar["parentSessionId"]):
        parent_id = "claude-" + sidecar["parentSessionId"].lower()
    events = []
    records = read_tail_records(path)
    project = "Unknown project"
    title = ""
    status = "unknown"
    candidate = ""
    completed = ""
    first_ms = 0
    last_ms = 0
    for entry in records:
        at = event_timestamp(entry)
        if at:
            last_ms = max(last_ms, at)
            if not first_ms:
                first_ms = at
        cwd = entry.get("cwd")
        if isinstance(cwd, str) and cwd:
            project = cleaned(Path(cwd).name, 80) or project
        slug = entry.get("slug")
        if isinstance(slug, str) and slug:
            title = cleaned(slug.replace("-", " "), 110)
        typ = entry.get("type")
        if typ == "user":
            # A new user turn invalidates any previously completed result.
            status = "working"
            candidate = completed = ""
            events.append({"at": at, "kind": "start", "label": "Turn started"})
        elif typ == "assistant":
            message = entry.get("message")
            if not isinstance(message, dict):
                continue
            content = message.get("content")
            if isinstance(content, list):
                tools = [
                    cleaned(block.get("name"), 55)
                    for block in content
                    if isinstance(block, dict) and block.get("type") == "tool_use"
                ]
                for tool in tools:
                    events.append({"at": at, "kind": "tool", "label": "Tool: " + (tool or "Tool")})
                if tools:
                    status = "working"
            output = claude_text(message)
            if output:
                candidate = output
                events.append({"at": at, "kind": "message", "label": "Assistant responded"})
            if message.get("stop_reason") == "end_turn":
                status = "completed"
                completed = candidate
                events.append({"at": at, "kind": "complete", "label": "Turn completed"})
        elif typ == "system" and entry.get("subtype") == "turn_duration":
            status = "completed"
            completed = candidate
            events.append({"at": at, "kind": "complete", "label": "Turn completed"})
        elif typ == "result":
            # Some exported sessions include an explicit result record.
            if entry.get("is_error"):
                status = "interrupted"
                events.append({"at": at, "kind": "warning", "label": "Turn interrupted"})
            else:
                status = "completed"
                completed = candidate
                events.append({"at": at, "kind": "complete", "label": "Turn completed"})
    try:
        last_ms = max(last_ms, int(path.stat().st_mtime * 1000))
    except OSError:
        return None
    if status == "working" and int(time.time() * 1000) - last_ms > 180_000:
        status = "quiet"
    if not events:
        events.append({"at": last_ms, "kind": "info", "label": "Session discovered"})
    session = {
        "id": ("claude-sub-" + hashlib.sha256(str(path).encode()).hexdigest()[:24]) if child else "claude-" + match.group().lower(),
        "title": (cleaned(sidecar.get("name"), 110) or ("Subagent " + agent_key[:12])) if child else (title or (project if project != "Unknown project" else "Claude Code session")),
        "project": project,
        "source": "Claude Code",
        "parent_id": parent_id,
        "agent_label": cleaned(sidecar.get("name"), 65) or "Subagent" if child else "",
        "status": status,
        "updated_at": last_ms,
        "started_at": first_ms or last_ms,
        "events": events[-KEEP_EVENTS:],
        "has_preview": False,
        "final_response": completed[:6000] if content_mode in ("final", "transcript") else "",
    }
    if content_mode == "transcript":
        session["conversation"], session["conversation_truncated"], session["summary"] = conversation.claude(records)
    return session


def gather_claude_sessions(root: Path = CLAUDE_PATH, max_sessions: int = 20,
                           content_mode: str = "metadata") -> list[dict]:
    result = []
    for path in source_files(root, "*.jsonl", max_sessions * 6):
        item = parse_claude_session(path, content_mode)
        if item:
            result.append(item)
        if len(result) >= max_sessions:
            break
    return result



def parse_pi_session(path: Path, content_mode: str = "metadata") -> dict | None:
    header = first_record(path)
    if header.get("type") != "session":
        return None
    raw_id = header.get("id")
    if not isinstance(raw_id, str) or not ID_PATTERN.fullmatch(raw_id):
        return None
    parent_path = header.get("parentSession")
    parent_id = ""
    if isinstance(parent_path, str):
        parent_header = first_record(Path(parent_path).expanduser())
        parent_raw = parent_header.get("id")
        if isinstance(parent_raw, str) and ID_PATTERN.fullmatch(parent_raw) and parent_raw != raw_id:
            parent_id = "pi-" + parent_raw
    cwd = header.get("cwd")
    project = cleaned(Path(cwd).name, 80) if isinstance(cwd, str) and cwd else "Unknown project"
    title = ""
    status = "unknown"
    last_ms = 0
    first_ms = event_timestamp(header) or 0
    candidate = ""
    final = ""
    events = []
    records = conversation.pi_active_records(read_tail_records(path))
    for entry in records:
        at = event_timestamp(entry)
        last_ms = max(last_ms, at or 0)
        if entry.get("type") != "message":
            continue
        message = entry.get("message")
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        if role == "user":
            status = "working"
            candidate = final = ""
            events.append({"at": at, "kind": "start", "label": "Turn started"})
        elif role == "assistant":
            content = message.get("content")
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "toolCall":
                        events.append({"at": at, "kind": "tool", "label": "Tool: " + cleaned(block.get("name"), 55)})
                text = cleaned("\n".join(
                    block["text"] for block in content
                    if isinstance(block, dict) and block.get("type") == "text"
                    and isinstance(block.get("text"), str)
                ), 8000)
                if text:
                    candidate = text
                    events.append({"at": at, "kind": "message", "label": "Assistant responded"})
            stop = message.get("stopReason")
            if stop in ("stop", "end_turn"):
                status = "completed"
                final = candidate
                events.append({"at": at, "kind": "complete", "label": "Turn completed"})
            elif stop in ("error", "aborted"):
                status = "interrupted"
    try:
        last_ms = max(last_ms, int(path.stat().st_mtime * 1000))
    except OSError:
        return None
    if status == "working" and int(time.time() * 1000) - last_ms > 180_000:
        status = "quiet"
    if not events:
        events.append({"at": last_ms, "kind": "info", "label": "Session discovered"})
    session = {
        "id": "pi-" + raw_id,
        "source": "Pi",
        "title": title or (project if project != "Unknown project" else "Pi session"),
        "project": project,
        "parent_id": parent_id,
        "agent_label": "Fork" if parent_id else "",
        "status": status,
        "updated_at": last_ms, "started_at": first_ms or last_ms,
        "events": events[-KEEP_EVENTS:], "has_preview": False,
        "final_response": final[:6000] if content_mode in ("final", "transcript") else "",
    }
    if content_mode == "transcript":
        session["conversation"], session["conversation_truncated"], session["summary"] = conversation.pi(records)
    return session


def gather_pi_sessions(root: Path = PI_PATH, max_sessions: int = 20,
                       content_mode: str = "metadata") -> list[dict]:
    result = []
    for path in source_files(root, "*.jsonl", max_sessions * 4):
        item = parse_pi_session(path, content_mode)
        if item:
            result.append(item)
    return result


def parse_feed_snapshot(path: Path, root: Path, content_mode: str = "metadata") -> dict | None:
    """Read a small, explicit JSON activity snapshot without executing anything."""
    try:
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            return None
        if not 0 < path.stat().st_size <= 128_000:
            return None
        obj = json.loads(path.read_text("utf-8"))
        if not isinstance(obj, dict):
            return None
        external_id = obj.get("id") or path.stem
        if not isinstance(external_id, str) or not ID_PATTERN.fullmatch(external_id):
            return None
        # Relative path + declared ID give stable, collision-resistant identities.
        key = str(path.relative_to(root)) + ":" + external_id
        session_id = "feed-" + hashlib.sha256(key.encode()).hexdigest()[:24]
        changed = int(path.stat().st_mtime * 1000)
    except (OSError, UnicodeError, ValueError):
        return None
    updated = obj.get("updated_at")
    if not isinstance(updated, (int, float)) or isinstance(updated, bool) or not 946684800000 <= updated <= time.time() * 1000 + 300_000:
        updated = changed
    status = obj.get("status") if obj.get("status") in STATUSES else "unknown"
    if status == "working" and int(time.time() * 1000) - updated > 180_000:
        status = "quiet"
    events = []
    for event in (obj.get("events") if isinstance(obj.get("events"), list) else [])[-KEEP_EVENTS:]:
        if not isinstance(event, dict):
            continue
        at = event.get("at")
        if not isinstance(at, (int, float)) or isinstance(at, bool) or not 946684800000 <= at <= time.time() * 1000 + 300_000:
            at = updated
        events.append({
            "at": int(at), "kind": event.get("kind") if event.get("kind") in EVENT_KINDS else "info",
            "label": cleaned(event.get("label"), 140),
        })
    if not events:
        events = [{"at": int(updated), "kind": "info", "label": "Last updated"}]
    started = obj.get("started_at")
    if not isinstance(started, (int, float)) or isinstance(started, bool) or started < 946684800000:
        started = updated
    session = {
        "id": session_id,
        "title": cleaned(obj.get("title"), 110) or external_id,
        "project": cleaned(obj.get("project"), 80) or "Unknown project",
        "source": cleaned(obj.get("source"), 40) or "Custom",
        "status": status, "updated_at": int(updated), "started_at": int(started),
        "events": events, "has_preview": False,
        "final_response": cleaned(obj.get("final_response"), 6000) if content_mode in ("final", "transcript") and status == "completed" else "",
    }
    if content_mode == "transcript":
        session["conversation"], session["conversation_truncated"], session["summary"] = conversation.custom(obj.get("conversation"))
    return session


def gather_feeds(root: Path = FEEDS_PATH, max_sessions: int = 20,
                 content_mode: str = "metadata") -> list[dict]:
    result = []
    for path in source_files(root, "*.json", max_sessions):
        item = parse_feed_snapshot(path, root, content_mode)
        if item:
            result.append(item)
    return result


def configured_sessions(cfg: dict, sessions_root: Path = SESSIONS_PATH,
                        index: Path = INDEX_PATH) -> list[dict]:
    """Collect from the configured adapters using one unchanged sync protocol."""
    max_sessions = min(30, max(1, int(cfg.get("max_sessions", 20))))
    mode = cfg.get("content_mode", "metadata")
    sources = cfg.get("sources")
    if sources is None:  # Existing Codex-only config remains usable.
        sources = [{"type": "codex"}]
    result = []
    for source in sources:
        kind = source.get("type") if isinstance(source, dict) else source
        if kind == "codex":
            root = Path(source.get("path", sessions_root)) if isinstance(source, dict) else sessions_root
            names = Path(source.get("index", index)) if isinstance(source, dict) else index
            result.extend(gather_sessions(root.expanduser(), names.expanduser(), max_sessions, mode))
        elif kind == "claude":
            root = Path(source.get("path", CLAUDE_PATH)) if isinstance(source, dict) else CLAUDE_PATH
            result.extend(gather_claude_sessions(root.expanduser(), max_sessions, mode))
        elif kind == "pi":
            root = Path(source.get("path", PI_PATH)) if isinstance(source, dict) else PI_PATH
            result.extend(gather_pi_sessions(root.expanduser(), max_sessions, mode))
        elif kind == "files":
            root = Path(source.get("path", FEEDS_PATH)) if isinstance(source, dict) else FEEDS_PATH
            result.extend(gather_feeds(root.expanduser(), max_sessions, mode))
    result.sort(key=lambda item: item["updated_at"], reverse=True)
    unique = []
    seen = set()
    for item in result:
        if item["id"] not in seen:
            seen.add(item["id"])
            unique.append(item)
        if len(unique) == max_sessions:
            break
    return unique


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
        "User-Agent": "Observer/2.0",
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
    print("Observer - Mac agent setup (read-only)")
    print("You must first deploy your private Cloudflare Worker.")
    endpoint = validate_endpoint(input("Worker URL (https://...workers.dev): ").strip())
    token = getpass.getpass("Agent token (Cloudflare AGENT_TOKEN secret): ").strip()
    if len(token) < 30:
        raise ValueError("Use a randomly generated agent token of at least 30 characters")
    choices = input("Sources [codex,claude,pi,files] (default: codex,files): ").lower().strip() or "codex,files"
    types = [part.strip() for part in choices.split(",")]
    if len(types) != len(set(types)) or not types or any(part not in ("codex", "claude", "pi", "files") for part in types):
        raise ValueError("Choose comma-separated sources from codex,claude,pi,files")
    print("Content shared with Cloudflare: metadata only by default.")
    print("  f: completed responses only")
    print("  t: conversation, prompts, assistant text, commands and output previews")
    print("     This may include private file contents or secrets from tool output.")
    choice = input("Content mode [m/f/t] (default: m): ").lower().strip()
    if choice not in ("", "m", "n", "f", "y", "t"):
        raise ValueError("Choose m, f, or t")
    mode = "transcript" if choice == "t" else "final" if choice in ("f", "y") else "metadata"
    if mode == "transcript" and input("Type SYNC to allow conversation upload: ").strip() != "SYNC":
        raise ValueError("Conversation upload not enabled")
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
        "content_mode": mode,
        "screenshots_dir": str(preview) if preview else "",
        "interval_seconds": 30,
        "max_sessions": 20,
        "sources": [{"type": kind} for kind in types],
    }
    write_config(cfg, path)
    print("\nSaved private config:", path)
    print("Start monitoring: python3 agent.py watch")


def read_config(path: Path = CONFIG_PATH) -> dict:
    if path == CONFIG_PATH and not path.is_file() and LEGACY_CONFIG_PATH.is_file():
        path = LEGACY_CONFIG_PATH
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
    if cfg.get("content_mode") not in ("metadata", "final", "transcript"):
        raise ValueError("Invalid content_mode")
    sources = cfg.get("sources")
    if sources is not None:
        if not isinstance(sources, list) or not sources or len(sources) > 4:
            raise ValueError("Invalid sources")
        kinds = []
        for source in sources:
            kind = source.get("type") if isinstance(source, dict) else source
            if kind not in ("codex", "claude", "pi", "files") or kind in kinds:
                raise ValueError("Unknown or duplicate source")
            if isinstance(source, dict):
                for key in ("path", "index"):
                    if key in source and (not isinstance(source[key], str) or not source[key].strip()):
                        raise ValueError("Invalid source path")
            kinds.append(kind)
    return cfg


def snapshot(cfg: dict, sessions_root: Path = SESSIONS_PATH, index: Path = INDEX_PATH) -> dict:
    sessions = configured_sessions(cfg, sessions_root, index)
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


def set_content_mode(cfg_path: Path, mode: str) -> None:
    """Change sharing policy without rotating existing device credentials."""
    config_path = cfg_path
    if config_path == CONFIG_PATH and not config_path.exists() and LEGACY_CONFIG_PATH.is_file():
        config_path = LEGACY_CONFIG_PATH
    cfg = read_config(config_path)
    if mode == "transcript":
        print("Conversation mode syncs prompts, visible assistant text, tool commands,")
        print("and tool output previews to Cloudflare. These may contain sensitive data.")
        if input("Type SYNC to enable transcript uploads: ").strip() != "SYNC":
            raise ValueError("Sharing setting unchanged")
    cfg["content_mode"] = mode
    write_config(cfg, config_path)
    print("Content mode:", mode, "- restart agent.py watch to apply")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("init", "watch", "once", "dry-run", "set-content"))
    parser.add_argument("mode", nargs="?", choices=("metadata", "final", "transcript"))
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--sessions-root", type=Path, default=SESSIONS_PATH,
                        help="Override Codex sessions path when using the Codex adapter")
    parser.add_argument("--index", type=Path, default=INDEX_PATH)
    args = parser.parse_args()
    try:
        if args.command == "init":
            interactive_init(args.config)
        elif args.command == "set-content":
            if not args.mode:
                raise ValueError("Usage: python3 agent.py set-content transcript")
            set_content_mode(args.config, args.mode)
        else:
            cfg = read_config(args.config)
            loop(cfg, once=args.command != "watch", dry_run=args.command == "dry-run",
                 sessions_root=args.sessions_root, index=args.index)
    except (ValueError, RuntimeError) as e:
        parser.exit(2, str(e) + "\n")


if __name__ == "__main__":
    main()
