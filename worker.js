/**
 * Observer - Cloudflare Worker (no runtime packages).
 * Build worker.js with: python3 build_worker.py
 * Cloudflare bindings: D1 database named DB; secrets AGENT_TOKEN,
 * VIEW_PASSWORD, SESSION_KEY. No commands, task creation, or filesystem writes.
 */
const HTML = "<!doctype html>\n<html lang=\"en\" data-demo=\"false\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#fafaf8\">\n<meta name=\"color-scheme\" content=\"light\">\n<meta name=\"description\" content=\"Observer - see what your projects are doing.\">\n<title>Observer</title>\n<style nonce=\"__NONCE__\">\n/* Keep this aligned with Observer's original minimalist-ui palette and typography. */\n:root {\n  --bg: #fafaf8;\n  --surface: #fff;\n  --ink: #252724;\n  --muted: #777b75;\n  --quiet: #9a9f99;\n  --line: #e6e8e3;\n  --hover: #f3f4f0;\n  --selected: #eff1ed;\n  --green: #39775a;\n  --red: #9f5a51;\n  --sans: \"SF Pro Display\", \"Helvetica Neue\", -apple-system, BlinkMacSystemFont, Arial, sans-serif;\n  --serif: Georgia, \"Times New Roman\", serif;\n  --mono: \"SF Mono\", Menlo, Consolas, monospace;\n}\n*, *::before, *::after {box-sizing: border-box}\nhtml {background: var(--bg); -webkit-text-size-adjust: 100%}\nbody {margin: 0; min-height: 100vh; color: var(--ink); background: var(--bg); font: 14px/1.55 var(--sans); -webkit-font-smoothing: antialiased}\nbutton, input, select {font: inherit}\nbutton {cursor: pointer}\nbutton:disabled {opacity: .5; cursor: default}\na {color: inherit; text-underline-offset: 3px}\na:hover {color: var(--green)}\nbutton:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible {outline: 2px solid var(--green); outline-offset: 3px}\nbutton:active:not(:disabled) {transform: translateY(1px)}\n[hidden] {display: none !important}\n::selection {background: #e3ece3}\n.sr-only {position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0}\n.skip {position: absolute; left: -9999px; top: 0}\n.skip:focus {left: 12px; top: 12px; z-index: 20; background: var(--surface); padding: 9px}\n\n.shell {width: 100%; max-width: 1136px; margin: auto; padding: 0 clamp(22px,4.5vw,54px) 70px}\n.topbar {height: 70px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--line)}\n.brand {font-size: 19px; font-weight: 700; letter-spacing: -.072em}\n.brand span {color: var(--green)}\n.top-actions {display: flex; align-items: center; gap: 22px}\n.connection {display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); white-space: nowrap}\n.signal {width: 7px; height: 7px; display: inline-block; flex: none; border-radius: 50%; background: var(--green)}\n.signal.off {background: #b2a8a3}\n.action {min-height: 40px; border: 0; padding: 8px 0; background: transparent; color: var(--muted); font-size: 12px}\n.action:hover {color: var(--ink)}\n\n.intro {padding: 43px 0 30px; border-bottom: 1px solid var(--line)}\n.intro h1 {font: 400 43px/1.05 var(--serif); letter-spacing: -.055em; margin: 0}\n.intro p {margin: 12px 0 0; font-size: 13px; color: var(--muted)}\n.stats {display: flex; align-items: baseline; gap: clamp(25px,5.8vw,76px); border-bottom: 1px solid var(--line); padding: 25px 0 27px}\n.stat {min-width: 0; display: flex; align-items: baseline; gap: 9px}\n.stat-num {font-size: 22px; letter-spacing: -.04em; font-weight: 600; line-height: 1.25; font-variant-numeric: tabular-nums}\n.stat-label {font-size: 12px; color: var(--muted); white-space: nowrap}\n\n.section-head {display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; padding: 31px 0 7px}\n.section-head h2 {font-size: 14px; font-weight: 650; letter-spacing: -.015em; margin: 0}\n.tabs {display: inline-flex; gap: 24px; border-bottom: 1px solid var(--line)}\n.tab {position: relative; background: transparent; border: 0; color: var(--muted); font-size: 12px; padding: 9px 0 12px}\n.tab:hover, .tab.active {color: var(--ink)}\n.tab.active {font-weight: 650}\n.tab.active::after {content: \"\"; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--ink)}\n.tools {display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin: 13px 0 9px}\n.search-wrap {display: flex; align-items: center; flex: 1; min-width: 175px; max-width: 420px; height: 42px; border-bottom: 1px solid var(--line)}\n.search-wrap:focus-within {border-color: #819c87}\n.search {border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 13px; width: 100%; padding: 10px 2px; min-width: 0}\n.search::placeholder {color: var(--quiet)}\n.source {height: 39px; min-width: 115px; max-width: 175px; padding: 0 2px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; color: var(--muted); font-size: 12px}\n.notice {color: #956400; font-size: 12px; min-height: 17px; margin: 4px 0 0}\n\n.stack {display: block; min-width: 0}\n.project {border-top: 1px solid var(--line); padding: 3px 0 10px}\n.project:first-child {margin-top: 5px}\n.project-head {display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 63px; padding: 14px 4px 10px}\n.project-name {font-size: 15px; font-weight: 650; letter-spacing: -.025em; overflow-wrap: anywhere}\n.project-secondary {font-size: 12px; color: var(--muted); margin-top: 2px}\n.pill {border-radius: 999px; padding: 3px 9px; background: var(--hover); color: var(--muted); font-size: 10px; letter-spacing: .015em; flex: none; white-space: nowrap}\n.pill.active {color: #346538; background: #edf3ec}\n.pill.attention {color: #9f2f2d; background: #fdebec}\n.activity {display: grid; grid-template-columns: 58px minmax(0,1fr) auto; align-items: center; gap: 18px; min-height: 72px; width: 100%; text-align: left; padding: 11px 8px; border: 0; border-top: 1px solid var(--line); background: transparent; color: var(--ink); transition: background .17s}\n.activity:hover, .activity:focus-visible {background: var(--hover)}\n.activity:active:not(:disabled) {transform: none}\n.activity-icon {display: block; width: 53px; color: var(--quiet); font: 500 10px/1.45 var(--mono); letter-spacing: -.04em; text-transform: uppercase}\n.activity-copy {display: block; min-width: 0}\n.activity-title {font-size: 13px; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere}\n.activity-desc {font-size: 12px; margin-top: 4px; color: var(--muted)}\n.activity-state {font-size: 11px; color: var(--muted); white-space: nowrap}\n.activity-state.ok {color: var(--green)}\n.activity-state.fail {color: var(--red)}\n.activity-state.running {color: var(--green)}\n.empty {font-size: 13px; color: var(--muted); padding: 55px 6px; border-top: 1px solid var(--line)}\n.footer {display: flex; justify-content: space-between; flex-wrap: wrap; gap: 15px; padding-top: 28px; margin-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px}\n.footer a {text-decoration: none}\n.footer a:hover {color: var(--ink)}\n\n/* Flat, editorial side sheet instead of a raised modal. */\n.overlay {position: fixed; inset: 0; z-index: 15; background: rgba(37,39,36,.18)}\n.dialog {position: absolute; top: 0; right: 0; bottom: 0; width: min(100%,510px); overflow-y: auto; background: var(--bg); border-left: 1px solid var(--line); padding: 30px clamp(25px,3vw,42px) 55px}\n.dialog-head {display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; border-bottom: 1px solid var(--line); padding-bottom: 27px}\n.dialog h2 {font: 400 clamp(24px,2.7vw,30px)/1.2 var(--serif); letter-spacing: -.04em; margin: 0; overflow-wrap: anywhere}\n.x {background: transparent; border: 0; padding: 0 3px; color: var(--muted); font-size: 13px; min-height: 32px; white-space: nowrap}\n.x:hover {color: var(--ink)}\n.detail-meta {margin-top: 13px; font-size: 12px; color: var(--muted); overflow-wrap: anywhere}\n.result-title {font-size: 13px; font-weight: 650; margin: 28px 0 14px}\n.output {font: 13px/1.8 var(--sans); color: #454943; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 400px; overflow: auto}\n.events {padding: 0; margin: 0; list-style: none}\n.events li {display: flex; align-items: baseline; justify-content: space-between; gap: 15px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--line); padding: 11px 0}\n.events time {flex: none; color: var(--quiet)}\n.events li span {overflow-wrap: anywhere}\n.back-link {border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--muted); padding: 15px 0; font-size: 12px; width: 100%; text-align: left}\n.back-link:hover {color: var(--ink)}\n.subtask {width: 100%; display: flex; align-items: baseline; justify-content: space-between; gap: 15px; border: 0; border-top: 1px solid var(--line); background: none; color: var(--ink); padding: 13px 0; text-align: left; font-size: 12px}\n.subtask:hover {background: var(--hover)}\n.subtask small {color: var(--muted); flex: none}\n\n.conversation {display:flex;flex-direction:column;gap:22px}\n.conversation-head {display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:28px 0 18px}\n.conversation-head .result-title {margin:0}\n.conversation-note {font-size:11px;color:var(--muted)}\n.conv-message {min-width:0;overflow-wrap:anywhere}\n.conv-message.user {margin-left:20px;padding:15px 16px;background:#eef0ec;border:1px solid var(--line);border-radius:8px}\n.conv-message.assistant {padding:0 2px}\n.conv-byline {display:flex;align-items:baseline;justify-content:space-between;gap:12px;color:var(--muted);font-size:11px;margin-bottom:8px}\n.conv-byline strong {color:var(--ink);font-weight:650}\n.conv-content {color:#383c37;font-size:13px;line-height:1.8;overflow-wrap:anywhere}\n.conv-content .conv-text {white-space:pre-wrap}\n.conv-content code {font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;background:#edf0eb;border-radius:3px;padding:1px 3px}\n.conv-content pre,.conv-steps pre {background:#f1f2ef;border-radius:6px;color:#303a34;font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;margin:10px 0 0;padding:12px 13px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}\n.conv-content pre code {padding:0;background:none}\n.conv-code-label {display:block;font-size:10px;letter-spacing:.04em;color:var(--muted);margin-bottom:6px}\n.conv-tools {border:1px solid var(--line);border-radius:7px;background:#f7f8f5;min-width:0}\n.conv-tools summary {list-style:none;cursor:pointer;padding:12px 14px;font-size:12px;color:var(--muted);display:flex;justify-content:space-between;align-items:center;gap:10px;overflow-wrap:anywhere}\n.conv-tools summary::-webkit-details-marker {display:none}\n.conv-tools summary::after {content:'Show';color:var(--green);font-size:11px;flex:none}\n.conv-tools[open] summary::after {content:'Hide'}\n.conv-steps {list-style:none;margin:0;padding:0 14px 8px}\n.conv-steps li {border-top:1px solid var(--line);padding:10px 0 12px}\n.conv-step-title {font-size:12px;color:var(--ink);font-weight:550;overflow-wrap:anywhere}\n.conv-step-error {color:var(--red)}\n.conv-steps pre {max-height:280px}\n.conv-notice {font-size:11px;color:var(--muted);text-align:center;border-top:1px solid var(--line);padding:12px 0 0}\n\n.auth-screen {min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 35px 22px}\n.auth-card {width: 100%; max-width: 340px}\n.auth-card .brand {display: block; margin-bottom: 54px}\n.auth-card h1 {font: 400 37px/1.08 var(--serif); letter-spacing: -.05em; margin: 0 0 29px}\n.field-label {display: block; font-size: 12px; font-weight: 600; margin-bottom: 8px}\n.password {width: 100%; height: 46px; background: var(--surface); border: 1px solid #d9ded7; border-radius: 5px; padding: 0 12px; outline: 0}\n.password:focus {border-color: var(--green)}\n.primary {width: 100%; height: 46px; margin-top: 14px; border: 0; border-radius: 5px; background: var(--ink); color: white; font-size: 13px; font-weight: 600}\n.primary:hover {background: #424841}\n.auth-error {min-height: 17px; margin-top: 12px; font-size: 12px; color: var(--red)}\n@media (max-width: 760px) {\n  .shell {padding: 0 23px 45px}\n  .topbar {height: 64px}\n  .top-actions {gap: 16px}\n  .intro {padding: 37px 0 27px}\n  .intro h1 {font-size: 40px}\n  .stats {gap: 17px; flex-wrap: wrap; padding: 22px 0}\n  .stat {gap: 6px}\n  .stat-num {font-size: 20px}\n  .stat-label {font-size: 11px}\n  .section-head {padding-top: 24px}\n  .tabs {gap: 19px}\n  .tools {gap: 12px}\n  .search-wrap {max-width: none}\n  .project-head {min-height: 59px}\n  .activity {grid-template-columns: 44px minmax(0,1fr) auto; gap: 11px; padding: 13px 3px; min-height: 73px}\n  .activity-icon {width: 43px; font-size: 9px}\n  .activity-state {font-size: 10px}\n  .dialog {width: 100%; border-left: 0; padding: 29px 23px 50px}\n}\n@media (max-width: 380px) {\n  .top-actions {gap: 10px}\n  .stats {gap: 14px}\n  .stat {flex-direction: column; gap: 1px}\n  .source {max-width: 125px}\n}\n@media (prefers-reduced-motion: reduce) {*,*::before,*::after {transition: none !important; scroll-behavior: auto !important; animation: none !important}}\n</style>\n</head>\n<body>\n<a class=\"skip\" href=\"#main\">Skip to workspace</a>\n<div class=\"auth-screen\" id=\"login\">\n  <div class=\"auth-card\">\n    <div class=\"brand\">observer<span>.</span></div>\n    <h1>Sign in</h1>\n    <form id=\"login-form\">\n      <label class=\"field-label\" for=\"password\">Password</label>\n      <input class=\"password\" id=\"password\" type=\"password\" autocomplete=\"current-password\" required>\n      <button class=\"primary\" id=\"login-button\" type=\"submit\">Continue</button>\n      <div id=\"login-error\" class=\"auth-error\" role=\"alert\"></div>\n    </form>\n  </div>\n</div>\n<div class=\"shell\" id=\"app\" hidden>\n  <header class=\"topbar\">\n    <div class=\"brand\">observer<span>.</span></div>\n    <div class=\"top-actions\">\n      <div class=\"connection\" role=\"status\"><span id=\"status-dot\" class=\"signal\"></span><span id=\"connection\">Connecting</span></div>\n      <button class=\"action\" id=\"refresh\" type=\"button\">Refresh</button>\n      <button class=\"action\" id=\"logout\" type=\"button\">Sign out</button>\n    </div>\n  </header>\n  <main id=\"main\">\n    <section class=\"intro\" aria-label=\"Overview\">\n      <h1>Workspace</h1>\n      <p>Activity across your projects.</p>\n    </section>\n    <div class=\"stats\" aria-label=\"Activity summary\">\n      <div class=\"stat\"><span id=\"running\" class=\"stat-num\">0</span><span class=\"stat-label\">Running</span></div>\n      <div class=\"stat\"><span id=\"completed\" class=\"stat-num\">0</span><span class=\"stat-label\">Completed</span></div>\n      <div class=\"stat\"><span id=\"attention\" class=\"stat-num\">0</span><span class=\"stat-label\">Needs attention</span></div>\n    </div>\n    <div class=\"section-head\">\n      <h2 id=\"heading\">Projects</h2>\n      <nav class=\"tabs\" aria-label=\"View\">\n        <button class=\"tab active\" type=\"button\" data-tab=\"projects\" aria-pressed=\"true\">Projects</button>\n        <button class=\"tab\" type=\"button\" data-tab=\"activity\" aria-pressed=\"false\">Activity</button>\n      </nav>\n    </div>\n    <div class=\"tools\">\n      <label class=\"search-wrap\"><span class=\"sr-only\">Search projects and activity</span><input id=\"search\" class=\"search\" type=\"search\" placeholder=\"Search activity\" aria-label=\"Search projects and activity\"></label>\n      <label class=\"sr-only\" for=\"source\">Filter by source</label>\n      <select id=\"source\" class=\"source\" aria-label=\"Filter by source\"><option value=\"\">All sources</option></select>\n    </div>\n    <p id=\"notice\" class=\"notice\" role=\"status\" hidden></p>\n    <div id=\"projects\" class=\"stack\" aria-label=\"Project activity\"></div>\n    <footer class=\"footer\"><span id=\"footnote\"></span><a href=\"https://github.com/brendonwang/observer\" target=\"_blank\" rel=\"noopener noreferrer\">GitHub</a></footer>\n  </main>\n</div>\n<div id=\"overlay\" class=\"overlay\" hidden>\n  <aside role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"dialog-title\" class=\"dialog\" tabindex=\"-1\">\n    <div class=\"dialog-head\">\n      <div><h2 id=\"dialog-title\"></h2><div id=\"dialog-meta\" class=\"detail-meta\"></div></div>\n      <button id=\"close\" class=\"x\" type=\"button\" aria-label=\"Close details\">Close</button>\n    </div>\n    <div id=\"detail-content\"></div>\n  </aside>\n</div>\n<script nonce=\"__NONCE__\">\n(() => {\n  'use strict';\n  const demo = document.documentElement.dataset.demo === 'true';\n  const $ = id => document.getElementById(id);\n  const el = (tag, className = '', text) => {\n    const node = document.createElement(tag);\n    if (className) node.className = className;\n    if (text !== undefined) node.textContent = text;\n    return node;\n  };\n  let state = {threads: [], devices: []};\n  let view = 'projects', query = '', source = '', selected = null, refreshing = false;\n  let loggedIn = demo, lastFocus = null;\n  const now = Date.now(), minutes = n => now - n * 60_000;\n  const demoState = {\n    devices: [{id: 'demo', last_seen_at: now}], threads: [\n      {id: 'demo-agent', project: 'observer', source: 'Codex', title: 'Implement notifications', status: 'working', updated_at: minutes(4),\n        events: [{kind: 'start', label: 'Agent started', at: minutes(4)}],\n        conversation: [\n          {role:'user',text:'Implement a lightweight notification system. Show me the changes.',at:minutes(9)},\n          {role:'assistant',text:'I am adding completion and failure notifications with opt-in settings.',at:minutes(8)},\n          {role:'tool',title:'Read notification handlers',detail:'src/notifications.ts',output:'Located existing status callbacks.',at:minutes(7)},\n          {role:'tool',title:'Updated notification components',detail:'src/notifications.ts',output:'Added the notification event formatter.',at:minutes(6)},\n          {role:'assistant',text:'The event formatter is in place. I am running the tests now.',at:minutes(4)}\n        ]},\n      {id: 'demo-test', project: 'observer', source: 'Terminal', title: 'npm test', status: 'completed', updated_at: minutes(8), final_response: '24 tests passed.', events: [{kind: 'complete', label: 'Tests passed', at: minutes(8)}]},\n      {id: 'demo-server', project: 'observer', source: 'Service', title: 'Development server', status: 'completed', updated_at: minutes(1), final_response: 'localhost:3000 - healthy', events: []},\n      {id: 'demo-ci', project: 'saco-judge', source: 'GitHub Actions', title: 'CI pipeline', status: 'interrupted', updated_at: minutes(12), events: [{kind: 'warning', label: 'CI failed', at: minutes(12)}]},\n      {id: 'demo-prod', project: 'saco-judge', source: 'Deployment', title: 'Production deployment', status: 'completed', updated_at: minutes(22), final_response: 'Production healthy', events: []},\n    ],\n  };\n\n  function ago(value) {\n    const t = Number(value);\n    if (!Number.isFinite(t) || t <= 0) return '';\n    const elapsed = Math.max(0, Math.floor((Date.now() - t) / 1000));\n    if (elapsed < 60) return 'now';\n    if (elapsed < 3600) return Math.floor(elapsed / 60) + 'm ago';\n    if (elapsed < 86400) return Math.floor(elapsed / 3600) + 'h ago';\n    return Math.floor(elapsed / 86400) + 'd ago';\n  }\n  function online() {\n    return demo || state.devices.some(device => Date.now() - Number(device.last_seen_at) < 120000);\n  }\n  function status(item) {\n    if (item.status === 'working' && !online()) return 'quiet';\n    return item.status || 'unknown';\n  }\n  function statusLabel(item) {\n    const current = status(item);\n    if (current === 'interrupted') return /codex|claude|pi/i.test(item.source || '') ? 'Stopped' : 'Failed';\n    return ({completed:'Completed', working:'Running', failed:'Failed', quiet:'Idle', unknown:'Unknown'})[current] || 'Unknown';\n  }\n  function sourceLabel(item) {\n    const label = String(item.source || '').toLowerCase();\n    if (label.includes('claude')) return 'Claude';\n    if (label.includes('codex')) return 'Codex';\n    if (label === 'terminal') return 'Shell';\n    if (label === 'service') return 'Server';\n    if (label.includes('github')) return 'CI';\n    if (label.includes('deploy')) return 'Deploy';\n    return String(item.source || 'Task').slice(0, 10);\n  }\n  function statusStyle(item) {\n    const s = status(item);\n    if (s === 'completed') return 'ok';\n    if (s === 'failed' || s === 'interrupted') return 'fail';\n    if (s === 'working') return 'running';\n    return '';\n  }\n  function activityRow(item) {\n    const button = el('button', 'activity');\n    button.type = 'button';\n    button.setAttribute('aria-label', (item.title || 'Untitled') + ' - ' + statusLabel(item));\n    const label = el('span', 'activity-icon', sourceLabel(item));\n    const body = el('span', 'activity-copy');\n    body.append(el('span', 'activity-title', item.title || 'Untitled activity'));\n    body.append(el('div', 'activity-desc', (item.source || 'Custom') + ' \\u00b7 ' + ago(item.updated_at)));\n    const stateEl = el('span', 'activity-state ' + statusStyle(item), statusLabel(item));\n    button.append(label, body, stateEl);\n    button.addEventListener('click', () => details(item.id, button));\n    return button;\n  }\n  function matches(item) {\n    if (source && item.source !== source) return false;\n    return !query || [item.title, item.project, item.source].join(' ').toLowerCase().includes(query);\n  }\n  function visibleActivities() {\n    return state.threads.filter(item => {\n      const title = String(item.title || '').trim().toLowerCase();\n      const label = String(item.agent_label || '').trim().toLowerCase();\n      if ((item.source || '').toLowerCase() === 'codex' &&\n          (title === 'guardian review' || label === 'guardian')) return false;\n      return !item.parent_id || !state.threads.some(parent => parent.id === item.parent_id);\n    });\n  }\n  function grouped(items) {\n    const groups = new Map();\n    for (const item of items) {\n      const name = item.project && item.project !== 'Unknown project' ? item.project : 'Other activity';\n      if (!groups.has(name)) groups.set(name, []);\n      groups.get(name).push(item);\n    }\n    return [...groups].sort((a, b) => Math.max(...b[1].map(t => t.updated_at || 0)) - Math.max(...a[1].map(t => t.updated_at || 0)));\n  }\n  function setNotice(message) {\n    $('notice').textContent = message;\n    $('notice').hidden = !message;\n  }\n  function render() {\n    const live = online();\n    $('connection').textContent = demo ? 'Demo' : live ? 'Connected' : state.devices.length ? 'Offline' : 'Waiting';\n    $('status-dot').classList.toggle('off', !live);\n    const activities = visibleActivities();\n    $('running').textContent = activities.filter(t => status(t) === 'working').length;\n    $('completed').textContent = activities.filter(t => status(t) === 'completed').length;\n    $('attention').textContent = activities.filter(t => ['interrupted','failed'].includes(status(t))).length;\n    const select = $('source');\n    const names = [...new Set(activities.map(t => t.source).filter(Boolean))].sort();\n    if (select.dataset.key !== JSON.stringify(names)) {\n      select.replaceChildren(new Option('All sources', ''));\n      names.forEach(name => select.add(new Option(name, name)));\n      select.dataset.key = JSON.stringify(names);\n      select.value = names.includes(source) ? source : '';\n      source = select.value;\n    }\n    select.hidden = names.length < 2;\n    const matchesList = activities.filter(matches);\n    const container = $('projects');\n    container.replaceChildren();\n    $('heading').textContent = view === 'projects' ? 'Projects' : 'Activity';\n    if (!matchesList.length) {\n      container.append(el('div', 'empty', state.threads.length ? 'No matching activity.' : 'No activity yet. Start an agent or track a command.'));\n      return;\n    }\n    const groups = view === 'activity' ? [['Recent activity', [...matchesList].sort((a,b) => b.updated_at - a.updated_at)]] : grouped(matchesList);\n    for (const [name, items] of groups) {\n      const section = el('section', 'project');\n      const head = el('div', 'project-head');\n      const heading = el('div');\n      heading.append(el('div', 'project-name', name));\n      heading.append(el('div', 'project-secondary', items.length + (items.length === 1 ? ' activity' : ' activities')));\n      const attention = items.some(t => ['interrupted','failed'].includes(status(t)));\n      const active = items.some(t => status(t) === 'working');\n      const label = attention ? 'Needs attention' : active ? 'Active' : 'Idle';\n      const badge = el('span', 'pill ' + (attention ? 'attention' : active ? 'active' : ''), label);\n      head.append(heading, badge);\n      section.append(head);\n      for (const item of [...items].sort((a,b) => b.updated_at - a.updated_at)) section.append(activityRow(item));\n      container.append(section);\n    }\n  }\n\n  // Agent transcripts are untrusted text. Never evaluate returned content.\n  function appendRichInline(node, value) {\n    const segments=String(value||'').split(/(\\*\\*[^*\\n]+\\*\\*|\\x60[^\\x60\\n]+\\x60|https:\\/\\/[^\\s<>\"']+)/g);\n    for(const segment of segments) {\n      if(!segment) continue;\n      if(segment.startsWith('**') && segment.endsWith('**')) {\n        node.append(el('strong','',segment.slice(2,-2)));\n      } else if(segment.startsWith(String.fromCharCode(96)) && segment.endsWith(String.fromCharCode(96))) {\n        node.append(el('code','',segment.slice(1,-1)));\n      } else if(/^https:\\/\\/[^\\s<>\"']+$/.test(segment)) {\n        try {\n          const link=el('a','',segment);\n          link.href=new URL(segment).href;\n          link.rel='noopener noreferrer';\n          link.target='_blank';\n          node.append(link);\n        } catch(_) {node.append(document.createTextNode(segment));}\n      } else {\n        node.append(document.createTextNode(segment));\n      }\n    }\n  }\n  function appendConversationText(node, value) {\n    const chunks=String(value||'').split(/(\\x60{3}[^\\n]*\\n[\\s\\S]*?\\x60{3})/g);\n    for(const chunk of chunks) {\n      if(!chunk) continue;\n      if(chunk.startsWith(String.fromCharCode(96).repeat(3))) {\n        const match=/^\\x60{3}([^\\n]*)\\n([\\s\\S]*?)\\x60{3}$/.exec(chunk);\n        if(match) {\n          const pre=el('pre');\n          if(match[1].trim()) pre.append(el('span','conv-code-label',match[1].trim().slice(0,30)));\n          pre.append(el('code','',match[2]));\n          node.append(pre);\n          continue;\n        }\n      }\n      const span=el('div','conv-text');\n      appendRichInline(span,chunk);\n      node.append(span);\n    }\n  }\n  function appendConversation(container, item) {\n    const entries=Array.isArray(item.conversation) ? item.conversation : null;\n    if(!entries) return false;\n    const title=el('div','conversation-head');\n    title.append(el('div','result-title','Conversation'));\n    if(item.conversation_truncated) title.append(el('span','conversation-note','Recent messages'));\n    container.append(title);\n    const feed=el('section','conversation');\n    feed.setAttribute('aria-label','Conversation');\n    if(!entries.length) feed.append(el('p','conv-notice','No conversation messages recorded yet.'));\n    let tools=[];\n    const flushTools=()=>{\n      if(!tools.length) return;\n      const groupItems=tools;\n      tools=[];\n      const group=el('details','conv-tools');\n      const first=groupItems.find(tool=>tool.title && tool.title!=='Tool output')?.title||'Tool activity';\n      group.append(el('summary','',groupItems.length===1 ? first : first+' · '+(groupItems.length-1)+' more'));\n      const list=el('ol','conv-steps');\n      for(const tool of groupItems) {\n        const row=el('li');\n        row.append(el('div',tool.error?'conv-step-title conv-step-error':'conv-step-title',tool.title||'Tool'));\n        if(tool.detail) {\n          const pre=el('pre','',tool.detail);\n          pre.setAttribute('aria-label','Tool input');\n          row.append(pre);\n        }\n        if(tool.output) {\n          const pre=el('pre','',tool.output);\n          pre.setAttribute('aria-label','Tool output');\n          row.append(pre);\n        }\n        list.append(row);\n      }\n      group.append(list);\n      feed.append(group);\n    };\n    for(const entry of entries) {\n      if(!entry || typeof entry!=='object') continue;\n      if(entry.role==='tool') {tools.push(entry);continue;}\n      flushTools();\n      if(entry.role==='notice') {feed.append(el('div','conv-notice',entry.text||'Activity'));continue;}\n      if(!['user','assistant'].includes(entry.role)) continue;\n      const article=el('article','conv-message '+entry.role);\n      const byline=el('div','conv-byline');\n      const date=new Date(Number(entry.at||0));\n      const time=Number(entry.at)>0 && Number.isFinite(date.getTime())\n        ? date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}) : '';\n      byline.append(el('strong','',entry.role==='user'?'You':item.agent_label||item.source||'Assistant'),\n                    el('span','',time));\n      article.append(byline);\n      const body=el('div','conv-content');\n      appendConversationText(body,entry.text);\n      article.append(body);\n      feed.append(article);\n    }\n    flushTools();\n    container.append(feed);\n    return entries.length>0;\n  }\n\n  function details(id, focusNode = null) {\n    const item = state.threads.find(t => t.id === id);\n    if (!item) return;\n    if ($('overlay').hidden) lastFocus = focusNode || document.activeElement;\n    selected = id;\n    $('dialog-title').textContent = item.title || 'Activity';\n    $('dialog-meta').textContent = [item.project || 'Other', item.source || 'Custom', statusLabel(item), ago(item.updated_at)].join(' \\u00b7 ');\n    const content = $('detail-content');\n    content.replaceChildren();\n    const parent = state.threads.find(t => t.id === item.parent_id);\n    if (parent) {\n      const back = el('button','back-link','Back to '+(parent.agent_label || parent.title || 'parent task'));\n      back.type='button';\n      back.addEventListener('click',()=>details(parent.id));\n      content.append(back);\n    }\n    const hasConversation=appendConversation(content,item);\n    if (!hasConversation && item.final_response) {\n      content.append(el('div', 'result-title', 'Result'));\n      const result=el('div','output');\n      appendConversationText(result,item.final_response);\n      content.append(result);\n    }\n    content.append(el('div', 'result-title', 'Activity'));\n    const events = Array.isArray(item.events) ? item.events : [];\n    const list = el('ol', 'events');\n    for (const event of [...events].reverse()) {\n      const row = el('li');\n      row.append(el('span', '', event.label || event.kind || 'Event'));\n      row.append(el('time', '', ago(event.at)));\n      list.append(row);\n    }\n    if (!events.length) list.append(el('li', '', 'No events recorded.'));\n    content.append(list);\n    const children = state.threads.filter(child => child.parent_id === item.id &&\n      String(child.title || '').trim().toLowerCase() !== 'guardian review' &&\n      String(child.agent_label || '').trim().toLowerCase() !== 'guardian');\n    if (children.length) {\n      content.append(el('div','result-title','Subagents'));\n      for (const child of children) {\n        const row=el('button','subtask');\n        row.type='button';\n        row.append(el('span','',child.agent_label || child.title || 'Subagent'),\n                   el('small','',statusLabel(child)));\n        row.addEventListener('click',()=>details(child.id));\n        content.append(row);\n      }\n    }\n    $('overlay').hidden = false;\n    if (focusNode) $('close').focus();\n  }\n  function closeDetails() {\n    selected = null;\n    $('overlay').hidden = true;\n    if (lastFocus && lastFocus.isConnected) lastFocus.focus();\n    lastFocus = null;\n  }\n  async function refresh() {\n    if (refreshing) return;\n    refreshing = true;\n    try {\n      if (demo) state = demoState;\n      else {\n        const response = await fetch('/api/state', {credentials: 'same-origin', cache: 'no-store'});\n        if (response.status === 401) {\n          loggedIn = false;\n          $('app').hidden = true;\n          $('login').hidden = false;\n          if (!$('overlay').hidden) closeDetails();\n          return;\n        }\n        if (!response.ok) throw Error('Unable to update activity.');\n        state = await response.json();\n        if (!state || !Array.isArray(state.threads) || !Array.isArray(state.devices)) throw Error('Invalid server response.');\n        loggedIn = true;\n      }\n      $('app').hidden = false;\n      $('login').hidden = true;\n      setNotice('');\n      render();\n      if (selected) details(selected);\n    } catch (error) {\n      if (loggedIn) setNotice('Could not update activity. Showing the last received data.');\n      else { $('login').hidden = false; $('login-error').textContent = 'Could not connect. Try again.'; }\n    } finally { refreshing = false; }\n  }\n  $('login-form').addEventListener('submit', async event => {\n    event.preventDefault();\n    const button = $('login-button');\n    button.disabled = true;\n    $('login-error').textContent = '';\n    try {\n      const response = await fetch('/api/login', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({password: $('password').value})});\n      if (!response.ok) throw Error(response.status === 401 ? 'Incorrect password' : 'Could not sign in.');\n      $('password').value = '';\n      await refresh();\n    } catch (error) { $('login-error').textContent = error.message; }\n    finally {button.disabled = false;}\n  });\n  $('logout').addEventListener('click', async () => {\n    $('logout').disabled = true;\n    try {\n      const response = await fetch('/api/logout', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:'{}'});\n      if (!response.ok && response.status !== 401) throw Error('Could not sign out.');\n      loggedIn = false;\n      state = {threads:[],devices:[]};\n      $('app').hidden = true;\n      $('login').hidden = false;\n      if (!$('overlay').hidden) closeDetails();\n    } catch (error) {setNotice(error.message);}\n    finally {$('logout').disabled = false;}\n  });\n  $('refresh').addEventListener('click', refresh);\n  $('search').addEventListener('input', event => {query = event.target.value.toLowerCase(); render();});\n  $('source').addEventListener('change', event => {source = event.target.value; render();});\n  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {\n    view = button.dataset.tab;\n    document.querySelectorAll('[data-tab]').forEach(tab => {\n      tab.classList.toggle('active', tab === button);\n      tab.setAttribute('aria-pressed', String(tab === button));\n    });\n    render();\n  }));\n  $('close').addEventListener('click', closeDetails);\n  $('overlay').addEventListener('click', event => {if (event.target === $('overlay')) closeDetails();});\n  document.addEventListener('keydown', event => {\n    if ($('overlay').hidden) return;\n    if (event.key === 'Escape') {event.preventDefault(); closeDetails();}\n    if (event.key === 'Tab') {\n      const focusable = [...$('overlay').querySelectorAll('button:not(:disabled),a[href],input,select')].filter(node => !node.hidden);\n      if (focusable.length === 0) return;\n      const first = focusable[0], last = focusable[focusable.length - 1];\n      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}\n      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}\n    }\n  });\n  $('footnote').textContent = demo ? 'Illustrative demo' : '';\n  if (demo) {\n    $('logout').hidden = true;\n    $('app').hidden = false;\n  }\n  refresh();\n  setInterval(() => {if (!document.hidden && loggedIn) void refresh();}, 12000);\n})();\n</script>\n</body>\n</html>";
const SESSION_AGE_SECONDS = 12 * 60 * 60;
const ID = /^[A-Za-z0-9_-]{6,100}$/;
const statuses = new Set(['working', 'completed', 'quiet', 'interrupted', 'failed', 'unknown']);
const kinds = new Set(['start', 'complete', 'warning', 'tool', 'message', 'thought', 'info']);
const enc = new TextEncoder();
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, no-store, max-age=0',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function makeResponse(body, init = {}) {
  return new Response(body, {...init, headers: {...headers, ...(init.headers || {})}});
}
function json(obj, status = 200, moreHeaders = {}) {
  return makeResponse(JSON.stringify(obj), {status, headers: {'Content-Type': 'application/json; charset=utf-8', ...moreHeaders}});
}
function fail(message, status = 400, extra = {}) {
  return json({error: message}, status, extra);
}
function clean(input, max = 300) {
  return typeof input === 'string' ? input.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max) : '';
}
function cleanBody(input, max = 3500) {
  return typeof input === 'string'
    ? input.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, max)
    : '';
}
function number(input, fallback = 0) {
  return typeof input === 'number' && Number.isFinite(input) ? Math.floor(input) : fallback;
}
function hex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function bytesHex(str) {
  if (!/^[0-9a-f]+$/.test(str) || str.length % 2 !== 0) return null;
  return Uint8Array.from(str.match(/../g), h => parseInt(h, 16));
}
async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function equalSecret(a, b) {
  return safeEqual(await sha256(a || ''), await sha256(b || ''));
}
async function sign(key, value) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(value))));
}
function parseCookies(cookieHeader) {
  const pairs = (cookieHeader || '').split(';');
  const cookies = {};
  for (const pair of pairs) {
    const i = pair.indexOf('=');
    if (i !== -1) cookies[pair.slice(0,i).trim()] = pair.slice(i+1).trim();
  }
  return cookies;
}
async function authorized(request, env) {
  const value = parseCookies(request.headers.get('cookie')).observer_session;
  if (!value || typeof env.SESSION_KEY !== 'string') return false;
  const fields = value.split('.');
  if (fields.length !== 4 || fields[0] !== 'v1' || !/^\d{10,13}$/.test(fields[1]) || !/^[0-9a-f]{32}$/.test(fields[2]) || !/^[0-9a-f]{64}$/.test(fields[3])) return false;
  const expires = Number(fields[1]);
  if (expires < Date.now() || expires > Date.now() + SESSION_AGE_SECONDS * 1000 + 60_000) return false;
  const body = fields.slice(0, 3).join('.');
  const expected = await sign(env.SESSION_KEY, body);
  return safeEqual(bytesHex(fields[3]), bytesHex(expected));
}
async function sessionCookie(env) {
  const exp = Date.now() + SESSION_AGE_SECONDS * 1000;
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const body = 'v1.' + exp + '.' + nonce;
  const signature = await sign(env.SESSION_KEY, body);
  return 'observer_session=' + body + '.' + signature + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=' + SESSION_AGE_SECONDS;
}
function csrfOK(request) {
  const origin = request.headers.get('Origin');
  // Origin is mandatory for cookie-authenticated writes. Agent uses Bearer auth.
  return !!origin && origin === new URL(request.url).origin;
}
async function limitedJSON(request, limit = 900_000) {
  const cl = request.headers.get('content-length');
  if (cl && Number(cl) > limit) throw new Error('Payload too large');
  const reader = request.body && request.body.getReader();
  if (!reader) throw new Error('Missing request body');
  const parts = [];
  let length = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel().catch(() => {});
      throw new Error('Payload too large');
    }
    parts.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {result.set(part, offset);offset += part.length;}
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(result));
}
async function fingerprint(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return sign(env.SESSION_KEY, 'login:' + ip);
}
async function tooManyAttempts(env, fp, now) {
  const result = await env.DB.prepare('SELECT attempts, reset_at FROM login_attempts WHERE fingerprint=?').bind(fp).first();
  return !!result && result.reset_at > now && result.attempts >= 7;
}
async function recordFailure(env, fp, now) {
  await env.DB.prepare(`INSERT INTO login_attempts (fingerprint, attempts, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(fingerprint) DO UPDATE SET
    attempts=CASE WHEN reset_at < ? THEN 1 ELSE attempts + 1 END,
    reset_at=CASE WHEN reset_at < ? THEN ? ELSE reset_at END`)
    .bind(fp, now + 15 * 60_000, now, now, now + 15 * 60_000).run();
}
async function login(request, env) {
  if (!csrfOK(request)) return fail('Invalid request origin', 403);
  const now = Date.now();
  const fp = await fingerprint(request, env);
  if (await tooManyAttempts(env, fp, now)) return fail('Too many attempts. Try again later.', 429);
  let body;
  try {body = await limitedJSON(request, 2_000);} catch(e) {return fail('Invalid login request');}
  const candidate = typeof body.password === 'string' ? body.password : '';
  if (!candidate || candidate.length > 512 || !(await equalSecret(candidate, env.VIEW_PASSWORD))) {
    await recordFailure(env, fp, now);
    return fail('Incorrect password', 401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE fingerprint=?').bind(fp).run();
  return json({ok:true}, 200, {'Set-Cookie': await sessionCookie(env)});
}
async function agentAuthorized(request, env) {
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ') || typeof env.AGENT_TOKEN !== 'string') return false;
  return equalSecret(h.slice(7), env.AGENT_TOKEN);
}
// Legacy agents can still send internal reviews. Unlike user-facing review
// subagents, Codex Guardian sessions are infrastructure, not coding tasks.
function isGuardianReview(input) {
  if (!input || String(input.source || 'Codex').toLowerCase() !== 'codex') return false;
  return String(input.title || '').trim().toLowerCase() === 'guardian review'
    || String(input.agent_label || '').trim().toLowerCase() === 'guardian';
}
const conversationRoles = new Set(['user', 'assistant', 'tool', 'notice']);
function validateConversation(items, updated) {
  if (!Array.isArray(items)) return undefined;
  if (items.length > 50) return null;
  let budget = 0;
  const safe = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || !conversationRoles.has(raw.role)) return null;
    let at = number(raw.at, updated);
    if (at < 946684800000 || at > Date.now() + 300_000) at = updated;
    const item = {role: raw.role, at};
    if (raw.role === 'tool') {
      item.title = clean(raw.title, 150) || 'Tool';
      item.detail = cleanBody(raw.detail, 1200);
      item.output = cleanBody(raw.output, 1900);
      item.error = raw.error === true;
    } else {
      item.text = cleanBody(raw.text, raw.role === 'assistant' ? 3600 : 2600);
    }
    budget += (item.text || '').length + (item.title || '').length +
      (item.detail || '').length + (item.output || '').length + 80;
    if (budget > 17000) return null;
    safe.push(item);
  }
  return safe;
}
function validateThread(input, now) {
  if (!input || typeof input !== 'object' || !ID.test(input.id || '')) return null;
  const status = statuses.has(input.status) ? input.status : 'unknown';
  let updated = number(input.updated_at, now);
  if (updated > now + 300_000) updated = now;
  if (updated < 946684800000) updated = now; // Year 2000 minimum.
  const conversation = validateConversation(input.conversation, updated);
  if (conversation === null) return null;
  const events = Array.isArray(input.events) ? input.events.slice(-24).map(e => {
    const at = number(e && e.at, updated);
    return {
      at: at >= 946684800000 && at <= now + 300_000 ? at : updated,
      kind: e && kinds.has(e.kind) ? e.kind : 'info',
      label: clean(e && e.label, 140),
    };
  }) : [];
  return {
    id: input.id,
    title: clean(input.title, 110) || 'Untitled activity',
    project: clean(input.project, 80) || 'Unknown project',
    source: clean(input.source, 40) || 'Codex',
    type: clean(input.type, 32) || 'activity',
    parent_id: ID.test(input.parent_id || '') && input.parent_id !== input.id ? input.parent_id : '',
    agent_label: clean(input.agent_label, 65),
    status,
    updated_at: updated,
    started_at: number(input.started_at, updated),
    events,
    final_response: cleanBody(input.final_response, 6000),
    ...(conversation === undefined ? {} : {conversation,
      conversation_truncated: input.conversation_truncated === true,
      summary: cleanBody(input.summary, 160).replace(/\s+/g, ' ')}),
  };
}
async function sync(request, env) {
  let data;
  try {data = await limitedJSON(request);} catch(e) {return fail('Invalid or oversized sync payload', 400);}
  if (!data || data.protocol !== 1 || !ID.test(data.device_id || '') || !Array.isArray(data.threads) || data.threads.length > 30) return fail('Invalid sync envelope');
  const now = Date.now();
  const seen = new Set();
  const threads = [];
  for (const raw of data.threads) {
    const t = validateThread(raw, now);
    if (!t || seen.has(t.id)) return fail('Invalid or duplicate thread');
    seen.add(t.id);
    if (!isGuardianReview(t)) threads.push(t);
  }
  // D1 writes are the only mutations; never command or control the Mac agent.
  await env.DB.prepare('INSERT INTO devices (id,last_seen_at,thread_count) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at,thread_count=excluded.thread_count')
    .bind(data.device_id, now, threads.length).run();
  for (const t of threads) {
    await env.DB.prepare(`INSERT INTO threads (id,device_id,title,project,status,updated_at,received_at,snapshot)
      VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET device_id=excluded.device_id,title=excluded.title,
      project=excluded.project,status=excluded.status,updated_at=excluded.updated_at,
      received_at=excluded.received_at,snapshot=excluded.snapshot`)
      .bind(t.id, data.device_id, t.title, t.project, t.status, t.updated_at, now, JSON.stringify(t)).run();
  }
  return json({ok:true, accepted:threads.length});
}
async function uploadPreview(request, env) {
  let data;
  try {data = await limitedJSON(request, 850_000);} catch(e) {return fail('Invalid or oversized preview');}
  if (!data || !ID.test(data.thread_id || '') || !/^[\w.-]{1,120}$/.test(data.filename || '')) return fail('Invalid preview');
  if (!['image/png','image/jpeg','image/webp'].includes(data.mime)) return fail('Unsupported preview format');
  if (typeof data.data !== 'string' || data.data.length > 710_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.data)) return fail('Invalid preview data');
  let binary;
  try {binary = atob(data.data);} catch(e) {return fail('Invalid base64');}
  if (!binary || binary.length > 512 * 1024) return fail('Preview exceeds 512 KiB');
  const valid = (data.mime==='image/png' && binary.startsWith('\x89PNG\r\n\x1a\n')) ||
    (data.mime==='image/jpeg' && binary.startsWith('\xff\xd8\xff')) ||
    (data.mime==='image/webp' && binary.startsWith('RIFF') && binary.slice(8,12)==='WEBP');
  if (!valid) return fail('Preview signature mismatch');
  const existing = await env.DB.prepare('SELECT id FROM threads WHERE id=?').bind(data.thread_id).first();
  if (!existing) return fail('Sync thread before preview upload');
  await env.DB.prepare(`INSERT INTO previews(thread_id,filename,mime,image_b64,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(thread_id) DO UPDATE SET
    filename=excluded.filename,mime=excluded.mime,image_b64=excluded.image_b64,updated_at=excluded.updated_at`)
    .bind(data.thread_id, clean(data.filename,120), data.mime, data.data, Date.now()).run();
  return json({ok:true});
}
async function state(env) {
  const [threadRows, deviceRows] = await Promise.all([
    env.DB.prepare(`SELECT t.snapshot, CASE WHEN p.thread_id IS NULL THEN 0 ELSE 1 END AS has_preview,
      p.updated_at AS preview_updated_at
      FROM threads t LEFT JOIN previews p ON p.thread_id=t.id
      WHERE NOT (
        LOWER(COALESCE(json_extract(t.snapshot, '$.source'), 'Codex')) = 'codex'
        AND (
          LOWER(TRIM(t.title)) = 'guardian review'
          OR LOWER(COALESCE(json_extract(t.snapshot, '$.agent_label'), '')) = 'guardian'
        )
      )
      ORDER BY t.updated_at DESC LIMIT 40`).all(),
    env.DB.prepare('SELECT id,last_seen_at,thread_count FROM devices ORDER BY last_seen_at DESC LIMIT 5').all(),
  ]);
  const threads = (threadRows.results || []).map(r => ({
    ...JSON.parse(r.snapshot),
    has_preview: !!r.has_preview,
    preview_updated_at: r.preview_updated_at || 0,
  }));
  return json({threads,devices:deviceRows.results||[],server_now:Date.now()});
}
async function preview(request, env) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !ID.test(id)) return fail('Invalid thread ID');
  const row = await env.DB.prepare('SELECT mime,image_b64 FROM previews WHERE thread_id=?').bind(id).first();
  if (!row || !['image/png','image/jpeg','image/webp'].includes(row.mime)) return fail('Preview not found',404);
  let image;
  try {image=Uint8Array.from(atob(row.image_b64),c=>c.charCodeAt(0));} catch(e) {return fail('Invalid image',500);}
  return makeResponse(image,{headers:{'Content-Type':row.mime,'Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
async function page() {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(12)));
  const csp = "default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'";
  return makeResponse(HTML.replaceAll('__NONCE__',nonce),{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':csp}});
}
async function pruneExpired(env) {
  const configured = Number(env.RETENTION_DAYS);
  const days = Number.isFinite(configured) && configured >= 1 && configured <= 365 ? Math.floor(configured) : 30;
  const cutoff = Date.now() - days * 86_400_000;
  await env.DB.prepare('DELETE FROM previews WHERE thread_id IN (SELECT id FROM threads WHERE received_at < ?)').bind(cutoff).run();
  await env.DB.prepare('DELETE FROM threads WHERE received_at < ?').bind(cutoff).run();
  await env.DB.prepare('DELETE FROM login_attempts WHERE reset_at < ?').bind(Date.now() - 86_400_000).run();
}
export default {
  async scheduled(_event,env,_ctx) {
    await pruneExpired(env);
  },
  async fetch(request,env) {
    const path = new URL(request.url).pathname;
    if (!env.DB || !env.AGENT_TOKEN || !env.VIEW_PASSWORD || !env.SESSION_KEY) return fail('Server is missing its required configuration',503);
    try {
      if (path==='/' && request.method==='GET') return await page();
      if (path==='/api/agent/sync' && request.method==='POST') {
        if (!(await agentAuthorized(request,env))) return fail('Unauthorized',401);
        return await sync(request,env);
      }
      if (path==='/api/agent/preview' && request.method==='POST') {
        if (!(await agentAuthorized(request,env))) return fail('Unauthorized',401);
        return await uploadPreview(request,env);
      }
      if (path==='/api/login' && request.method==='POST') return await login(request,env);
      if (path.startsWith('/api/')) {
        if (!(await authorized(request,env))) return fail('Unauthorized',401);
        if (path==='/api/state' && request.method==='GET') return await state(env);
        if (path==='/api/preview' && request.method==='GET') return await preview(request,env);
        if (path==='/api/logout' && request.method==='POST') {
          if (!csrfOK(request)) return fail('Invalid request origin',403);
          return json({ok:true},200,{'Set-Cookie':'observer_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
        }
        return fail('Not found',404);
      }
      return fail('Not found',404);
    } catch (error) {
      const detail = typeof error?.message === 'string' ? error.message.slice(0, 300) : '';
      if (/no such table\s*:/i.test(detail)) {
        console.error('Observer D1 schema missing; initialize the database bound as DB using schema.sql.');
        return fail('Database setup incomplete. Run schema.sql in the D1 database bound as DB.', 503);
      }
      // Keep details in private Worker logs, never in the HTTP response.
      console.error('Observer request failed:', request.method, path, error?.name || 'unknown', detail);
      return fail('Internal server error', 500);
    }
  },
};
