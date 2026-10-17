/**
 * Observer - Cloudflare Worker (no runtime packages).
 * Build worker.js with: python3 build_worker.py
 * Cloudflare bindings: D1 database named DB; secrets AGENT_TOKEN,
 * VIEW_PASSWORD, SESSION_KEY. No commands, task creation, or filesystem writes.
 */
const HTML = "<!doctype html>\n<html lang=\"en\" data-demo=\"false\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#fafaf8\">\n<meta name=\"color-scheme\" content=\"light\">\n<meta name=\"description\" content=\"Private activity monitor\">\n<title>Observer</title>\n<style nonce=\"__NONCE__\">\n:root{--bg:#fafaf8;--ink:#252724;--muted:#777b75;--line:#e6e8e3;--hover:#f3f4f0;--selected:#eff1ed;--green:#39775a;--red:#9f5a51;--sans:\"SF Pro Display\",\"Helvetica Neue\",-apple-system,BlinkMacSystemFont,Arial,sans-serif;--serif:Georgia,\"Times New Roman\",serif}\n*,*::before,*::after{box-sizing:border-box}\nhtml{background:var(--bg);-webkit-text-size-adjust:100%}\nbody{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font:14px/1.55 var(--sans);-webkit-font-smoothing:antialiased}\nbutton,input{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.5}\nbutton:focus-visible,input:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--green);outline-offset:3px}\nbutton:active:not(:disabled){transform:translateY(1px)}\na{color:inherit;text-underline-offset:3px}a:hover{color:var(--green)}\n[hidden]{display:none!important}::selection{background:#e3ece3}\n.shell{max-width:1136px;padding:0 clamp(22px,4.5vw,54px) 45px;margin:auto}\n.topbar{height:70px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:16px}\n.brand{font-size:19px;font-weight:700;letter-spacing:-.072em}.brand span{color:var(--green)}\n.top-actions{display:flex;align-items:center;gap:22px}\n.connection{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;font-size:12px;color:var(--muted)}\n.signal{height:7px;width:7px;border-radius:50%;background:var(--green);flex-shrink:0}.signal.off{background:#b2a8a3}\n.action{border:0;background:none;color:var(--muted);font-size:12px;padding:8px 0;min-height:40px}\n.action:hover{color:var(--ink)}.action svg{height:15px;width:15px;display:block}\n.main-head{padding:45px 0 29px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:20px}\n.main-head h1{font:400 43px/1 var(--serif);letter-spacing:-.055em;margin:0}\n\n.workspace{display:grid;grid-template-columns:minmax(0,.89fr) minmax(0,1.11fr);min-height:520px}\n.list-panel{min-width:0;border-right:1px solid var(--line);padding:25px 28px 32px 0}\n.search{height:42px;display:flex;align-items:center;border-bottom:1px solid var(--line);padding:0 2px;background:transparent}\n.search:focus-within{border-color:#819c87}\n.search input{border:0;outline:0;background:none;min-width:0;width:100%;font-size:13px;color:var(--ink)}.search input::placeholder{color:#9a9f99}\n .source-select{min-width:0;max-width:145px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--muted);height:37px;font-size:12px;outline-offset:2px}\n .controls{display:flex;gap:12px;align-items:center}\n .controls .search{flex:1;min-width:0}\n.filters{display:flex;gap:24px;padding:9px 0 0;border-bottom:1px solid var(--line)}\n.filter{position:relative;color:var(--muted);border:0;background:none;font-size:12px;padding:10px 0 13px;min-height:43px}\n.filter:hover,.filter.active{color:var(--ink)}.filter.active{font-weight:650}.filter.active::after{content:\"\";position:absolute;bottom:-1px;left:0;right:0;height:2px;background:var(--ink)}\n.thread{position:relative;display:block;text-align:left;width:100%;background:none;border:0;border-bottom:1px solid var(--line);padding:19px 12px 17px;color:var(--ink);transition:background .18s}\n.thread:hover{background:var(--hover)}.thread.selected{background:var(--selected)}.thread.selected:before{content:\"\";position:absolute;left:0;top:16px;bottom:16px;width:2px;background:var(--green)}\n.thread-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}\n.thread-title{font-weight:630;font-size:14px;letter-spacing:-.02em;line-height:1.4;overflow-wrap:anywhere}\n.thread-snippet{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;color:var(--muted);font-size:12px;line-height:1.55;margin-top:7px;max-width:98%}\n.thread-meta{display:flex;gap:8px;align-items:center;min-width:0;font-size:12px;color:var(--muted);margin-top:9px}\n.project{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:64%}\n.status{font-size:11px;font-weight:550;color:var(--muted);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}\n.status:before{content:\"\";background:#aeb2ac;width:6px;height:6px;border-radius:50%;flex-shrink:0}\n.status.working{color:var(--green)}.status.working:before{background:var(--green)}.status.interrupted{color:var(--red)}.status.interrupted:before{background:var(--red)}\n.detail{min-width:0;padding:28px 0 46px 35px}\n.detail-header{padding:0 0 26px;border-bottom:1px solid var(--line)}\n.detail-title{font:400 clamp(23px,2.6vw,30px)/1.18 var(--serif);letter-spacing:-.04em;overflow-wrap:anywhere;margin:0 0 15px}\n.detail-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--muted)}\n.section{padding:27px 0;border-bottom:1px solid var(--line)}\n.section h3{font-size:13px;letter-spacing:-.01em;font-weight:650;margin:0 0 17px}\n.response{white-space:pre-wrap;overflow-wrap:anywhere;max-height:560px;overflow:auto;font-size:13px;line-height:1.85;color:#454943}\n.response a{color:#2a6b4b}.muted{color:var(--muted)}\n.conversation-section{padding-top:26px}\n.conversation-header{display:flex;justify-content:space-between;align-items:baseline;gap:16px}\n.conversation-note{font-size:11px;color:var(--muted)}\n.conversation-feed{display:flex;flex-direction:column;gap:20px}\n.conv-message{max-width:100%;min-width:0}\n.conv-message.user{background:#eef0ec;border:1px solid #e6e9e3;border-radius:11px;padding:15px 17px;margin-left:clamp(8px,8%,48px)}\n.conv-message.assistant{padding:0 2px}\n.conv-byline{display:flex;align-items:baseline;justify-content:space-between;gap:12px;color:var(--muted);font-size:11px;margin-bottom:7px}\n.conv-byline strong{font-weight:650;color:var(--ink)}\n.conv-content{color:#383c37;overflow-wrap:anywhere;font-size:13px;line-height:1.8}\n.conv-text{white-space:pre-wrap}\n.conv-text code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:#edf0eb;border-radius:3px;padding:1px 3px}\n.parent-link{display:inline-flex;align-items:center;margin:14px 0 0;padding:0;border:0;background:none;color:var(--green);font-size:12px}\n.conv-content pre,.conv-steps pre{margin:10px 0 12px;padding:12px 13px;border-radius:6px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f2ef;color:#303a34;font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}\n.conv-code-label{display:block;font-size:10px;letter-spacing:.04em;color:var(--muted);margin-bottom:6px}\n.conv-tools{border:1px solid var(--line);border-radius:7px;background:#f7f8f5}\n.conv-tools summary{list-style:none;cursor:pointer;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:14px;font-size:12px;color:var(--muted)}\n.conv-tools summary::-webkit-details-marker{display:none}\n.conv-tools summary:after{content:\"Show\";color:var(--green);font-size:11px}\n.conv-tools[open] summary:after{content:\"Hide\"}\n.conv-steps{list-style:none;margin:0;padding:0 14px 8px}\n.conv-steps li{padding:10px 0 12px;border-top:1px solid var(--line)}\n.conv-step-title{font-size:12px;font-weight:550;overflow-wrap:anywhere;color:var(--ink)}\n.conv-steps pre{margin:9px 0 0;max-height:280px}\n.conv-step-error{color:var(--red)}\n.conv-notice{font-size:11px;text-align:center;color:var(--muted);border-top:1px solid var(--line);padding-top:12px}\n\n.last-event{font-size:13px;line-height:1.65;color:var(--muted)}\n.last-event strong{color:var(--ink);font-weight:550}\n.preview{display:block;max-width:100%;width:auto;max-height:440px;object-fit:contain;border:1px solid var(--line);border-radius:5px;background:#fff}\n.preview-link{font-size:12px;color:var(--green);text-decoration:none}.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}\n.agents{padding:22px 0;border-bottom:1px solid var(--line)}.agents h3{font-size:13px;margin:0 0 12px}.agent-item{display:flex;width:100%;justify-content:space-between;gap:10px;padding:11px 0;text-align:left;background:none;border:0;border-top:1px solid var(--line);color:var(--ink)}.agent-item small{display:block;color:var(--muted)}.agent-item .status{align-self:center}\n.disclosure{border-bottom:1px solid var(--line)}\n.disclosure summary{padding:22px 0;list-style:none;display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:13px;font-weight:650}\n.disclosure summary::-webkit-details-marker{display:none}.disclosure summary span{font-size:12px;font-weight:450;color:var(--muted)}\n.timeline{margin:0;padding:0 0 16px;list-style:none}\n.timeline li{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-top:1px solid var(--line);color:var(--muted);font-size:12px}\n.timeline li:first-child{border-top:0}.timeline .event-label{overflow-wrap:anywhere}.timeline time{flex:none;color:#9ca19a;font-size:11px}\n.advanced{display:flex;justify-content:flex-end;padding:11px 0 6px}\n.copy-id{padding:7px 0;border:0;background:none;color:var(--muted);font-size:11px}.copy-id:hover{color:var(--ink)}\n.empty{padding:50px 8px;font-size:13px;color:var(--muted)}.detail-empty{padding:90px 15px;text-align:center;color:var(--muted);font-size:13px}\n.mobile-back{display:none}.notice{margin:16px 0 0;font-size:12px;color:#9a6b37}\n.auth-screen{display:none;min-height:100vh;align-items:center;justify-content:center;padding:35px 22px}.auth-screen.show{display:flex}\n.auth-card{width:100%;max-width:340px}.auth-card .brand{margin-bottom:54px;display:block}\n.auth-card h1{font:400 37px/1.08 var(--serif);letter-spacing:-.05em;margin:0 0 29px}\n.field-label{font-size:12px;font-weight:600;display:block;margin-bottom:8px}\n.password{width:100%;height:46px;background:#fff;border:1px solid #d9ded7;border-radius:5px;padding:0 12px;outline:0}\n.password:focus{border-color:var(--green)}.primary{width:100%;margin-top:14px;height:46px;border:0;background:var(--ink);border-radius:5px;color:white;font-size:13px;font-weight:600}.primary:hover{background:#424841}\n.auth-error{min-height:17px;color:var(--red);font-size:12px;margin-top:12px}\n.skip{position:absolute;left:-9999px;top:0}.skip:focus{left:12px;top:12px;padding:9px;background:white;z-index:10}\n@media(max-width:760px){\n  .shell{padding:0 23px 32px}.topbar{height:64px}.top-actions{gap:16px}\n  .main-head{padding:38px 0 27px}.main-head h1{font-size:40px}\n  .workspace{display:block}.list-panel{border-right:0;padding:23px 0 20px}\n  .detail{border-top:0;padding:25px 0 40px}.mobile-back{display:block;background:none;border:0;color:var(--green);font-size:13px;font-weight:600;padding:0 0 24px}\n  body:not(.detail-open) .detail{display:none}body.detail-open .main-head,body.detail-open .list-panel{display:none}\n  body.detail-open .detail{padding-top:29px}\n  .thread{padding:19px 9px}.thread.selected{background:none}.thread.selected:before{display:none}\n  .detail-title{font-size:29px}.section{padding:25px 0}\n}\n@media(max-width:400px){.connection{font-size:11px}.top-actions{gap:13px}.action{font-size:11px}.main-head h1{font-size:38px}}\n@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;scroll-behavior:auto!important;animation:none!important}}\n</style>\n</head>\n<body>\n<a class=\"skip\" href=\"#main\">Skip to threads</a>\n<div class=\"auth-screen show\" id=\"auth-screen\">\n  <div class=\"auth-card\">\n    <div class=\"brand\">observer<span>.</span></div>\n    <h1>Sign in</h1>\n    <form id=\"auth-form\">\n      <label class=\"field-label\" for=\"password\">Password</label>\n      <input class=\"password\" id=\"password\" type=\"password\" autocomplete=\"current-password\" required>\n      <button class=\"primary\" id=\"login-button\" type=\"submit\">Continue</button>\n      <div class=\"auth-error\" id=\"auth-error\" role=\"alert\"></div>\n    </form>\n  </div>\n</div>\n<div class=\"shell\" id=\"app-shell\" hidden>\n  <header class=\"topbar\">\n    <div class=\"brand\">observer<span>.</span></div>\n    <div class=\"top-actions\">\n      <div class=\"connection\" role=\"status\"><span class=\"signal\" id=\"connection-dot\"></span><span id=\"connection-text\">Connecting</span></div>\n      <button class=\"action\" id=\"refresh\" aria-label=\"Refresh\" title=\"Refresh\"><svg aria-hidden=\"true\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\"><path d=\"M20 11a8 8 0 1 0-2 6M20 4v7h-7\"/></svg></button>\n      <button class=\"action\" id=\"logout\">Sign out</button>\n    </div>\n  </header>\n  <main id=\"main\">\n    <div class=\"main-head\"><h1>Threads</h1></div>\n    <p id=\"error-notice\" class=\"notice\" role=\"status\" hidden></p>\n    <div class=\"workspace\">\n      <section class=\"list-panel\" aria-label=\"Threads\">\n        <div class=\"controls\"><label class=\"search\"><input type=\"search\" id=\"search\" aria-label=\"Search threads\" placeholder=\"Search threads\"></label><select id=\"source-filter\" class=\"source-select\" aria-label=\"Filter by source\"><option value=\"all\">All sources</option></select></div>\n        <div class=\"filters\" role=\"group\" aria-label=\"Filter threads\"><button class=\"filter active\" type=\"button\" data-filter=\"all\" aria-pressed=\"true\">All</button><button class=\"filter\" type=\"button\" data-filter=\"working\" aria-pressed=\"false\">Running</button><button class=\"filter\" type=\"button\" data-filter=\"completed\" aria-pressed=\"false\">Done</button></div>\n        <div id=\"session-list\"></div>\n      </section>\n      <section class=\"detail\" id=\"detail\" aria-label=\"Thread details\"></section>\n    </div>\n  </main>\n</div>\n<script nonce=\"__NONCE__\">\n(function () {\n  'use strict';\n\n  const demo = document.documentElement.dataset.demo === 'true';\n  const sampleTime = Date.now();\n  const $ = id => document.getElementById(id);\n  const mobile = () => matchMedia('(max-width: 760px)').matches;\n  const element = (tag, className = '', value) => {\n    const node = document.createElement(tag);\n    if (className) node.className = className;\n    if (value !== undefined) node.textContent = value;\n    return node;\n  };\n\n  let state = {threads: [], devices: []};\n  let selected = null;\n  let filter = 'all';\n  let term = '';\n  let selectedSource = 'all';\n  let listKey = '';\n  let initialized = false;\n  let loggedIn = false;\n  let refreshing = false;\n  let queuedRefresh = false;\n  let authEpoch = 0;\n  let listPosition = 0;\n\n  function ago(value) {\n    const timestamp = Number(value);\n    if (!Number.isFinite(timestamp) || timestamp <= 0) return '';\n    const elapsed = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));\n    if (elapsed < 60) return 'now';\n    if (elapsed < 3600) return Math.floor(elapsed / 60) + 'm ago';\n    if (elapsed < 86400) return Math.floor(elapsed / 3600) + 'h ago';\n    return Math.floor(elapsed / 86400) + 'd ago';\n  }\n\n  function when(timestamp) {\n    const node = element('time');\n    node.dataset.ms = String(timestamp || 0);\n    updateTime(node);\n    return node;\n  }\n\n  function updateTime(node) {\n    const timestamp = Number(node.dataset.ms);\n    node.textContent = ago(timestamp) || '-';\n    const date = new Date(timestamp);\n    if (timestamp > 0 && Number.isFinite(date.getTime())) node.dateTime = date.toISOString();\n    else node.removeAttribute('datetime');\n  }\n\n  function refreshRelativeTimes() {\n    document.querySelectorAll('time[data-ms]').forEach(updateTime);\n  }\n\n  function clockTime(timestamp) {\n    const date = new Date(Number(timestamp));\n    return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : '';\n  }\n\n  function online() {\n    return demo || state.devices.some(device => {\n      const updated = Number(device.last_seen_at);\n      return Number.isFinite(updated) && Date.now() - updated < 120000;\n    });\n  }\n\n  function statusOf(thread) {\n    if (thread.status === 'working' && !demo && (!online() || Date.now() - thread.updated_at > 180000)) return 'quiet';\n    return thread.status || 'unknown';\n  }\n\n  function statusName(status) {\n    return ({working: 'Running', completed: 'Done', quiet: 'Idle', interrupted: 'Stopped', unknown: 'Unknown'})[status] || 'Unknown';\n  }\n\n  function setStatus(node, status) {\n    node.classList.remove('working', 'completed', 'quiet', 'interrupted', 'unknown');\n    node.classList.add('status', status);\n    node.textContent = statusName(status);\n  }\n\n  // Protect against older Workers that still return cached Guardian rows.\n  function isGuardianReview(thread) {\n    return String(thread.source || 'Codex').toLowerCase() === 'codex'\n      && (String(thread.title || '').trim().toLowerCase() === 'guardian review'\n        || String(thread.agent_label || '').trim().toLowerCase() === 'guardian');\n  }\n\n  function filteredThreads() {\n    return state.threads.filter(thread => {\n      if (isGuardianReview(thread)) return false;\n      if (thread.parent_id && state.threads.some(t => t.id === thread.parent_id)) return false;\n      const matchesStatus = filter === 'all' || statusOf(thread) === filter;\n      const matchesSource = selectedSource === 'all' || (thread.source || 'Codex') === selectedSource;\n      return matchesStatus && matchesSource && (String(thread.title || '') + ' ' + String(thread.project || '') + ' ' + String(thread.source || '')).toLowerCase().includes(term);\n    });\n  }\n\n  function humanEvent(event) {\n    const label = String(event.label || '');\n    if (event.kind === 'complete') return 'Finished';\n    if (event.kind === 'start') return 'Started';\n    if (event.kind === 'warning') return /approval/i.test(label) ? 'Approval needed' : 'Interrupted';\n    if (event.kind === 'thought') return 'Thinking';\n    if (event.kind === 'message') return 'Responded';\n    if (event.kind === 'tool') {\n      const tool = label.replace(/^Tool:\\s*/i, '').toLowerCase();\n      if (/apply_patch|edit_file|write_file/.test(tool)) return 'Editing files';\n      if (/shell_command|exec_command|terminal|command/.test(tool)) return 'Running command';\n      if (/read_file|search|grep|list/.test(tool)) return 'Reading files';\n      return tool ? 'Using ' + tool : 'Using tool';\n    }\n    return label || 'Activity';\n  }\n\n  function appendLinks(node, text) {\n    const pattern = /\\[([^\\]\\n]{1,100})\\]\\((https:\\/\\/[^\\s<>)]+)\\)|(https:\\/\\/[^\\s<>\"']+)/g;\n    let last = 0;\n    let match;\n    while ((match = pattern.exec(text))) {\n      node.append(document.createTextNode(text.slice(last, match.index)));\n      const markdownLink = Boolean(match[2]);\n      const raw = markdownLink ? match[2] : match[3];\n      const url = markdownLink ? raw : raw.replace(/[.,;:)\\]]+$/, '');\n      try {\n        const safe = new URL(url);\n        if (safe.protocol === 'https:') {\n          const anchor = element('a', '', markdownLink ? match[1] : url);\n          anchor.href = safe.href;\n          anchor.target = '_blank';\n          anchor.rel = 'noopener noreferrer';\n          node.append(anchor);\n        } else node.append(document.createTextNode(markdownLink ? match[0] : url));\n      } catch (_) {\n        node.append(document.createTextNode(markdownLink ? match[0] : url));\n      }\n      last = match.index + (markdownLink ? match[0].length : url.length);\n      pattern.lastIndex = last;\n    }\n    node.append(document.createTextNode(text.slice(last)));\n  }\n\n  function showAuth(isLoggedIn) {\n    loggedIn = isLoggedIn;\n    $('auth-screen').classList.toggle('show', !isLoggedIn);\n    $('app-shell').hidden = !isLoggedIn;\n    if (!isLoggedIn) $('password').focus();\n  }\n\n  function clearSession() {\n    state = {threads: [], devices: []};\n    selected = null;\n    initialized = false;\n    listKey = '';\n    $('detail').replaceChildren();\n    $('detail').removeAttribute('data-thread-id');\n    document.body.classList.remove('detail-open');\n    history.replaceState(null, '', location.pathname + location.search);\n    showAuth(false);\n  }\n\n  function demoState() {\n    const t = seconds => sampleTime - seconds * 1000;\n    return {\n      devices: [{id: 'demo', last_seen_at: Date.now() - 9000}],\n      threads: [\n        {id: '3b9aa460-78e9-4e8f-a693-fd91d0000001', source: 'Codex', title: 'Redesign the developer dashboard', project: 'frontend-app', status: 'working', updated_at: t(17), summary: 'Updated the dashboard layout and now running checks.', conversation_truncated: false, conversation: [\n          {role:'user', text:'Redesign our developer dashboard. Make the layout cleaner and mobile-friendly, then run the tests.', at:t(238)},\n          {role:'assistant', text:'I’ll simplify the navigation and reorganize the main workspace around the active project.', at:t(210)},\n          {role:'tool', title:'Read src/Dashboard.tsx', detail:'src/Dashboard.tsx', output:'export function Dashboard() { /* existing layout */ }', at:t(145)},\n          {role:'tool', title:'Edited src/Dashboard.tsx', detail:'Replaced the sidebar and introduced a responsive grid.', output:'Updated 1 file', at:t(94)},\n          {role:'assistant', text:'The new layout is in place. I’m checking the build and small-screen behavior.', at:t(63)},\n          {role:'tool', title:'Ran npm test', detail:'npm test', output:'18 passing', at:t(17)}\n        ], events: [{at: t(238), kind: 'start', label: 'Turn started'}, {at: t(145), kind: 'tool', label: 'Tool: shell_command'}, {at: t(63), kind: 'message', label: 'Assistant response updated'}, {at: t(17), kind: 'tool', label: 'Tool: apply_patch'}], final_response: '', has_preview: false},\n        {id: '3b9aa460-78e9-4e8f-a693-fd91d0000002', source: 'Claude Code', title: 'Implement authentication flow', project: 'api-service', status: 'completed', updated_at: t(1020), events: [{at: t(1470), kind: 'tool', label: 'Tool: apply_patch'}, {at: t(1030), kind: 'message', label: 'Assistant responded'}, {at: t(1020), kind: 'complete', label: 'Turn completed'}], final_response: 'Implemented authentication and session handling.\\n\\nAll 12 tests passed.\\n\\nhttps://example.com', has_preview: false},\n        {id: '3b9aa460-78e9-4e8f-a693-fd91d0000003', source: 'Pi', title: 'Optimize model inference', project: 'knee-mri', status: 'quiet', updated_at: t(385), summary: 'Tracing the slow inference path and comparing approaches.', conversation_truncated: true, conversation: [\n          {role:'user', text:'Find the performance bottleneck in inference and reduce memory usage.', at:t(920)},\n          {role:'assistant', text:'The largest allocation occurs in preprocessing. I’m testing a streamed batch path.', at:t(740)},\n          {role:'tool', title:'Ran python benchmark.py', detail:'python benchmark.py --batch-size 8', output:'Median latency 194ms', at:t(510)}\n        ], events: [{at: t(425), kind: 'start', label: 'Turn started'}, {at: t(385), kind: 'tool', label: 'Tool: shell_command'}], final_response: '', has_preview: false},\n        {id: '3b9aa460-78e9-4e8f-a693-fd91d0000004', source: 'Custom', title: 'Fix persistent segment tree edge case', project: 'cp-solutions', status: 'completed', updated_at: t(20000), events: [{at: t(20000), kind: 'complete', label: 'Turn completed'}], final_response: 'Fixed the empty-range query. Tests pass.', has_preview: false},\n      ],\n    };\n  }\n\n  async function api(path, options = {}) {\n    if (demo) return path === '/api/state' ? demoState() : {ok: true};\n    const response = await fetch(path, {credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, ...options});\n    const data = await response.json().catch(() => ({}));\n    if (!response.ok) {\n      const error = new Error(data.error || 'Request failed');\n      error.status = response.status;\n      throw error;\n    }\n    return data;\n  }\n\n  function setNotice(message) {\n    $('error-notice').textContent = message;\n    $('error-notice').hidden = !message;\n  }\n\n  function renderHeader() {\n    $('connection-dot').classList.toggle('off', !online());\n    $('connection-text').textContent = demo ? 'Demo' : online() ? 'Live' : state.devices.length ? 'Offline' : 'Waiting';\n  }\n\n  function renderSources() {\n    const select = $('source-filter');\n    const sources = [...new Set(state.threads.filter(t => !isGuardianReview(t)).map(t => t.source || 'Codex'))].sort();\n    if (selectedSource !== 'all' && !sources.includes(selectedSource)) selectedSource = 'all';\n    const key = JSON.stringify(sources);\n    if (select.dataset.sources !== key) {\n      select.replaceChildren(new Option('All sources', 'all'));\n      sources.forEach(source => select.add(new Option(source, source)));\n      select.dataset.sources = key;\n    }\n    select.value = selectedSource;\n    select.hidden = sources.length < 2;\n  }\n\n  function alignSelection() {\n    const visible = filteredThreads();\n    if (!visible.some(thread => thread.id === selected) && !state.threads.some(thread => thread.id === selected && thread.parent_id && !isGuardianReview(thread))) selected = visible[0]?.id || null;\n    if (!mobile() && initialized) {\n      const url = selected ? '#thread=' + encodeURIComponent(selected) : location.pathname + location.search;\n      history.replaceState(null, '', url);\n    }\n  }\n\n  function renderList() {\n    const threads = filteredThreads();\n    const key = JSON.stringify([threads.map(thread => [thread.id, thread.title, thread.project, thread.source, thread.summary, thread.updated_at, statusOf(thread)]), selected, filter, term, selectedSource]);\n    if (listKey === key) return;\n    listKey = key;\n    const list = $('session-list');\n    const focused = document.activeElement?.dataset.threadId;\n    list.replaceChildren();\n    if (!threads.length) {\n      list.append(element('div', 'empty', state.threads.some(t => !isGuardianReview(t)) ? 'No matches' : 'No threads'));\n      return;\n    }\n    for (const thread of threads) {\n      const button = element('button', 'thread' + (thread.id === selected ? ' selected' : ''));\n      button.type = 'button';\n      button.dataset.threadId = thread.id;\n      button.setAttribute('aria-pressed', String(thread.id === selected));\n      const header = element('div', 'thread-top');\n      const badge = element('span');\n      setStatus(badge, statusOf(thread));\n      header.append(element('span', 'thread-title', thread.title), badge);\n      const snippet = thread.summary ? element('div', 'thread-snippet', thread.summary) : null;\n      const meta = element('div', 'thread-meta');\n      if (thread.project && thread.project !== 'Unknown project') {\n        meta.append(element('span', 'project', thread.project), element('span', '', '\\u00b7'));\n      }\n      if (thread.source) meta.append(element('span', '', thread.source), element('span', '', '\\u00b7'));\n      meta.append(when(thread.updated_at));\n      button.append(header);\n      if (snippet) button.append(snippet);\n      button.append(meta);\n      button.addEventListener('click', () => openThread(thread.id));\n      list.append(button);\n    }\n    const focus = [...list.querySelectorAll('.thread')].find(node => node.dataset.threadId === focused);\n    if (focus) focus.focus({preventScroll: true});\n  }\n\n  function buildDetail(thread) {\n    const root = $('detail');\n    root.dataset.threadId = thread.id;\n    root.replaceChildren();\n\n    const back = element('button', 'mobile-back', '\\u2190 Threads');\n    back.type = 'button';\n    back.addEventListener('click', closeThread);\n    root.append(back);\n\n    const header = element('header', 'detail-header');\n    const title = element('h2', 'detail-title');\n    const meta = element('div', 'detail-meta');\n    const badge = element('span', 'status detail-status');\n    const project = element('span', 'detail-project');\n    const time = when(0);\n    const source = element('span', 'detail-source');\n    meta.append(badge, source, project, time);\n    header.append(title, meta);\n    root.append(header);\n\n    const parentLink = element('button', 'mobile-back parent-link', '← Parent thread');\n    parentLink.type = 'button';\n    parentLink.hidden = true;\n    parentLink.addEventListener('click', () => { const parent = state.threads.find(t => t.id === thread.parent_id); if (parent) openThread(parent.id); });\n    root.append(parentLink);\n\n    const conversation = element('section', 'section conversation-section');\n    const conversationHead = element('div', 'conversation-header');\n    conversationHead.append(element('h3', '', 'Conversation'), element('span', 'conversation-note'));\n    conversation.append(conversationHead, element('div', 'conversation-feed'));\n    conversation.hidden = true;\n    root.append(conversation);\n\n    const result = element('section', 'section result-section');\n    result.append(element('h3', 'result-title', 'Result'), element('div', 'response'), element('div', 'last-event'));\n    root.append(result);\n\n    const preview = element('section', 'section preview-section');\n    const previewHeader = element('div', 'section-head');\n    const previewLink = element('a', 'preview-link', 'Open');\n    previewLink.target = '_blank';\n    previewLink.rel = 'noopener noreferrer';\n    previewHeader.append(element('h3', '', 'Preview'), previewLink);\n    const image = element('img', 'preview');\n    image.alt = 'Project preview';\n    image.loading = 'lazy';\n    image.addEventListener('error', () => {\n      image.hidden = true;\n      previewLink.hidden = true;\n      preview.append(element('div', 'muted preview-error', 'Preview unavailable'));\n    });\n    preview.append(previewHeader, image);\n    preview.hidden = true;\n    root.append(preview);\n\n    const agents = element('section', 'agents');\n    agents.append(element('h3', '', 'Subagents'));\n    agents.append(element('div', 'agent-list'));\n    agents.hidden = true;\n    root.append(agents);\n\n    const details = element('details', 'disclosure');\n    const summary = element('summary', '', 'Activity');\n    const toggle = element('span', '', 'Show');\n    summary.append(toggle);\n    details.addEventListener('toggle', () => {toggle.textContent = details.open ? 'Hide' : 'Show';});\n    details.append(summary);\n    details.append(element('ol', 'timeline'));\n    const advanced = element('div', 'advanced');\n    const copy = element('button', 'copy-id', 'Copy ID');\n    copy.type = 'button';\n    copy.addEventListener('click', async () => {\n      try {\n        await navigator.clipboard.writeText(thread.id);\n        copy.textContent = 'Copied';\n      } catch (_) {\n        copy.textContent = thread.id;\n      }\n    });\n    advanced.append(copy);\n    details.append(advanced);\n    root.append(details);\n  }\n\n\n  function appendRichInline(node, value) {\n    const segments = String(value).split(/(\\*\\*[^*\\n]+\\*\\*|\\x60[^\\x60\\n]+\\x60)/g);\n    for (const segment of segments) {\n      if (!segment) continue;\n      if (segment.startsWith('**') && segment.endsWith('**')) {\n        node.append(element('strong', '', segment.slice(2, -2)));\n      } else if (segment.startsWith(String.fromCharCode(96)) && segment.endsWith(String.fromCharCode(96))) {\n        node.append(element('code', '', segment.slice(1, -1)));\n      } else appendLinks(node, segment);\n    }\n  }\n\n  function appendConversationText(node, value) {\n    // Render fenced code using text nodes only; never evaluate session content.\n    const chunks = String(value || '').split(/(\\x60{3}[^\\n]*\\n[\\s\\S]*?\\x60{3})/g);\n    for (const chunk of chunks) {\n      if (!chunk) continue;\n      if (chunk.startsWith(String.fromCharCode(96).repeat(3))) {\n        const match = /^\\x60{3}([^\\n]*)\\n([\\s\\S]*?)\\x60{3}$/.exec(chunk);\n        if (match) {\n          const pre = element('pre');\n          if (match[1].trim()) pre.append(element('span', 'conv-code-label', match[1].trim().slice(0, 30)));\n          pre.append(element('code', '', match[2]));\n          node.append(pre);\n          continue;\n        }\n      }\n      const span = element('div', 'conv-text');\n      appendRichInline(span, chunk);\n      node.append(span);\n    }\n  }\n\n  function renderConversation(thread) {\n    const section = $('detail').querySelector('.conversation-section');\n    const feed = section.querySelector('.conversation-feed');\n    if (!Array.isArray(thread.conversation)) {\n      section.hidden = true;\n      feed.dataset.key = '';\n      return;\n    }\n    section.hidden = false;\n    const data = thread.conversation;\n    const note = section.querySelector('.conversation-note');\n    note.textContent = thread.conversation_truncated ? 'Recent messages' : '';\n    const key = JSON.stringify(data);\n    if (feed.dataset.key === key) return;\n    const previouslyOpen = [...feed.querySelectorAll('.conv-tools')].map((item, i) => item.open ? i : -1);\n    feed.dataset.key = key;\n    feed.replaceChildren();\n    if (!data.length) {\n      feed.append(element('p', 'muted', 'No conversation messages recorded yet.'));\n      return;\n    }\n    let toolGroup = [];\n    let groupIndex = 0;\n    const flushTools = () => {\n      if (!toolGroup.length) return;\n      const tools = toolGroup;\n      toolGroup = [];\n      const details = element('details', 'conv-tools');\n      const firstAction = tools.find(tool => tool.title && tool.title !== 'Tool output')?.title || 'Tool activity';\n      const title = tools.length === 1 ? firstAction : firstAction + ' · ' + (tools.length - 1) + ' more';\n      const summary = element('summary', '', title);\n      details.append(summary);\n      const list = element('ol', 'conv-steps');\n      for (const tool of tools) {\n        const item = element('li');\n        item.append(element('div', 'conv-step-title' + (tool.error ? ' conv-step-error' : ''), tool.title || 'Tool'));\n        if (tool.detail) {\n          const command = element('pre', '', tool.detail);\n          command.setAttribute('aria-label', 'Tool input');\n          item.append(command);\n        }\n        if (tool.output) {\n          const out = element('pre', '', tool.output);\n          out.setAttribute('aria-label', 'Tool output');\n          item.append(out);\n        }\n        list.append(item);\n      }\n      details.append(list);\n      details.open = previouslyOpen.includes(groupIndex);\n      groupIndex++;\n      feed.append(details);\n    };\n    for (const entry of data) {\n      if (entry.role === 'tool') {\n        toolGroup.push(entry);\n        continue;\n      }\n      flushTools();\n      if (entry.role === 'notice') {\n        feed.append(element('div', 'conv-notice', entry.text || 'Activity'));\n        continue;\n      }\n      if (!['user', 'assistant'].includes(entry.role)) continue;\n      const item = element('article', 'conv-message ' + entry.role);\n      const speaker = entry.role === 'user' ? 'You' : thread.agent_label || thread.source || 'Assistant';\n      const byline = element('div', 'conv-byline');\n      byline.append(element('strong', '', speaker), element('span', '', clockTime(entry.at)));\n      item.append(byline);\n      const body = element('div', 'conv-content');\n      appendConversationText(body, entry.text);\n      item.append(body);\n      feed.append(item);\n    }\n    flushTools();\n  }\n\n  function renderDetail() {\n    const root = $('detail');\n    const thread = state.threads.find(entry => entry.id === selected && !isGuardianReview(entry));\n    if (!thread) {\n      if (root.dataset.threadId !== 'empty') {\n        root.replaceChildren(element('div', 'detail-empty', 'Select a thread'));\n        root.dataset.threadId = 'empty';\n      }\n      return;\n    }\n    if (root.dataset.threadId !== thread.id) buildDetail(thread);\n    const status = statusOf(thread);\n    const parent = state.threads.find(t => t.id === thread.parent_id);\n    root.querySelector('.parent-link').hidden = !parent;\n    const title = root.querySelector('.detail-title');\n    if (title.textContent !== thread.title) title.textContent = thread.title;\n    setStatus(root.querySelector('.detail-status'), status);\n    root.querySelector('.detail-source').textContent = thread.source || 'Codex';\n    const project = root.querySelector('.detail-project');\n    project.textContent = thread.project && thread.project !== 'Unknown project' ? thread.project : '';\n    project.hidden = !project.textContent;\n    const time = root.querySelector('.detail-meta time');\n    time.dataset.ms = String(thread.updated_at || 0);\n    updateTime(time);\n\n    renderConversation(thread);\n    root.querySelector('.result-section').hidden = Array.isArray(thread.conversation);\n    const response = root.querySelector('.response');\n    const heading = root.querySelector('.result-title');\n    const latest = root.querySelector('.last-event');\n    if (thread.final_response) {\n      heading.hidden = false;\n      response.hidden = false;\n      latest.hidden = true;\n      if (response.dataset.content !== thread.final_response) {\n        const oldScroll = response.scrollTop;\n        response.replaceChildren();\n        appendLinks(response, thread.final_response);\n        response.dataset.content = thread.final_response;\n        response.scrollTop = oldScroll;\n      }\n    } else {\n      heading.hidden = true;\n      response.hidden = true;\n      latest.hidden = false;\n      const last = thread.events?.at(-1);\n      latest.textContent = status === 'completed' ? 'No response synced' : last ? humanEvent(last) : 'No activity';\n    }\n\n    const preview = root.querySelector('.preview-section');\n    const image = preview.querySelector('img');\n    const link = preview.querySelector('a');\n    preview.hidden = !thread.has_preview;\n    if (thread.has_preview) {\n      const url = '/api/preview?id=' + encodeURIComponent(thread.id) + '&v=' + (thread.preview_updated_at || 0);\n      if (image.dataset.url !== url) {\n        image.dataset.url = url;\n        preview.querySelector('.preview-error')?.remove();\n        image.hidden = false;\n        link.hidden = false;\n        image.src = url;\n        link.href = url;\n      }\n    }\n\n    const children = state.threads.filter(item => item.parent_id === thread.id && !isGuardianReview(item));\n    const agents = root.querySelector('.agents');\n    agents.hidden = !children.length;\n    const agentList = agents.querySelector('.agent-list');\n    const agentsKey = JSON.stringify(children.map(item => [item.id, item.title, item.status, item.updated_at]));\n    if (agentList.dataset.key !== agentsKey) {\n      agentList.dataset.key = agentsKey;\n      agentList.replaceChildren();\n      for (const child of children) {\n        const item = element('button', 'agent-item');\n        item.type = 'button';\n        const label = element('span');\n        label.append(element('span', '', child.agent_label || child.title));\n        label.append(element('small', '', child.title));\n        const stateBadge = element('span');\n        setStatus(stateBadge, statusOf(child));\n        item.append(label, stateBadge);\n        item.addEventListener('click', () => openThread(child.id));\n        agentList.append(item);\n      }\n    }\n\n    const details = root.querySelector('.disclosure');\n    const events = (thread.events || []).slice(-12).reverse();\n    details.hidden = !events.length;\n    const timeline = details.querySelector('.timeline');\n    const key = JSON.stringify(events);\n    if (timeline.dataset.key !== key) {\n      timeline.dataset.key = key;\n      timeline.replaceChildren();\n      for (const event of events) {\n        const item = element('li');\n        item.append(element('span', 'event-label', humanEvent(event)), element('time', '', clockTime(event.at)));\n        timeline.append(item);\n      }\n    }\n  }\n\n  function render() {\n    if (!loggedIn) return;\n    renderHeader();\n    renderSources();\n    renderList();\n    renderDetail();\n    refreshRelativeTimes();\n  }\n\n  function hashThread() {\n    if (!location.hash.startsWith('#thread=')) return null;\n    try {return decodeURIComponent(location.hash.slice(8));}\n    catch (_) {return null;}\n  }\n\n  function openThread(id) {\n    if (!state.threads.some(thread => thread.id === id && !isGuardianReview(thread))) return;\n    const openingMobile = mobile();\n    if (openingMobile && !document.body.classList.contains('detail-open')) listPosition = window.scrollY;\n    selected = id;\n    if (openingMobile) {\n      document.body.classList.add('detail-open');\n      history.pushState({observerView: 'detail'}, '', '#thread=' + encodeURIComponent(id));\n    } else {\n      history.replaceState(null, '', '#thread=' + encodeURIComponent(id));\n    }\n    listKey = '';\n    render();\n    if (openingMobile) window.scrollTo(0, 0);\n  }\n\n  function closeThread() {\n    if (mobile() && history.state?.observerView === 'detail') {\n      history.back();\n      return;\n    }\n    history.replaceState(null, '', location.pathname + location.search);\n    document.body.classList.remove('detail-open');\n    window.scrollTo(0, listPosition);\n  }\n\n  function applyNavigation() {\n    const id = hashThread();\n    if (id && state.threads.some(thread => thread.id === id && !isGuardianReview(thread))) {\n      selected = id;\n      document.body.classList.toggle('detail-open', mobile());\n    } else {\n      document.body.classList.remove('detail-open');\n      alignSelection();\n    }\n    listKey = '';\n    render();\n    if (!document.body.classList.contains('detail-open')) window.scrollTo(0, listPosition);\n  }\n\n  function syncSelection() {\n    if (!initialized) {\n      initialized = true;\n      const hashId = hashThread();\n      if (hashId && state.threads.some(thread => thread.id === hashId && !isGuardianReview(thread))) {\n        selected = hashId;\n        document.body.classList.toggle('detail-open', mobile());\n      }\n    }\n    alignSelection();\n    if (!selected) {\n      document.body.classList.remove('detail-open');\n      if (location.hash) history.replaceState(null, '', location.pathname + location.search);\n    }\n  }\n\n  async function refresh() {\n    if (refreshing) {queuedRefresh = true; return;}\n    refreshing = true;\n    const epoch = authEpoch;\n    try {\n      const next = await api('/api/state');\n      if (epoch !== authEpoch) return;\n      state = next;\n      syncSelection();\n      showAuth(true);\n      setNotice('');\n      render();\n    } catch (error) {\n      if (epoch !== authEpoch) return;\n      if (error.status === 401) {\n        clearSession();\n      } else if (loggedIn) {\n        setNotice(\"Couldn't update. Try again.\");\n      } else {\n        $('auth-error').textContent = \"Couldn't connect. Try again.\";\n        showAuth(false);\n      }\n    } finally {\n      refreshing = false;\n      if (queuedRefresh) {\n        queuedRefresh = false;\n        void refresh();\n      }\n    }\n  }\n\n  $('auth-form').addEventListener('submit', async event => {\n    event.preventDefault();\n    const button = $('login-button');\n    button.disabled = true;\n    $('auth-error').textContent = '';\n    try {\n      await api('/api/login', {method: 'POST', body: JSON.stringify({password: $('password').value})});\n      $('password').value = '';\n      authEpoch++;\n      showAuth(true);\n      await refresh();\n    } catch (error) {\n      $('auth-error').textContent = error.status === 401 ? 'Incorrect password' : error.message;\n    } finally {\n      button.disabled = false;\n    }\n  });\n\n  $('logout').addEventListener('click', async () => {\n    $('logout').disabled = true;\n    try {\n      await api('/api/logout', {method: 'POST', body: '{}'});\n      authEpoch++;\n      clearSession();\n    } catch (error) {\n      if (error.status === 401) {\n        authEpoch++;\n        clearSession();\n      } else setNotice(\"Couldn't sign out. Try again.\");\n    } finally {\n      $('logout').disabled = false;\n    }\n  });\n\n  $('refresh').addEventListener('click', refresh);\n  $('source-filter').addEventListener('change', event => {\n    selectedSource = event.target.value;\n    alignSelection();\n    listKey = '';\n    render();\n  });\n  $('search').addEventListener('input', event => {\n    term = event.target.value.trim().toLowerCase();\n    alignSelection();\n    listKey = '';\n    render();\n  });\n  document.querySelectorAll('.filter').forEach(button => {\n    button.addEventListener('click', () => {\n      filter = button.dataset.filter;\n      document.querySelectorAll('.filter').forEach(item => {\n        item.classList.toggle('active', item === button);\n        item.setAttribute('aria-pressed', String(item === button));\n      });\n      alignSelection();\n      listKey = '';\n      render();\n    });\n  });\n\n  window.addEventListener('popstate', applyNavigation);\n  window.addEventListener('resize', () => {\n    if (!loggedIn) return;\n    if (!mobile()) document.body.classList.remove('detail-open');\n    else if (hashThread() && state.threads.some(thread => thread.id === hashThread())) document.body.classList.add('detail-open');\n  });\n  document.addEventListener('visibilitychange', () => {if (!document.hidden) void refresh();});\n  setInterval(() => {if (!document.hidden) void refresh();}, 12000);\n  setInterval(() => {if (!document.hidden && loggedIn) render();}, 20000);\n  if (demo) {\n    $('logout').hidden = true;\n    showAuth(true);\n  } else showAuth(false);\n  void refresh();\n})();\n</script>\n</body>\n</html>\n";
const SESSION_AGE_SECONDS = 12 * 60 * 60;
const ID = /^[A-Za-z0-9_-]{6,100}$/;
const statuses = new Set(['working', 'completed', 'quiet', 'interrupted', 'unknown']);
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
export default {
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
