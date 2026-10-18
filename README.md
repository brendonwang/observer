# Observer

**See what your projects are doing, wherever you are.**

Observer is a private, self-hosted dashboard for AI coding sessions and developer activity. It groups local agents, commands, and health checks by project, with a read-only mobile-first interface. Expanding a Codex, Claude Code, or Pi activity preserves the existing opt-in conversation replay with messages and collapsible tool steps.

**Status: public beta in development.** The CLI is implemented in this repository; the npm package has **not been published or production-validated**. Use a feature branch or staging Cloudflare environment until the release checklist is complete.

## What it monitors

- Codex, Claude Code, and Pi coding sessions, including supported subagent information
- Locally launched commands, builds, tests, and scripts through `observer run`
- Explicitly registered HTTPS or localhost service-health endpoints
- Custom JSON activity feeds under `~/.observer/feeds`

Nothing can execute a command from the hosted website. The CLI launches commands only when explicitly invoked on the local machine.

## Try it from source

Requirements: Node.js 20+, Python 3.9+, macOS for automatic login startup, and an optional Cloudflare account for hosting.

```sh
git clone https://github.com/brendonwang/observer.git
cd observer
npm test
npm run test:agent
node bin/observer.js setup
```

The setup wizard can create a Worker and D1 database in **your own Cloudflare account**, or connect to an existing Observer Worker. It keeps the installed Python agent in `~/.observer/runtime` rather than relying on a cloned repository path.

**Already running Observer?** Choose the existing-Worker option during setup and use the same `AGENT_TOKEN`. Keep a backup of `~/.observer/config.json` before migrating. The original manual steps remain in [docs/SELF_HOST.md](docs/SELF_HOST.md).

After an npm release, the intended entry point is `npx @brendonwang/observer setup`. This command is **not available from npm yet**.

## Local activity

```sh
node bin/observer.js run -- npm test
node bin/observer.js run --project web --label "Build frontend" -- npm run build
node bin/observer.js service add web http://localhost:3000/health
node bin/observer.js service list
node bin/observer.js doctor
```

The `run` command runs the process **on your Mac**, inherits standard output, preserves the exit code, and records a small JSON activity snapshot. It does **not** sync terminal stdout/stderr. By default, it displays the command name and most arguments as the activity title; use `--label` to avoid revealing sensitive arguments. Never put secrets in command-line arguments.

Service checks use 3-second HEAD requests. Redirects and response bodies are not followed, and endpoints must be explicitly registered. To sync commands, enable the `files` source. To sync health checks, enable `services`.

## Privacy and hosting

The Mac agent makes outbound HTTPS requests only. Metadata-only is the default. Titles, project names, timestamps, statuses, and event labels are still metadata and can be sensitive. The setup wizard also offers **completed-response mode** or **conversation replay mode**. Conversation replay is a separate, explicit opt-in requiring the user to type `SYNC`; it can include prompts, assistant replies, command arguments, and truncated tool output previews containing private file contents or credentials. Screenshots are independently opt-in. Use metadata-only for sensitive projects.

The website uses a separate viewer password and an agent-ingestion token. Both the Worker and the D1 database belong to the user's Cloudflare account. Stored data is **not end-to-end encrypted** against Cloudflare.

The new CLI configures a daily retention job on new Cloudflare deployments (30 days by default, configurable using `RETENTION_DAYS`). Existing manual Worker deployments need the corresponding Cron Trigger enabled; deletion is otherwise not automatic.

The current beta uses one agent-ingestion secret across configured devices; per-device credentials and self-service deletion are planned before a stable release.

## Development

```sh
npm run build
npm run test:build
npm test
npm run test:agent
npm pack --dry-run
```

`site.html` is the editable dashboard; `worker_source.js` is the backend; `python3 build_worker.py` generates deployable `worker.js`. `dashboard-preview.html` is an illustrative, offline UI demo.

See [Architecture](docs/ARCHITECTURE.md), [Interface rules](docs/DESIGN.md), [Roadmap](docs/ROADMAP.md), [Contributing](CONTRIBUTING.md), and [Security](SECURITY.md).

MIT licensed, except for any separately licensed third-party material.
