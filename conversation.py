"""Bounded, opt-in conversation extraction for Observer.

Only visible messages, tool names, selected arguments, and limited output previews
are exported. Never read thinking/reasoning content, image bytes, or arbitrary files.
This module is deliberately independent of any coding-agent runtime.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

MAX_ITEMS = 48
MAX_TOTAL = 14000
ANSI = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))")
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
ROLES = {"user", "assistant", "tool", "notice"}


def clip(value: object, limit: int = 2400) -> str:
    if not isinstance(value, str):
        return ""
    value = CONTROL.sub("", ANSI.sub("", value)).strip()
    return value[:limit] + ("…" if len(value) > limit else "")


def stamp(entry: dict) -> int:
    ts = entry.get("timestamp")
    if isinstance(ts, (int, float)) and not isinstance(ts, bool):
        return int(ts) if 946684800000 <= ts <= 4102444800000 else 0
    if isinstance(ts, str):
        try:
            return int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError:
            pass
    return 0


def text_parts(content: object, limit: int = 3000) -> str:
    if isinstance(content, str):
        return clip(content, limit)
    if not isinstance(content, list):
        return ""
    # Exclude thinking, images and other non-visible/raw data by construction.
    return clip("\n".join(
        item["text"] for item in content
        if isinstance(item, dict) and item.get("type") in ("text", "input_text", "output_text")
        and isinstance(item.get("text"), str)
    ), limit)


def text_or_content(value: object, limit: int = 3000) -> str:
    if isinstance(value, dict):
        return text_parts(value.get("content"), limit)
    return text_parts(value, limit)


def tool_label(name: str, args: object) -> tuple[str, str]:
    """Use a task/action summary, not uninformative 'using js' tool labels.

    Details are shared only in explicit transcript mode. All strings are capped.
    """
    name = clip(name, 65) or "Tool"
    short = name.split(".")[-1].lower()
    if isinstance(args, str):
        try:
            args = json.loads(args) if len(args) <= 200_000 else {}
        except (ValueError, TypeError):
            args = {"command": args}
    if not isinstance(args, dict):
        args = {}
    command = args.get("cmd") or args.get("command") or args.get("script")
    if isinstance(command, list):
        command = " ".join(str(x) for x in command[:12])
    path = next((args[k] for k in ("file_path", "path", "file", "target", "filename")
                 if isinstance(args.get(k), str)), "")
    pattern = next((args[k] for k in ("pattern", "query", "regex", "search_query")
                    if isinstance(args.get(k), str)), "")
    patch = args.get("patch") or args.get("patches") or args.get("diff")
    if isinstance(patch, str):
        files = re.findall(r"(?:\*\*\* (?:Update|Add|Delete) File:|(?:\+\+\+|---) b/)\s*([^\r\n]+)", patch)
        if files:
            path = ", ".join(files[:3])
    if short in ("exec_command", "shell_command", "bash", "terminal", "run", "exec") or "shell" in short:
        detail = clip(command, 1100)
        return ("Ran " + clip(command, 110) if detail else "Ran a command", detail)
    if short in ("apply_patch", "edit", "edit_file", "write", "write_file", "str_replace_editor"):
        return ("Edited " + clip(path, 115) if path else "Edited files",
                clip(patch or (json.dumps(args, ensure_ascii=False) if args else ""), 950))
    if short in ("read", "read_file", "cat", "view"):
        return ("Read " + clip(path, 115) if path else "Read a file", clip(path, 250))
    if short in ("grep", "rg", "glob", "search", "search_files", "find"):
        return ("Searched " + clip(pattern or path, 110) if pattern or path else "Searched files",
                clip(pattern or path, 300))
    if short in ("sleep", "wait", "delay", "noop"):
        return ("", "")
    if short in ("functions.exec", "exec_js", "javascript", "js") or name.endswith("functions.exec"):
        code = args.get("code") or args.get("source") or ""
        if isinstance(code, str):
            calls = re.findall(r"tools\.(?:mcp__)?([A-Za-z0-9_]+)", code)
            if calls:
                return ("Used " + clip(", ".join(dict.fromkeys(calls))[:110], 110),
                        clip(code, 900))
            return ("Ran JavaScript", clip(code, 900))
    if name.startswith("mcp__"):
        parts = name.split("__")
        if len(parts) >= 3:
            return (clip(parts[1] + " · " + parts[2].replace("_", " "), 120),
                    clip(path or pattern, 400))
    return ("Used " + name, clip(command or path or pattern, 450))


class Transcript:
    def __init__(self) -> None:
        self.items: list[dict] = []
        self.tool_ids: dict[str, dict] = {}

    def message(self, role: str, text: str, at: int = 0) -> None:
        text = clip(text, 3500 if role == "assistant" else 2500)
        if role not in ("user", "assistant") or not text:
            return
        # Codex and Claude sometimes log the same visible message twice.
        if any(item.get("role") == role and item.get("text") == text
               for item in self.items[-3:]):
            return
        self.items.append({"role": role, "text": text, "at": at})

    def tool(self, name: str, args: object = None, at: int = 0, call_id: str = "") -> None:
        label, detail = tool_label(name, args)
        if not label:
            return
        entry = {"role": "tool", "title": clip(label, 140), "detail": clip(detail, 1100),
                 "output": "", "error": False, "at": at}
        self.items.append(entry)
        if call_id:
            self.tool_ids[call_id] = entry

    def output(self, value: object, at: int = 0, call_id: str = "", error: bool = False) -> None:
        text = text_or_content(value, 1700)
        if not text:
            return
        item = self.tool_ids.get(call_id) if call_id else None
        if item is not None:
            item["output"] = clip(item.get("output", "") + ("\n" if item.get("output") else "") + text, 1700)
            item["error"] = bool(error or item["error"])
        else:
            self.items.append({"role": "tool", "title": "Tool output", "detail": "",
                               "output": text, "error": bool(error), "at": at})

    def notice(self, text: str, at: int = 0) -> None:
        if text:
            self.items.append({"role": "notice", "text": clip(text, 160), "at": at})

    def finish(self) -> tuple[list[dict], bool, str]:
        # Respect both a row limit and a total text budget across all fields.
        # Prefer latest turns, keeping the most recent user prompt when possible.
        kept = []
        used = 0
        for item in reversed(self.items):
            cost = sum(len(str(v)) for k, v in item.items() if k != "at") + 40
            if len(kept) >= MAX_ITEMS or (used + cost > MAX_TOTAL and kept):
                break
            kept.append(item)
            used += cost
        kept.reverse()
        omitted = len(kept) != len(self.items)
        if kept and not any(x["role"] == "user" for x in kept):
            prior = next((x for x in reversed(self.items[:-len(kept)]) if x["role"] == "user"), None) if omitted else None
            if prior:
                kept.insert(0, {**prior, "text": clip(prior.get("text"), 900)})
                omitted = True
        last_assistant = next((item.get("text") for item in reversed(kept) if item["role"] == "assistant"), "")
        last_user = next((item.get("text") for item in reversed(kept) if item["role"] == "user"), "")
        summary = clip((last_assistant or last_user or "").replace("\n", " "), 160)
        return kept, omitted, summary


def codex(records: list[dict]) -> tuple[list[dict], bool, str]:
    transcript = Transcript()
    for row in records:
        payload = row.get("payload")
        if not isinstance(payload, dict):
            continue
        role = row.get("type")
        typ = payload.get("type")
        at = stamp(row)
        if role == "event_msg":
            if typ == "user_message":
                transcript.message("user", payload.get("message"), at)
            elif typ == "agent_message":
                transcript.message("assistant", payload.get("message"), at)
            elif typ in ("exec_approval_request", "approval_request"):
                transcript.notice("Approval requested", at)
        elif role == "response_item":
            if typ == "message":
                who = payload.get("role")
                if who in ("user", "assistant"):
                    transcript.message(who, text_parts(payload.get("content")), at)
            elif typ in ("function_call", "custom_tool_call"):
                transcript.tool(payload.get("name") or "Tool",
                                payload.get("arguments") or payload.get("input"),
                                at, str(payload.get("call_id") or ""))
            elif typ in ("function_call_output", "custom_tool_call_output"):
                transcript.output(payload.get("output"), at,
                                  str(payload.get("call_id") or ""))
    return transcript.finish()


def claude(records: list[dict]) -> tuple[list[dict], bool, str]:
    transcript = Transcript()
    for row in records:
        role = row.get("type")
        message = row.get("message")
        if not isinstance(message, dict):
            continue
        at = stamp(row)
        content = message.get("content")
        if role == "user":
            transcript.message("user", text_parts(content), at)
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        transcript.output(block.get("content"), at,
                                          str(block.get("tool_use_id") or ""),
                                          bool(block.get("is_error")))
        elif role == "assistant":
            if isinstance(content, list):
                # Each visible text block can precede a tool invocation.
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "text":
                        transcript.message("assistant", block.get("text"), at)
                    elif block.get("type") == "tool_use":
                        transcript.tool(block.get("name") or "Tool", block.get("input"),
                                        at, str(block.get("id") or ""))
    return transcript.finish()


def pi_active_records(records: list[dict]) -> list[dict]:
    """Follow Pi's parentId chain; do not conflate abandoned in-file branches."""
    by_id = {}
    leaf = None
    for row in records:
        if not isinstance(row, dict):
            continue
        key = row.get("id")
        if row.get("type") != "session" and isinstance(key, str) and key:
            by_id[key] = row
            leaf = key
    if leaf is None:
        return [r for r in records if isinstance(r, dict)]
    chain = []
    seen = set()
    while leaf is not None and leaf in by_id and leaf not in seen:
        seen.add(leaf)
        row = by_id[leaf]
        chain.append(row)
        parent = row.get("parentId")
        leaf = parent if isinstance(parent, str) and parent else None
    chain.reverse()
    # Header is not part of the tree.
    return [r for r in records if isinstance(r, dict) and r.get("type") == "session"][:1] + chain


def pi(records: list[dict]) -> tuple[list[dict], bool, str]:
    transcript = Transcript()
    for row in pi_active_records(records):
        at = stamp(row)
        if row.get("type") == "compaction":
            transcript.notice("Context compacted", at)
        if row.get("type") != "message":
            continue
        message = row.get("message")
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        content = message.get("content")
        if role == "user":
            transcript.message("user", text_parts(content), at)
        elif role == "assistant":
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "text":
                        transcript.message("assistant", block.get("text"), at)
                    elif block.get("type") == "toolCall":
                        transcript.tool(block.get("name") or "Tool", block.get("arguments"),
                                        at, str(block.get("id") or ""))
        elif role == "toolResult":
            transcript.output(content, at, str(message.get("toolCallId") or ""),
                              bool(message.get("isError")))
        elif role == "bashExecution":
            transcript.tool("bash", {"command": message.get("command")}, at)
            transcript.output(message.get("output"), at, error=bool(message.get("exitCode")))
    return transcript.finish()


def custom(items: object) -> tuple[list[dict], bool, str]:
    transcript = Transcript()
    if not isinstance(items, list):
        return transcript.finish()
    for item in items[-80:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        at = item.get("at")
        at = int(at) if isinstance(at, (int, float)) and not isinstance(at, bool) and 0 < at < 4102444800000 else 0
        if role in ("user", "assistant"):
            transcript.message(role, item.get("text"), at)
        elif role == "tool":
            transcript.tool(item.get("title") or "Tool", {"command": item.get("detail")}, at)
            transcript.output(item.get("output"), at, error=bool(item.get("error")))
        elif role == "notice":
            transcript.notice(item.get("text"), at)
    return transcript.finish()
