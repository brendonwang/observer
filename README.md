# Observer

A private, read-only activity dashboard for Codex Desktop, Claude Code, and custom JSON feeds. The local agent uses only Python's standard library; the hosted dashboard runs on Cloudflare Workers.

Monitor multiple sources in one place, with per-source filtering, current status, activity, optional completed responses, and approved screenshots. Observer never executes local commands or remotely controls a source.

> **Privacy:** Session metadata is uploaded to your Cloudflare account. Completed responses and screenshots are off by default and require explicit opt-in. Do not sync workspaces that prohibit external storage.

## Interface (Taste Skill redesign)

A unified activity list on the left; the selected thread on the right. On a phone, tap a thread to open it. The result and approved preview come first; activity is optional. The header shows connection state. Search, filters, login, and refresh are built in.

The upstream `minimalist-ui` skill is bundled locally under `.agents/skills/minimalist-ui/SKILL.md` for future design work on this project. See `INSTALL-TASTE.md` to install or update the official Taste bundle on your Mac. This is a project-level copy, **not a system-wide ChatGPT skill installation**.

## Files

| File | Purpose |
| --- | --- |
| `worker.js` | **Single standalone file** to paste into Cloudflare Worker editor |
| `schema.sql` | Cloudflare D1 database tables |
| `agent.py` | Multi-source Mac agent (Python 3.9+, standard library only) |
| `site.html` | Editable dashboard UI source |
| `worker_source.js` | Worker server code before HTML bundling |
| `build_worker.py` | Rebuild `worker.js` after editing source/UI |
| `dashboard-preview.html` | Standalone offline demo with *illustrative*, not real, threads |
| `.agents/skills/minimalist-ui/SKILL.md` | Vendored Taste Skill protocol for future project edits |
| `INSTALL-TASTE.md` | Instructions for installing/updating the upstream skill in your local Codex environment |
| `tests/` | Python and Node tests; Node is **only** needed for tests, not deployment |

## Deployment: Cloudflare dashboard, no command-line hosting tools

1. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com/). Create a free Workers & Pages **Worker** called something like `observer` (use the starter / Hello World Worker, then **Edit Code**).
2. Create a **D1 SQL database** called `observer-db`. In the database's **Console**, paste the entire contents of `schema.sql` and execute. Cloudflare officially supports both database creation and SQL Console from its dashboard.
3. Return to your Worker. Under **Bindings**, add a **D1 database** binding. Set **Variable name exactly `DB`** and select `observer-db`.
4. Generate **three different random secrets** in Ghostty on your Mac (nothing is installed):

   ```bash
   python3 - <<'PY'
   import secrets
   for name in ('VIEW_PASSWORD','AGENT_TOKEN','SESSION_KEY'):
       print(f'{name}={secrets.token_urlsafe(40)}')
   PY
   ```

   Save these **privately** (do not paste them into chat, GitHub, screenshots, or your source code). In your Worker's **Settings / Variables and Secrets**, add three **Secret** bindings with those exact names and values. Use the generated `VIEW_PASSWORD` as the dashboard login password. These are three *different* values, not aliases of one token.
5. In the Worker's **Edit Code** screen, replace the starter code with all of `worker.js`, then **Save and Deploy**. If you change the design later, edit `site.html` and/or `worker_source.js`, run `python3 build_worker.py`, and redeploy the regenerated `worker.js`.
6. Visit your generated `https://<your-worker>.<your-subdomain>.workers.dev` URL on any browser. You should see the password login, then an empty dashboard waiting for your Mac.

If your Worker returns "Server is missing its required configuration," verify the four bindings: `DB` (D1 database), `AGENT_TOKEN` (secret), `VIEW_PASSWORD` (secret), `SESSION_KEY` (secret). Binding names are case-sensitive. Cloudflare may require a new deployment after binding changes.

**Hosted service requirements:** a Cloudflare account and a Mac with Python 3.9+ (often already installed through development tools). There is no public deployed URL included in this package; only you can link the dashboard to your Cloudflare account.


## Monitoring sources

During `python3 agent.py init`, enter any combination of `codex,claude,files`. The defaults are `codex,files`.

- **Codex**: Codex Desktop JSONL sessions and titles. Existing deployments remain compatible.
- **Claude Code**: Claude Code session JSONL files in `~/.claude/projects`. It detects user turns, assistant messages, tool names, and explicit completion markers. It never uploads thinking blocks or tool arguments.
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
"sources": [{"type":"codex"},{"type":"claude"},{"type":"files"}]
```

Existing installations using `~/.codex-monitor/config.json` continue to work without modification, using Codex-only mode. Re-running `init` saves a new `~/.observer/config.json` configuration. The host uses the existing `protocol: 1` ingestion endpoint and database schema; no D1 migration is required.

## Run the Mac agent

1. Copy `agent.py` to any folder on your Mac. In Ghostty, `cd` to that folder.
2. Choose your sources: Codex (`~/.codex/sessions`), Claude Code (`~/.claude/projects`), or JSON snapshot files (`~/.observer/feeds`). Missing sources simply produce no activity.
3. Run `python3 agent.py init`. Paste your Worker URL and **AGENT_TOKEN** when prompted. The token input is hidden.
4. The setup asks whether you want to share final assistant responses. The default is **No (metadata only)**. Answer `y` to show final responses on the website. You can also provide a **dedicated, approved** screenshot directory (see below).
5. Start monitoring with `python3 agent.py watch`. Leave it running when you want near-live progress; the dashboard refreshes about every 12 seconds and the Mac reports about every 30 seconds.
6. On your phone, visit the same HTTPS Worker URL and log in with **VIEW_PASSWORD**. Bookmark it or add it to your home screen using your browser's built-in feature (optional).

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

**No sessions**: Check `~/.codex/sessions` and try `python3 agent.py dry-run`. Some Codex versions may use different metadata layouts. The parser deliberately treats unknown state as "Unknown" instead of falsely saying completed.

**Incorrect password**: Confirm the secret is `VIEW_PASSWORD` with the exact randomly generated string, no extra whitespace. Login has a 7-attempt / 15-minute per-IP soft lockout.

**Mac offline**: Keep `agent.py watch` running and the Mac awake. The website reports the last sync, not a guarantee of a currently executing task.

**Preview not appearing**: Verify screenshot name matches the session UUID, file is in the explicitly selected approved directory, image is smaller than 512 KiB, and format is PNG/JPEG/WebP. Some session files may have a different ID naming convention.

**Cloudflare Worker 500**: Check that D1 binding is named `DB` and that `schema.sql` was executed. See the Worker's Cloudflare Logs for server errors; the API intentionally does not reveal internal errors to clients.

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

Stop the agent (Ctrl+C or `launchctl bootout`). Delete `~/.codex-monitor/config.json` if you no longer want the saved ingestion token. In Cloudflare, rotate/delete the `AGENT_TOKEN`, `VIEW_PASSWORD`, and `SESSION_KEY` secrets, then remove the Worker and D1 database if you want to stop hosting and remove its persisted session records. Deleting the screenshot folder or source files on your Mac **does not** automatically remove previously uploaded content from D1.
