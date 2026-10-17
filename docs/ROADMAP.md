# Observer roadmap

## 0.2 beta — public foundation (this branch)

- [x] Keep original minimalist-ui palette, typography and mobile-first layout
- [x] Project-centered workspace and activity feed
- [x] Preserve Codex, Claude Code, Pi and custom JSON monitoring
- [x] Opt-in tracked terminal commands and health endpoints
- [x] CLI setup, Cloudflare provisioning foundation, local lifecycle management
- [x] CI, packaging verification, security and contribution guidelines
- [x] Daily retention handler for newly provisioned Workers
- [ ] Fresh-machine macOS installation and upgrade tests
- [ ] Cloudflare provisioning test with a separate staging account
- [ ] Security review of filesystem permissions, secrets and HTTP endpoint checks
- [ ] Browser E2E against a real staging Worker
- [ ] Check third-party vendored skill license before the public npm release
- [ ] Publish scoped npm package after verifying scope ownership

## 0.3 — deeper activities

- [ ] Subagent hierarchy and reliable parent/child status
- [ ] GitHub Actions and deployment activity adapters
- [ ] Artifact/deployment links and controlled previews
- [ ] Paginated history, selective deletion and per-device credential revocation
- [ ] Optional completion/failure/approval alerts

## 1.0 — stable contracts

- [ ] Stable adapter API and protocol versioning
- [ ] Documented migrations and rollback procedure
- [ ] Tested lifecycle on Intel/Apple Silicon Macs
- [ ] Full security and privacy review
- [ ] macOS/Homebrew alternative distribution

Non-goals for this release: remote shell, automatic terminal snooping, screen recording, or multitenant SaaS.
