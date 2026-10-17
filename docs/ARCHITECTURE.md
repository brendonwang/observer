# Architecture

Observer deliberately separates local observation from private hosted viewing.

```text
Codex / Claude / Pi JSONL   tracked local commands   configured health endpoints
              \                   |                     /
                  local Python watcher + custom feeds
                               |
                        outbound HTTPS
                               |
                   Cloudflare Worker + D1
                               |
                 authenticated web dashboard
```

The existing `protocol: 1` sync envelope and D1 `threads` table are retained as compatibility interfaces. The UI presents entries as project activities. This avoids forcing database migration for existing users.

## Components

- `agent.py`: Python 3.9+ standard-library watcher. It reads specific supported session directories, custom JSON feeds and explicitly registered services.
- `service_adapter.py`: optional HEAD checks with a 3s timeout. It does not follow redirects or download bodies.
- `bin/observer.js`: local CLI for commands, services, and lifecycle operations. `observer run` executes only locally, writes a private activity file and forwards stdout/stderr directly to the terminal.
- `bin/setup.js`: interactive setup, local installed runtime, macOS LaunchAgent, and Cloudflare provisioning.
- `site.html`: minimalist project/dashboard view.
- `worker_source.js`: authenticated ingestion, persistence, and view API; `worker.js` is its generated single-file Worker.

## Data contract

All sources produce activities with the same fields: `id`, `project`, `source`, `title`, `status`, `updated_at`, `started_at`, `events` and optional `type` and `final_response`. The upload envelope remains `{protocol:1, device_id, threads:[...]}`. It sends up to 30 activities per sync. The Worker bounds string lengths and validates IDs/statuses again.

Terminal processes are recorded through explicit wrappers; Observer does not enumerate arbitrary shell commands or inspect terminal screen contents. Agent reading remains read-only.

## Credentials and deployment

`~/.observer/config.json` contains the ingestion token with owner-only file permissions. A CLI-managed Cloudflare deployment additionally writes `~/.observer/hosting.json` with Worker deployment credentials; treat this file as highly sensitive. The hosted site uses a separate viewing password.

A macOS LaunchAgent executes a stable installed copy under `~/.observer/runtime`, not the ephemeral npx package or the original checkout.

## Retention

New automated deployments include a daily Worker Cron Trigger. Its scheduled handler deletes stored activities older than 30 days (or `RETENTION_DAYS` in the range 1–365), associated previews, and expired login-attempt records. Old manual deployments must explicitly add the Cron Trigger. Data stored in Cloudflare remains until the scheduled sweep runs or the database is removed.

## Limitations

- No remote command execution or thread creation.
- No streaming terminal logs.
- Status classification for some agent formats is heuristic.
- One shared ingestion token for now, with per-device revocation planned.
- The cloud dashboard shows a bounded recent-activity window; history pagination is planned.
