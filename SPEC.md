# Observer — Product & Technical Specification

> **Status:** Draft proposal (v0.1)  
> **Updated:** 2026-11-17  
> **Scope:** Next-generation Observer, built incrementally on the existing self-hosted monitoring product  
> **Owner:** Project maintainers  
> **Implementation status:** This document describes proposed capabilities, not functionality already shipped.

## 0. Executive decision

**Observer is the independent supervision layer for AI-delegated work.**

Its fundamental unit is a **Work Contract**: a durable objective with a human owner, constraints, acceptance criteria, linked agent runs, supporting evidence, and an explicit outcome.

The product is not primarily a place to watch individual agent sessions. It is a place to understand **what work was delegated, what has actually happened, what remains unproven, and what needs human attention**.

### Product promise

> AI agents do the work. Observer makes sure the work gets done.

### Starting wedge

A developer uses multiple coding agents over multiple sessions, sometimes across machines or providers. Observer preserves the underlying objective, connects those sessions, assembles an evidence-based review, and prepares a continuation handoff without asking the developer to reconstruct context.

### Architectural principle

**Observer owns durable work state; agents own execution.** The product must remain useful with one agent, several providers, interrupted sessions, and agents that cannot be directly controlled.

### What this spec is and is not

- This is an implementable product direction with a deliberately narrow first milestone.
- Existing monitoring, read-only viewing, and self-hosted deployment remain supported.
- Later orchestration, approvals, policy enforcement, and enterprise capabilities are **future proposals**, not MVP assumptions.
- This is not authorization to run commands remotely, collect additional private content, or silently change retention settings.

---

## 1. Current repository baseline

As of this draft, Observer is a self-hosted, read-only, mobile-first monitoring tool. The existing codebase includes:

| Existing component | Current responsibility | Proposed evolution |
| --- | --- | --- |
| agent.py | Python watcher for Codex, Claude Code, Pi, custom feeds, and health/activity sources | Emit optional work associations and bounded work events |
| conversation.py | Opt-in structured conversation replay | Provide redacted source references for handoffs, not default full-context uploads |
| bin/observer.js | Local CLI, setup, explicit command execution through observer run | Add local work create/link/status/handoff commands |
| worker_source.js | Cloudflare Worker ingestion and authenticated read API | Add isolated, versioned work read model and optional work sync |
| schema.sql | Cloudflare D1 persistence | Add new tables through non-destructive migrations |
| site.html | Project-centric read-only dashboard | Add work-centric navigation and objective detail alongside the activity view |
| docs/ARCHITECTURE.md | Current runtime and privacy design | Remains the baseline for shipped behavior |
| docs/DESIGN.md | Restrained visual system | Applies to new interfaces |
| docs/ROADMAP.md | Existing beta release plan | Continues separately; this spec must not imply existing 0.2 release is finished |

**Compatibility invariant:** Preserve protocol 1 envelope compatibility, existing threads and preview storage, installed watcher behavior, and the current read-only hosted dashboard. A new work layer must be additive and opt-in.

Existing beta security constraints remain authoritative until separately reviewed: the hosted Worker cannot execute local commands; transcript synchronization is opt-in; the viewer password is separate from the ingestion token.

## 2. Problems to solve

### P1 — Sessions are not work

An objective can span many providers, context resets, machines, and attempts. Session-centric products make users manually reconstruct the objective and its state.

### P2 — Completion is not acceptance

An agent's "done" message does not show that acceptance criteria passed. Test output, CI state, Git diffs, external artifacts, and human review may tell a different story.

### P3 — Attention does not scale

More agents generate more status updates. A developer supervising ten agents should not need ten times the attention just to discover which decisions matter.

### P4 — Handoffs are lossy

When a session ends or an agent is replaced, the human often re-explains previous decisions, constraints, failed approaches, and remaining requirements.

### P5 — Current agent controls are fragmented

Providers differ in what they expose and allow. Users need a truthful, unified view that **distinguishes observation, suggestion, and enforceable control**.

## 3. Users, jobs, and scenarios

### Initial persona: multi-agent developer

A solo developer or small engineering team member who regularly runs two or more coding-agent sessions across existing tools.

**Job to be done:** "When I delegate a feature, keep track of its objective and evidence, so I can leave and come back knowing what's completed, what failed, and what I must decide."

Initial tasks:
- Track one feature across a Claude Code session, a Codex session, and a CI run.
- Recover from an interrupted or context-exhausted session.
- Review whether a set of changes satisfies explicit success criteria.
- See blocked work without reading every transcript.
- Continue the objective in a different agent using a well-scoped handoff.

### Secondary persona: technical lead

Needs a trustworthy overview of the work assigned to several developers and agents, without becoming an administrator of every individual session.

**Deferred:** multitenant organizations, non-code business workflows, enterprise policy teams, external customers using the API as a governance backbone.

## 4. Product invariants

1. **Work first:** Contracts are first-class. Runs and conversations are linked implementation details.
2. **Provider independent:** A contract outlives any particular agent or vendor.
3. **Evidence over self-report:** "Agent says completed" must never be displayed as independently verified.
4. **Human authorization:** The user controls objectives, security-sensitive decisions, acceptance, and consequential side effects.
5. **Minimal disclosure:** Metadata-only remains default. Full transcripts, code contents, test stdout, screenshots, and artifact content require separate consent.
6. **Local-first control:** No remote command execution, remote thread creation, or automatic shell access in the initial release.
7. **Progressive enhancement:** Existing activities work without a Work Contract; a contract can have zero, one, or many runs.
8. **Honest capability labels:** A connector that can read status but cannot pause a process must not show a functioning "Pause" control.
9. **Durable and idempotent:** Repeated, delayed, or out-of-order sync events must not duplicate work or overwrite newer user decisions.
10. **Portable:** Contracts and handoff summaries should have a plain-text/JSON export path independent of Observer hosting.

## 5. Core domain model

### 5.1 Work Contract

A durable, versioned definition of delegated work.

Required fields:
- id: stable opaque ID, generated locally
- workspace_id: owner scope (single-tenant in first release)
- title: concise objective
- intent: user-authored description of desired outcome
- owner: local user identity or owner label
- status: current lifecycle state
- revision: monotonic integer for optimistic concurrency
- created_at, updated_at
- source: manual, CLI, issue import, or inferred suggestion (only manual/CLI in MVP)

Optional fields:
- repository: canonical repository identifier, if known
- base_ref or branch: context, not an assumed constraint
- constraints: explicit prohibitions, boundaries, and resource limits
- acceptance_criteria: individually identifiable conditions
- related_issue, pull_request, deployment, or external objective URLs
- due_at, priority, review_policy
- completion_summary and human acceptance timestamp

A Work Contract must not be silently rewritten based on a model's own interpretation. Suggestions may be proposed separately; material changes require owner authorization and append a revision.

### 5.2 Acceptance Criterion

- id, contract_id, name, description
- evaluator_kind: manual | command_result | github_check | artifact_exists | external_adapter
- configuration: allowlisted, bounded evaluator parameters; **never executable commands uploaded by the cloud UI**
- required: boolean
- evaluation_state: pending | passed | failed | unknown | waived
- evaluated_at, evidence_ids
- last_evaluator_version
- waiver_actor and waiver_reason (if waived)

"Passed" must have a link to evidence from its declared evaluator. Unsupported criteria remain unknown or manual, not inferred as successful by an LLM.

### 5.3 Run Reference

A reference to an existing execution session, not ownership of that session.

- id, provider, source_session_id, device_id
- source_activity_id (when corresponding to protocol 1 activity)
- started_at, last_seen_at, ended_at
- observed_status, attribution_confidence
- optional repository/ref information
- capability flags: observe, transcript, link_artifacts, request_pause, request_resume, etc.

A run can be linked to more than one contract only when explicitly authorized or clearly labeled as shared; MVP defaults to one primary contract link.

### 5.4 Evidence

An immutable record supporting or contradicting a criterion or outcome.

- id, contract_id, criterion_id (optional)
- kind: run_exit | git_commit | git_diff_metadata | ci_check | test_result | deployment | artifact | manual_review | agent_claim
- source: device, provider, adapter, URL or user
- subject_ref, observed_at, received_at
- result: pass | fail | informational | unknown
- provenance_class: external_observation | local_observation | user_assertion | agent_self_report
- content_hash (if content was imported), sanitized_summary, optional redacted metadata
- redaction_policy, retention_class

"Agent self-report" is evidence that an agent *made a claim*, not a reliable independent test result. A successful local command exit can prove that particular command exited 0; it cannot prove the entire objective is correct.

### 5.5 Review Decision

- id, contract_id, contract_revision
- actor, disposition: accept | request_changes | waive_criterion | cancel
- rationale, evidence_snapshot_ids, timestamp
- source: trusted local CLI in MVP; future authenticated operator role

Review decisions must be attributed and auditable. Acceptance may be reverted through a new revision; history is not destructively rewritten.

### 5.6 Handoff Bundle

Portable output assembled from a Work Contract and explicit, consented references:
- objective, latest approved constraints, acceptance criteria
- linked run summaries, completed or failed attempts
- relevant artifacts and evidence references
- unresolved questions, recommended next actions
- provenance markers and generation timestamp
- warnings about omitted/redacted context

Handoff is a **proposal for continuation**, not a guarantee of full context transfer or a remote command.

### 5.7 Graph edges

The work graph contains typed edges such as:
- contract → contains → criterion
- contract → linked_run → run
- contract → depends_on → contract
- run → produced → artifact
- evidence → supports / contradicts → criterion
- decision → references → evidence
- handoff → summarizes → contract revision

An initial relational model can represent these relationships. A graph database is not required.

## 6. Contract state machine

First-release contract states:

| State | Meaning |
| --- | --- |
| draft | Objective defined but not activated |
| active | Work ongoing or queued |
| blocked | An explicit unmet dependency or issue requires resolution |
| review_required | Work may be complete, but acceptance conditions or review are outstanding |
| accepted | Human owner accepted the outcome |
| cancelled | Owner stopped the objective |

Allowed transitions:
- draft → active / cancelled
- active → blocked / review_required / cancelled
- blocked → active / review_required / cancelled
- review_required → active / blocked / accepted / cancelled
- accepted → active only by creating a new revision with an explicit reopening action
- cancelled → active only by explicit reopening and a new revision

A run status (running/completed/failed) is **not** a contract status. An agent completing a run does not automatically accept a contract.

The computed review summary may say "ready to review" if all required machine-checkable criteria are passed and manual criteria are pending, but may never silently set accepted.

## 7. Required user journeys

### Journey A: Define and observe an objective

1. User invokes a local command to create a contract (title, intent, optional repo/criteria).
2. Observer persists the contract locally and syncs sanitized metadata if enabled.
3. User links one or more already-running sessions or wrapped commands.
4. The dashboard shows objective status, connected sessions, and latest evidence.
5. All existing unlinked activities remain visible in the legacy project view.

**Acceptance:** No modifications to the agent's process are required merely to attach a session.

### Journey B: Finish a run without falsely completing the work

1. Linked agent run reports completion.
2. Observer records that claim as run status.
3. Evidence collectors independently gather permitted test results, CI state, and artifact references.
4. Contract displays criteria individually as passed/failed/unknown.
5. Owner sees "Review required" rather than "Verified complete" when evidence is insufficient.

**Acceptance:** A fake "all tests passed" agent message does not satisfy a test criterion.

### Journey C: Recover and continue across providers

1. A session stops, resets, or is abandoned.
2. Observer maintains the Work Contract and links to its historical runs.
3. Local CLI generates a markdown handoff from approved context and evidence.
4. User reads/edits it and supplies it to a different provider or new session.
5. New run links back to the same contract.

**Acceptance:** A human can reconstruct what remains to be done from the handoff without opening previous transcripts. No claim is made that model-private state migrated.

### Journey D: Prioritize attention

1. Several contracts and runs are active.
2. Dashboard ranks explicit blockers, failed required criteria, and review requests ahead of ordinary progress.
3. Every attention item has a reason and a link to supporting evidence.
4. User can dismiss noncritical reminders locally without marking objective accepted.

**Acceptance:** A quiet run produces no urgent alert merely because its terminal stopped updating.

## 8. Functional requirements

### MVP-A — Durable work (P0)

- **FR-001:** Create, read, update, cancel, and explicitly reopen Work Contracts locally.
- **FR-002:** Maintain immutable contract revisions and state-transition history.
- **FR-003:** Link/unlink existing protocol 1 activity to a contract without rewriting the activity ID.
- **FR-004:** Show active contracts, review status, and linked runs in the read-only hosted UI.
- **FR-005:** Keep legacy project/activity navigation available and unmodified for users who opt out.
- **FR-006:** Support export of a contract with a redacted human-readable summary and JSON metadata.
- **FR-007:** Sync operations are retry-safe, additive, and idempotent.

### MVP-B — Evidence and review (P0 for first meaningful demo)

- **FR-008:** Capture exit status from existing explicit observer run activity.
- **FR-009:** Represent a test command exit, CI check, artifact reference, or agent claim with clear provenance labels.
- **FR-010:** Evaluate supported criteria deterministically; unknown stays unknown.
- **FR-011:** Show which required criteria block review or acceptance.
- **FR-012:** Provide local CLI acceptance/revision decisions with actor and rationale.
- **FR-013:** Never interpret an LLM-generated summary as independently verified evidence.

### MVP-C — Continuity (P0 for initial wedge)

- **FR-014:** Generate a bounded, human-editable handoff markdown file.
- **FR-015:** Include current contract revision, constraints, outstanding conditions, and source links.
- **FR-016:** Exclude full transcript contents unless transcript mode is independently enabled.
- **FR-017:** Link a subsequent provider's run to the same contract without resetting history.

### MVP-D — Attention surface (P1)

- **FR-018:** Surface explicit blockers, failed required criteria, stale runs, and review-needed objectives.
- **FR-019:** Show the exact reason each item is surfaced.
- **FR-020:** Do not infer blocked from inactivity alone; use "possibly stalled" when only heuristics exist.
- **FR-021:** Provide timestamped, deduplicated summaries rather than repetitive stream notifications.

### Future (not MVP)

- **FR-022:** Secure, separately authenticated web-based review decisions.
- **FR-023:** Supported pause/resume/retry through provider capabilities, with clear permission boundaries.
- **FR-024:** Dependency-aware multi-agent scheduling and conflict avoidance.
- **FR-025:** Organization workspaces, role-based access, audit export, enterprise policies.
- **FR-026:** Broader integrations into issue trackers, repositories, deployments, and non-coding workloads.
- **FR-027:** Explicitly authorized managed execution or resource allocation; never retrofit silent remote shell access.

## 9. Verification and trust model

### Separate three statements

1. **Claim:** An agent or person reported something.
2. **Observation:** A trusted collector saw a particular event or external system state.
3. **Acceptance:** The authorized human accepted a work outcome.

The UI must never collapse these into one "done" indicator.

### Evidence trust rules

- A session response saying "tests passed" is agent_self_report.
- A command tracked by observer run with an exit code is local_observation of that exit code.
- A GitHub check fetched using a configured GitHub integration is external_observation of the check's reported state.
- Manual review is user_assertion attributed to the reviewer.
- If evidence is stale relative to the contract revision or code commit, mark it stale and require reevaluation.
- If a validation source is unavailable, show unknown rather than implicitly passing.
- Store evaluator/version, target commit or artifact identity, and timestamp where possible.
- Verification result should specify **what** was checked and **what was not**.

No ungrounded percentage confidence score. A useful "review readiness" indication must be derived from criteria and clearly documented.

## 10. Integration contract

### Compatibility

**Protocol 1 remains unchanged:**

~~~json
{"protocol":1,"device_id":"local-device","threads":[{"id":"...","source":"codex","status":"running"}]}
~~~

The above is abbreviated illustration, not a replacement schema.

### Proposed separate work sync (v2)

~~~json
{
  "protocol": 2,
  "device_id": "opaque-device-id",
  "batch_id": "deduplicated-uuid",
  "sent_at": "2026-11-17T00:00:00Z",
  "contracts": [],
  "run_links": [],
  "evidence": [],
  "events": []
}
~~~

Rules:
- Schema-validate and size-bound every field on both sender and Worker.
- Assign stable IDs at the source. Enforce unique (device_id, event_id) or equivalent deduplication key.
- Support out-of-order delivery using event timestamps plus monotonic contract revision rules.
- Reject conflicting updates with explicit errors; do not use server arrival order as user authority.
- Use clear capability declarations for each provider and source.
- Only upload metadata approved by the active user sync policy.
- If v2 is disabled, v1 remains fully functional.

Adapters should report capabilities, not simulate unsupported commands. Start with source-session association via local file metadata and existing watcher events. Do not rely on undocumented private endpoints as core infrastructure.

## 11. Proposed persistence model

Use versioned, reversible D1 migrations. Additive tables only for the first release:

| Table | Purpose | Important key |
| --- | --- | --- |
| work_contracts | Latest contract revision and lifecycle state | id |
| work_contract_revisions | Immutable intent/constraint snapshots | (contract_id, revision) |
| work_criteria | Acceptance criteria and evaluation metadata | id |
| work_run_links | Connect existing activities to objectives | (contract_id, run_id) |
| work_evidence | Provenance-labeled observations | id |
| work_decisions | Attributed accept/revise/waive/cancel actions | id |
| work_events | Idempotent event and transition log | (device_id, event_id) |
| work_handoffs | Optional metadata for generated handoffs, not default full contents | id |

Do not create a graph database for MVP. Build aggregate views by joining these tables. Optimize only after measuring workload.

### Data lifecycle

- Existing activity/preview retention is unaffected.
- A Work Contract's persistence needs an explicit user-facing retention decision because objectives may outlive the current 30-day activity window.
- Proposed initial policy: active contracts persist until deletion; completed/cancelled contracts expire after a configurable grace period; raw events and sensitive evidence follow bounded retention; deleting a contract cascades associated stored copies.
- **Blocking design decision before release:** finalize grace period and ensure deletion, export, cron, and backup behavior are documented and tested.
- Never silently promise permanent evidence if the configured retention window removes it.

## 12. Backend and client surfaces

### Local CLI (first implementation)

Proposed commands (interface subject to CLI review):

~~~sh
observer work create --title "Refactor auth" --repo ./app
observer work list
observer work show <work-id>
observer work link <work-id> --source codex --session <session-id>
observer work criterion add <work-id> --title "Tests pass" --type command_result
observer work handoff <work-id> --out ./HANDOFF.md
observer work accept <work-id> --reason "Reviewed changes and checks"
observer work export <work-id> --out ./work.json
~~~

The CLI should support interactive entry for long descriptions and require explicit confirmation for acceptance, deletion, and any future high-impact action. It must never collect local shell histories or unregistered sessions just to infer work.

### Read-only hosted endpoints (proposed)

- GET /api/v2/work — list and attention summary
- GET /api/v2/work/:id — contract, criteria, run links, evidence summaries
- GET /api/v2/work/:id/evidence — bounded paginated evidence
- GET /api/v2/work/:id/handoff — sanitized metadata, only if separately synced

### Ingestion endpoint (proposed)

- POST /api/v2/work/sync — authenticated via the existing ingestion trust boundary, with stricter per-batch limits and work-specific validation.

**No web write endpoint in MVP.** Later web editing/approval requires a distinct authenticated operator role, CSRF protection, explicit scopes, audit logs, rate limits, and separate security review. Never equate knowledge of the read-only VIEW_PASSWORD with authorization to act.

## 13. User experience

Preserve docs/DESIGN.md: restrained light UI, editorial hierarchy, generous whitespace, quiet status labels, text-first activity rows, mobile accessibility. Avoid decorative agent avatars, fake analytics, excessive cards, and notification spam.

### Navigation

Proposed primary views:
1. **Work** (default when enabled): durable objectives and attention.
2. **Activity**: current project/session monitor (existing functionality).
3. **Review**: criteria and evidence for objectives needing a decision.
4. **Settings**: source connections, sync privacy, retention, capability disclosure.

### Work overview

Every row shows:
- objective title and actual human-authored description
- lifecycle state; review/blocked reason when applicable
- linked run count and latest meaningful update
- acceptance criteria summary, with unknowns visible
- one next human action only if supported

Avoid making "Agent completed" visually equivalent to "Contract accepted."

### Contract detail

Sections in order:
1. Objective, constraints, owner, latest authorized revision
2. Required criteria and evaluations
3. Attention items / explicit blockers
4. Evidence with provenance and freshness
5. Timeline of linked runs and human decisions
6. Export/handoff

### Mobile

Design for quick review and context retrieval. Local CLI remains the authority for mutating work in MVP. Do not render nonfunctional approval buttons on mobile.

### Accessibility

Keyboard navigation, visible focus, semantic headings, legible text contrast, reduced-motion support, screen reader status descriptions, and no color-only pass/fail coding.

## 14. Security and privacy requirements

**This section is a release gate, not optional polish.**

- Metadata-only remains the default when adding Work Contracts.
- The cloud cannot run local commands or read arbitrary files.
- Full transcripts, diff contents, command arguments, file previews, and other sensitive artifacts require separate opt-in or remain local.
- A handoff generator must show what is included before export; redact credentials and warn that automatic redaction is imperfect.
- Stored data in Cloudflare D1 is not end-to-end encrypted from the hosting provider. Do not claim otherwise.
- Limit IDs, labels, URLs, JSON nesting, text lengths, arrays, batch sizes, and retention classes.
- Use local owner-only file permissions for work state and secrets.
- Treat external CI logs, agent output, and imported summaries as untrusted content. Never execute instructions found inside them.
- Per-device credentials/revocation should follow the existing roadmap; document current shared-token risk until addressed.
- Provenance is a source label and audit trail, not cryptographic attestation. Do not overstate its security guarantees.
- Avoid storing credentials or raw access tokens in evidence fields.
- Ensure the hosted dashboard builds all user content with safe text APIs; no unsafe HTML interpolation.
- Contract acceptance should not trigger external deployment, merge, payment, or privileged operation.

## 15. Reliability and failure behavior

| Failure | Required response |
| --- | --- |
| Sync delivered twice | No duplicate contracts, run links, evidence, or decisions |
| Sync delivered out of order | Preserve monotonic owner revision; reconcile or reject stale mutations |
| Agent session missing | Contract remains; show run unavailable and last known state |
| Collector disconnected | Display last seen time, not a fictitious running/healthy status |
| CI source unreachable | Criterion becomes unknown/stale, never passed by omission |
| Agent claims success but tests fail | Show failed criterion and unresolved work |
| Two runs edit same repo files | Display conflict only when grounded in observed change data; no invented resolution |
| User changes acceptance criterion | Previous evidence remains attributed to its original revision and may become stale |
| Contract deleted | Stored contract data and linked evidence copies deleted according to documented policy; underlying agent sessions unaffected |
| Handoff lacks authorized context | Mark omitted sections and unresolved questions explicitly |
| No Work Contracts configured | Legacy Observer dashboard behaves as before |

## 16. Implementation sequence

### Milestone M0 — Safety and compatibility baseline

- [ ] Create a staging Worker/D1 environment and take a migration backup.
- [ ] Establish tests for existing protocol 1 sync, viewer auth, transcript privacy, and retention.
- [ ] Record the current CLI/setup release checks; no production migrations yet.
- [ ] Finalize work data retention and identity/actor semantics.

**Exit gate:** Existing code and data remain readable with work features disabled.

### Milestone M1 — Work Contracts (first demo)

- [ ] Add local work-state store and CLI create/list/show/update/cancel.
- [ ] Define revisioned contract and criterion schema with validation.
- [ ] Add run-to-contract linking using existing activity IDs.
- [ ] Add non-destructive Worker tables and opt-in v2 ingestion.
- [ ] Render Work list/detail in hosted UI while retaining Activity.
- [ ] Add contract export and simple manual linking UX.

**Exit gate:** Two agent sessions can be associated with one objective and displayed as one durable work item.

### Milestone M2 — Evidence and review

- [ ] Ingest observer run exit outcomes as provenance-labeled evidence.
- [ ] Implement deterministic criterion evaluation and stale handling.
- [ ] Add optional GitHub check integration with explicit permissions.
- [ ] Show pending/failed/unknown/waived criteria and supporting references.
- [ ] Add local review/accept/reopen commands and immutable decisions.

**Exit gate:** A claimed-complete run with failed tests remains unaccepted and explains why.

### Milestone M3 — Handoffs and attention

- [ ] Generate redacted markdown handoffs from contract revisions, linked runs, and evidence.
- [ ] Link a new provider session to an existing contract without losing history.
- [ ] Build attention ranking based on explicit blockers and review readiness.
- [ ] Test interruption, stale run, and absent-context scenarios.
- [ ] Conduct usability testing with real multi-agent developers.

**Exit gate:** A user can leave one session, resume work in another, and quickly recover the remaining obligations.

### Milestone M4 — Validate before expanding scope

- [ ] Run an opt-in pilot with 10 repeat multi-agent users.
- [ ] Measure repeat usage, review time, handoff time, and correctness of state labels.
- [ ] Measure metadata payload, synchronization reliability, false-positive attention, and disclosure risk.
- [ ] Determine whether to prioritize CI/deployment depth, local UI editing, or work dependencies next.

**Exit gate:** Demonstrated repeated value in real workflows, not merely dashboard engagement.

### Deliberately deferred

- Autonomous scheduling / routing between models
- Remote execution and remote process control
- Multi-tenant hosted SaaS
- Enterprise role-based approvals and policy enforcement
- Company-wide non-code workflows
- Learned "success scores" without externally grounded evidence

## 17. Success metrics and release gates

### Product hypotheses (to validate)

- Users with multiple active agents revisit the **work view** to make decisions, not just to watch activity.
- Handoffs reduce time spent reconstructing context after a session reset.
- Evidence-based reviews catch agent self-reported completion that does not satisfy explicit criteria.
- Attention summaries reduce time spent checking session status.

### Proposed pilot targets (not observed performance)

- At least 5 of 10 recruited heavy agent users voluntarily use Work Contracts repeatedly in a two-week pilot.
- A representative two-provider handoff can be prepared without manually copying entire prior transcripts.
- Every surfaced "passed" criterion links to an evaluator result at a known revision.
- No unsupported remote control operations are reachable from the hosted UI.

### Engineering release gates

- All existing npm and Python tests remain green.
- Migration and rollback tested on realistic staging data.
- Replaying the same event batch yields unchanged records and states.
- Conflicting contract revisions cannot silently overwrite user intent.
- Protocol 1 clients remain compatible; opt-out mode is unchanged.
- Metadata-only path does not sync transcript contents, diff bodies, or artifact payloads.
- Keyboard/mobile review flows work at representative breakpoints.
- Local deletion/export and cloud retention behavior are tested and documented.
- Review of threat model, auth boundaries, and failure modes completed before public release.

## 18. Strategic choices and risks

### Where the product must be distinct

The moat is not merely multi-provider integration. Existing platforms already offer multi-agent dashboards and cross-provider workflows. Observer must win on **durable intent + trustworthy review + practical continuity**, with unusually low setup and cognitive overhead.

### Primary risks

1. **Platform absorption:** Codex, Claude, GitHub, or Linear builds equivalent work tracking and review.
2. **User friction:** Work Contracts become another issue tracker requiring constant maintenance.
3. **Insufficient trust:** Evidence is incomplete or too stale to be actionable.
4. **Integration fragility:** Agent formats and provider policies change.
5. **Security:** Users accidentally upload proprietary work or over-authorize remote actions.
6. **Weak demand:** Users enjoy aggregated status but don't change behavior or pay for outcome supervision.

### Mitigations to test

- Make contract creation concise, link existing work automatically only when confidence is high and user can correct it.
- Preserve native agent workflows; Observer should not require migration to its own executor.
- Make provenance and unknowns explicit.
- Prefer supported interfaces, open event formats, and local-first adapters.
- Separate accepted human outcomes from claimed agent results.
- Test actual reduction in review/recovery effort before broadening scope.

## 19. Open design decisions

| ID | Question | Default proposal |
| --- | --- | --- |
| D-01 | Should the Work view replace the project view? | Optional default; preserve Activity |
| D-02 | Can a run belong to multiple objectives? | One primary link initially; future shared links |
| D-03 | Who can revise/accept? | Trusted local CLI owner initially |
| D-04 | How are external CI checks verified? | Explicitly configured adapter, narrow scope, provenance |
| D-05 | How long do active/completed contracts persist? | Active until deletion; configurable expiry after close; requires review |
| D-06 | Is the Work Contract schema public? | Publish a stable, portable JSON schema after pilot |
| D-07 | When should work be automatically inferred? | Suggestions only, no silent contract creation |
| D-08 | Should handoffs contain raw transcripts? | No by default; independently opt-in |
| D-09 | When can browser approvals be enabled? | Separate operator auth and security review, post-MVP |
| D-10 | Which feature earns first willingness-to-pay? | Unknown; pilot should compare review and handoff utility |

## 20. First concrete engineering issues

1. **Spec schema and migration:** Type/schema definitions for Work Contract, criterion, run link, evidence, and decisions, plus additive D1 migration design.
2. **Local work CLI:** Create/list/show/update/link/export with user-owned local store.
3. **Opt-in work sync:** Versioned authenticated work metadata ingestion; event deduplication and payload bounds.
4. **Work UI:** Read-only work list/detail, explicit provenance, preserved legacy activity view.
5. **Evidence v1:** Local observer run exit evidence, deterministic criteria, stale checks.
6. **Handoff v1:** Portable markdown generation from approved context and evidence.
7. **Compatibility and privacy tests:** Protocol 1 regression, metadata-only guarantees, migration, and no remote command path.
8. **Pilot and evaluation:** Instrument non-sensitive opt-in usage metrics and collect qualitative failure cases.

---

## 21. Definition of a successful first release

A developer creates an objective, links two sessions from different coding agents, and lets them work. One run ends successfully, but a required test fails. Observer **does not** call the objective complete. It shows the failed condition and where the evidence came from. The developer can generate a concise handoff, continue in a second agent, run the check again, and explicitly accept the finished result.

**If this demo works reliably and naturally, Observer has moved beyond monitoring into supervision.**

**Single guiding rule:** Observer owns the objective. Agents are replaceable workers. The human remains in control.
