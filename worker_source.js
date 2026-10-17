/**
 * Observer - Cloudflare Worker (no runtime packages).
 * Build worker.js with: python3 build_worker.py
 * Cloudflare bindings: D1 database named DB; secrets AGENT_TOKEN,
 * VIEW_PASSWORD, SESSION_KEY. No commands, task creation, or filesystem writes.
 */
const HTML = __EMBEDDED_SITE_HTML__;
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
function validateThread(input, now) {
  if (!input || typeof input !== 'object' || !ID.test(input.id || '')) return null;
  const status = statuses.has(input.status) ? input.status : 'unknown';
  let updated = number(input.updated_at, now);
  if (updated > now + 300_000) updated = now;
  if (updated < 946684800000) updated = now; // Year 2000 minimum.
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
    final_response: clean(input.final_response, 6000),
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
