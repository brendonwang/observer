# Observer

A private, read-only activity dashboard for Codex Desktop, Claude Code, Pi coding agent, and custom JSON feeds. The local agent uses only Python's standard library; the hosted dashboard runs on Cloudflare Workers.

Monitor multiple sources in one place, with per-source filtering, current status, activity, opt-in conversation replay, optional completed responses, and approved screenshots. Observer never executes local commands or remotely controls a source.

> **Privacy:** Only session metadata is uploaded by default. Full conversation sync is strictly opt-in because prompts, assistant messages, commands, and tool output previews may include sensitive data. Screenshots also require separate opt-in. Do not sync workspaces that prohibit external storage.

## Interface (Taste Skill redesign)

A unified activity list on the left; the selected thread on the right. On a phone, tap a thread to open it. In transcript mode, you see actual conversation turns and collapsible command/output groups instead of generic tool-name updates. The final result and approved preview remain available; activity is optional. The header shows connection state. Search, filters, login, and refresh are built in.

The upstream `minimalist-ui` skill is bundled locally under `.agents/skills/minimalist-ui/SKILL.md` for future design work on this project. See `INSTALL-TASTE.md` to install or update the official Taste bundle on your Mac. This is a project-level copy, **not a system-wide ChatGPT skill installation**.

## Files

| File | Purpose |
| --- | --- |
| `worker.js` | **Single standalone file** to paste into Cloudflare Worker editor |
| `schema.sql` | Cloudflare D1 database tables |
| `agent.py` | Multi-source Mac agent (Python 3.9+, standard library only) |
| `conversation.py` | Bounded, privacy-conscious transcript parsers for Codex, Claude Code, and Pi |
| `site.html` | Editable dashboard UI source |
| `worker_source.js` | Worker server code before HTML bundling |
| `build_worker.py` | Rebuild `worker.js` after editing source/UI |
| `dashboard-preview.html` | Standalone offline demo with *illustrative*, not real, threads |
| `.agents/skills/minimalist-ui/SKILL.md` | Vendored Taste Skill protocol for future project edits |
| `INSTALL-TASTE.md` | Instructions for installing/updating the upstream skill in your local Codex environment |
| `tests/` | Python and Node tests; Node is **only** needed for tests, not deployment |

## Deployment: Cloudflare dashboard, no command-line hosting tools

Complete these steps in order. **Creating a D1 database alone does not create Observer's tables.** Initialization and verification are required before syncing.

1. **Create the Worker.** In the [Cloudflare Dashboard](https://dash.cloudflare.com/), go to **Workers & Pages** and create a Worker named, for example, `observer`. You can start with the default Hello World code.
2. **Create the database.** Under **Storage & databases → D1**, create a database named `observer-db`.
3. **Initialize the database (required).** Open **D1 → observer-db → Console**. Copy the **entire contents** of [`schema.sql`](schema.sql) into the SQL console and execute it. This creates the `devices`, `threads`, `previews`, and `login_attempts` tables. Running the script again is safe (`CREATE TABLE IF NOT EXISTS`).
4. **Verify initialization (required).** In the **same database's SQL console**, run:

   ```sql
   SELECT name
   FROM sqlite_master
   WHERE type = 'table'
     AND name IN ('devices', 'threads', 'previews', 'login_attempts')
   ORDER BY name;
   ```

   You must see **four rows**: `devices`, `login_attempts`, `previews`, and `threads`. If one is missing, rerun `schema.sql` and check again. Do not continue until all four exist.
5. **Bind the database.** Return to the Worker → **Settings → Bindings**. Add a **D1 database** binding whose **variable name is exactly `DB`**, pointing to the **same database you just initialized** (`observer-db`). A similarly named but different database will not work.
6. **Create three different secrets.** On your Mac, generate them locally:

   ```bash
   python3 - <<'PY'
   import secrets
   for name in ('VIEW_PASSWORD', 'AGENT_TOKEN', 'SESSION_KEY'):
       print(f'{name}={secrets.token_urlsafe(40)}')
   PY
   ```

   In the Worker's **Settings → Variables and Secrets**, add the generated values as **Secret** bindings named exactly `VIEW_PASSWORD`, `AGENT_TOKEN`, and `SESSION_KEY`. Never commit or paste their values into chat. Use `VIEW_PASSWORD` to log into the website and `AGENT_TOKEN` to authenticate the local agent; these are not interchangeable.
7. **Deploy the Worker.** In **Edit Code**, replace the starter code with the entire contents of `worker.js`, then **Save and Deploy**. When modifying `worker_source.js` or `site.html` later, run `python3 build_worker.py` and deploy the regenerated `worker.js`.
8. **Check the website.** Visit `https://<your-worker>.<your-subdomain>.workers.dev`. The password screen should appear. Sign in with `VIEW_PASSWORD`. An empty dashboard is normal until you connect the Mac agent.

**Next:** Complete **Run the Mac agent** below, especially `python3 agent.py once` before starting continuous monitoring. You do not need Wrangler or extra hosting software.

If the Worker reports **"Server is missing its required configuration"**, check `DB`, `AGENT_TOKEN`, `VIEW_PASSWORD`, and `SESSION_KEY` for correct names and values, and redeploy after changing bindings. See **Troubleshooting** for database errors.

**Hosted service requirements:** A Cloudflare account and a Mac with Python 3.9+. The repository cannot deploy the Worker or provision your Cloudflare resources for you.

## Monitoring sources

During `python3 agent.py init`, enter any combination of `codex,claude,pi,files`. The defaults are `codex,files`.

- **Codex**: Codex Desktop JSONL sessions and titles. Existing deployments remain compatible.
- **Claude Code**: Claude Code session JSONL files in `~/.claude/projects`. It detects user turns, assistant messages, tool names, and explicit completion markers. It never uploads thinking blocks or tool arguments.
- **Pi coding agent**: Reads session JSONL under `~/.pi/agent/sessions`. Pi forks with an explicit `parentSession` appear beneath their parent. Branches within the same Pi session file are not separate tasks.
- **Subagents**: Codex and Claude Code child sessions are grouped under their parents when explicit lineage is available, rather than cluttering the main thread list. Missing parents leave their children accessible as standalone sessions. Codex's internal **Guardian review** approval sessions are automatically hidden instead of being shown as tasks. Older Guardian records are filtered from the dashboard even if already stored in D1.
- **Custom**: Any job, script, CI process, or AI tool can write a small JSON snapshot to `~/.observer/feeds`. Observer only reads those files.

For custom sources, create `~/.observer/feeds/build.json`:

```json
{
  "id": "build-001",
  "source": "CI",
  "title": "Deploy staging",
  "project": "website",
  "status": "working",
  "events": [
    {"kind": "start", "label": "Build started", "at": 1792195200000}
  ]
}
```

The optional fields are `updated_at`, `started_at` (Unix milliseconds), `final_response`, and more `events`. Status must be `working`, `completed`, `quiet`, `interrupted`, or `unknown`. Events may use `start`, `complete`, `warning`, `tool`, `message`, `thought`, or `info`. Set `status: "completed"` and provide `final_response` to display a result **only if** final responses were enabled in the local agent.

Custom files are data, not executable instructions. Observer limits each file to 128 KiB, rejects symlinks, and reads only the explicitly configured directory. It does not recursively inspect arbitrary project files.

To add sources to an existing configuration, edit `~/.observer/config.json` and set:

```json
"sources": [{"type":"codex"},{"type":"claude"},{"type":"pi"},{"type":"files"}]
```

Existing installations using `~/.codex-monitor/config.json` continue to work without modification, using Codex-only mode. Re-running `init` saves a new `~/.observer/config.json` configuration. The host uses the existing `protocol: 1` ingestion endpoint and database schema; no D1 migration is required.

## Conversation view (opt-in)

Observer can now mirror the **recent, human-visible conversation** from Codex, Claude Code, and Pi, including:

- Your prompt and subsequent follow-ups
- Assistant messages in chronological order, with links and code blocks
- File operations, commands, and other meaningful tool calls grouped into expandable sections
- Short previews of tool outputs and errors, rather than labels like "Using JS" or "Sleep"
- Subagents accessible underneath their parent sessions

This is a **read-only, bounded replay**, not remote access to your local application. Raw chain-of-thought, thinking blocks, image bytes, and arbitrary project files are not exported. Pi's active in-file branch is used instead of mixing in abandoned branches. Conversation extraction is intentionally limited to the most recent **48 blocks** and about **14,000 characters** per thread; old records may also fall outside the local JSONL read window. The UI explicitly marks truncated conversations.

**Existing installation:** After updating both `agent.py` and `conversation.py`, enable sharing without re-entering credentials:

```bash
python3 agent.py set-content transcript
# Type SYNC after reviewing the privacy warning.
python3 agent.py once
python3 agent.py watch
```

The three supported levels are:

| Command | Data uploaded |
| --- | --- |
| `python3 agent.py set-content metadata` | Titles, project names, statuses and coarse activity; default |
| `python3 agent.py set-content final` | Metadata plus completed assistant responses |
| `python3 agent.py set-content transcript` | Recent prompts, assistant messages, tool commands and limited tool output previews |

**Security and retention:** Conversation mode can transmit passwords, tokens, file contents or personal information if they appear in your prompts or tool output. The viewer requires your Worker login, but the Cloudflare account can access the stored data. Turning conversation mode off stops future uploads; previously stored transcripts may persist in D1 until affected rows or the database are deleted. Only enable this mode when permitted by your workspace's data policies. `dry-run` can be used to inspect exactly what would be sent before enabling sync.

**Deploy:** Copy the newly built `worker.js` to your Cloudflare Worker and deploy it. The schema and ingestion endpoint remain backward compatible; no D1 migration is required. Merely pulling the repository does not update the deployed website.

## Run the Mac agent

1. Clone or update this repository on your Mac, and open it in your terminal. Keep `agent.py` and `conversation.py` in the same directory. Use the same version as the deployed `worker.js`.
2. Choose your sources: Codex (`~/.codex/sessions`), Claude Code (`~/.claude/projects`), Pi (`~/.pi/agent/sessions`), or JSON snapshot files (`~/.observer/feeds`). Missing sources simply produce no activity.
3. Run `python3 agent.py init`. Enter your deployed Worker URL and the **`AGENT_TOKEN` secret** when prompted (not `VIEW_PASSWORD`).
4. Choose a sharing level: **metadata** (default), **final responses**, or **full conversation**. Full conversation requires typing `SYNC` as explicit consent. You may also select an approved screenshots folder.
5. **Verify syncing first:** Run `python3 agent.py once`. A successful test prints `Synced N threads`, including when `N` is zero. An HTTP error means setup is incomplete; see **Troubleshooting**. Do not proceed to continuous monitoring until this succeeds.
6. Start monitoring with `python3 agent.py watch`. The agent checks for changes about every 30 seconds; the dashboard refreshes about every 12 seconds.
7. On your phone, visit the same HTTPS Worker URL and sign in with **`VIEW_PASSWORD`**.


The local agent config lives at `~/.observer/config.json` with owner-only (`0600`) permissions. Keep your token private. Your Mac can sleep; the website will then show the last synced snapshot and indicate that the Mac is offline. It cannot see new changes until the Mac reconnects.

### Make the monitoring agent start at macOS login (optional)

If you prefer not to keep a Ghostty tab open, use the included `install-launch-agent.sh` script on your Mac. It uses Apple's built-in `launchctl`—**not an extra app**.

```bash
chmod +x install-launch-agent.sh
./install-launch-agent.sh
```

The script requires that you have already run `python3 agent.py init`. It writes a LaunchAgent to `~/Library/LaunchAgents/dev.observer.agent.plist`, starts it through `launchctl`, and writes logs under `~/.observer`. To stop it, run `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/dev.observer.agent.plist`. The Mac needs to be logged in and awake to publish live updates.

### See the final product

**Completed response**: Answer `y` at `agent.py init` when asked to send final responses. The dashboard shows up to 6,000 characters of the latest *completed* assistant message (if found in the locally stored session records). HTTPS URLs in those messages become clickable. For a deployed website, ask Codex to include the deployed preview URL in its final response.

**Private screenshot**: Create an approved directory such as `~/CodexPreviews` and supply its path during `agent.py init`. Save a screenshot as either:

- `~/CodexPreviews/<SESSION_ID>.png` (or `.jpg`/`.webp`)
- `~/CodexPreviews/<SESSION_ID>/preview.png` (or `.jpg`/`.webp`)

The session ID is the UUID from the Codex rollout file name, and is also visible/copyable in the website's session inspector. The image must be **512 KiB or smaller**. You can resize/compress an existing image using macOS's built-in Preview or `sips`; there is no image generation inside this read-only watcher. The agent verifies file signatures, ignores symlinks, and only reads this folder. **The screenshot is uploaded to Cloudflare and available privately to logged-in viewers**. Do not place sensitive content there unless approved to transmit it.

**Interactive product**: The watcher does not proxy your Mac's localhost app, because doing so would create a much larger security surface. Have Codex deploy the application separately to a permitted HTTPS preview environment and include its URL in its final response. That URL will be clickable in the monitor.

### Test without publishing sensitive data

```bash
python3 agent.py dry-run
```

This prints exactly what *would* be sent but **does not make any network request**. Be cautious: if you opted into final responses, those could appear in your terminal output.

## Security properties

- Mac agent makes **outbound-only HTTPS POSTs**. No incoming ports, no SSH, no remote commands, no filesystem mutation inside Codex's directories.
- Dashboard reads require the random `VIEW_PASSWORD`; 12-hour HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Strict` cookie; login attempts throttled by hashed IP.
- Mac ingestion requires a **separate bearer token** (`AGENT_TOKEN`) not available to browser clients. Browser session credentials can't control ingestion.
- Read-only dashboard: no task execution, arbitrary shell, file browsing, upload from mobile, or remote Codex prompts.
- Strict response content types, same-origin policy, limited request sizes, restrictive CSP, escaped client rendering; only PNG/JPEG/WebP screenshots from a specific allowlisted directory.
- By default, **no prompts, source code, tool arguments, raw reasoning, or final responses are uploaded**. Thread titles, project folder names, statuses, and tool *names* are uploaded. Turning on final responses may expose sensitive content contained in those responses.
- Cloudflare D1 stores the synced records until you delete them; this version has **no automatic retention cleanup**. Delete the D1 database to remove the stored records.
- Cloudflare can process the transmitted data according to its terms. This is **not end-to-end encrypted** against your hosting provider.
- Workspace access policies still apply. Do not use the monitor if sending workspace data to an independent cloud service is prohibited.

## Troubleshooting

**Too many "Guardian review" sessions**: Those are Codex's internal approval reviewers, not individual coding tasks. Update both `agent.py` and the deployed `worker.js`; Observer will stop collecting these sessions and hide existing Guardian records without a database migration. Regular review subagents stay visible under their parents.

**No sessions**: Check `~/.codex/sessions` and try `python3 agent.py dry-run`. Some Codex versions may use different metadata layouts. The parser deliberately treats unknown state as "Unknown" instead of falsely saying completed.

**Incorrect password**: Confirm the secret is `VIEW_PASSWORD` with the exact randomly generated string, no extra whitespace. Login has a 7-attempt / 15-minute per-IP soft lockout.

**Mac offline**: Keep `agent.py watch` running and the Mac awake. The website reports the last sync, not a guarantee of a currently executing task.

**Preview not appearing**: Verify screenshot name matches the session UUID, file is in the explicitly selected approved directory, image is smaller than 512 KiB, and format is PNG/JPEG/WebP. Some session files may have a different ID naming convention.

**HTTP 503 — database setup incomplete**: The Worker detected a missing D1 table. Open **D1 → your database → Console**, run the four-table verification query in step 4 above, execute `schema.sql` if needed, and confirm the Worker's `DB` binding points to **that exact database**. If the response says required configuration is missing, verify the binding and the three secrets instead.

**HTTP 500 — internal Worker error**: Open **Workers & Pages → your Worker → Logs → Live**, run `python3 agent.py once` again, and check the logged error name and message. The HTTP response deliberately omits internal database details. Do not share credentials or raw session data from logs.

**New Codex Desktop build breaks parsing**: Run `python3 agent.py dry-run`, inspect whether session file locations / event types changed, and update `parse_session()` deliberately. We haven't verified this against your own Mac's Codex log samples.

## Tests (development only)

Run Python tests (Python 3.9+):

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Run Worker tests (Node 20+):

```bash
node --test tests/test_worker.mjs
```

Optional browser check (requires Playwright and Chromium):

```bash
python3 tests/test_browser.py
```

Node and Playwright are only used for testing. The tests do not prove production Cloudflare connectivity.

## Remove / revoke

Stop the agent (Ctrl+C or `launchctl bootout`). Delete `~/.observer/config.json` (or the legacy `~/.codex-monitor/config.json`) if you no longer want the saved ingestion token. In Cloudflare, rotate/delete the `AGENT_TOKEN`, `VIEW_PASSWORD`, and `SESSION_KEY` secrets, then remove the Worker and D1 database if you want to stop hosting and remove its persisted session records. Deleting the screenshot folder or source files on your Mac **does not** automatically remove previously uploaded content from D1.
