// Minutes.AI storage + auth backend.
//
// Files are stored as `<DATA_DIR>/<sanitized-username>/<rawDate>-<slug>.md`
// with an HTML-comment frontmatter, so each is readable in any markdown viewer.
//
// Auth is real and server-enforced: users live in DATA_DIR/users.json with
// scrypt-hashed passwords; login issues an HMAC-signed, HttpOnly session
// cookie; every /api/meetings and /api/users request is validated against
// that cookie and the role comes from the stored user record (never the
// client). Per-user archive isolation is therefore a genuine guarantee.

const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || '/data';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const COOKIE_NAME = 'minutes_session';

app.use(express.json({ limit: '25mb' })); // long transcripts can get big
app.disable('x-powered-by');
app.set('trust proxy', true);

function slug(s) {
  return String(s || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

function filenameFor(m) {
  return `${m.rawDate || Date.now()}-${slug(m.title)}.md`;
}

function serialize(m) {
  const meta = {
    id: m.id,
    title: m.title,
    date: m.date,
    rawDate: m.rawDate,
    template: m.template,
    transcript: m.transcript || '',
    notes: m.notes || ''
  };
  return `<!--meeting-meta\n${JSON.stringify(meta)}\n-->\n\n# ${m.title}\n\n${m.summary || ''}\n`;
}

function parse(text) {
  const match = text.match(/<!--meeting-meta\n([\s\S]*?)\n-->/);
  if (!match) return null;
  try {
    const meta = JSON.parse(match[1]);
    const body = text.slice(match[0].length).replace(/^\s*#[^\n]*\n+/, '').trim();
    return { ...meta, summary: body };
  } catch (e) {
    console.warn('parse fail', e);
    return null;
  }
}

function sanitizeUser(raw) {
  // Allow only [a-z0-9_-], lowercase, max 64 chars. No path traversal.
  const s = String(raw || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 64);
  return s.length > 0 ? s : null;
}

// ==========================================================================
// AUTH: server-side users, scrypt password hashing, signed session cookies
// ==========================================================================

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const SECRET_FILE = path.join(DATA_DIR, '.session_secret');

// Session-signing secret: from env, else generated once and persisted so
// sessions survive container restarts.
function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    return fsSync.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(48).toString('hex');
    try { fsSync.mkdirSync(DATA_DIR, { recursive: true }); fsSync.writeFileSync(SECRET_FILE, s, { mode: 0o600 }); }
    catch (e) { console.warn('Could not persist session secret', e.message); }
    return s;
  }
}
const SESSION_SECRET = getSessionSecret();

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(pw, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, salt, expected] = stored.split('$');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

// Stateless signed session token: base64url(payload).base64url(hmac)
function signSession(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', SESSION_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SESSION_SECRET).update(body).digest());
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(body)); } catch { return null; }
  if (!payload || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i < 0) return;
    out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

function reqIsHttps(req) {
  const xfp = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return xfp === 'https' || req.secure;
}

function setSessionCookie(req, res, payload) {
  const token = signSession(payload);
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (reqIsHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

// ---- User store (DATA_DIR/users.json) ----
async function loadUsers() {
  try {
    const txt = await fs.readFile(USERS_FILE, 'utf8');
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
async function saveUsers(users) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}
function sanitizeLang(raw) {
  const l = String(raw || '').toLowerCase().trim();
  return (l === 'es' || l === 'de') ? l : 'en';
}

async function seedAdmin() {
  const users = await loadUsers();
  if (users.length === 0) {
    users.push({
      username: 'admin',
      role: 'admin',
      language: 'en',
      passwordHash: hashPassword('admin123'),
      createdAt: new Date().toISOString().slice(0, 10)
    });
    await saveUsers(users);
    console.log('[minutes-ai-api] seeded default admin (admin/admin123) — change the password!');
  }
}

// ==========================================================================
// TEMPLATE store (DATA_DIR/templates.json) — global, admin-managed library.
// Shared by every user; only admins can create/edit/delete. Each record is
// { id, name, prompt, createdAt }. Built-in ids (standard, action, …) are kept
// stable so existing archived meetings keep resolving to a template name.
// ==========================================================================
const TPL_NAME_MAX = 80;
const TPL_PROMPT_MAX = 12000;
const TPL_NOTES_MAX = 8000;

const DEFAULT_TEMPLATES = [
  {
    id: 'standard',
    notesStructure: `**Attendees:**\n\n**Agenda:**\n\n**Notes:**\n`,
    name: 'Standard Minutes',
    prompt: `Create concise, professional meeting minutes. Be rigorous about NOT repeating the same point: each distinct idea, decision, or recommendation appears ONCE, in the single most relevant section. Group the discussion by THEME — never narrate the conversation turn-by-turn.

Sections:
1. **Meeting Details**: Title, date (from context), attendees and facilitator (deduce from the conversation).
2. **Executive Summary**: One tight paragraph — purpose, context, and main outcome.
3. **Key Discussion (by topic)**: Group related points under short topic headings. Summarize the substance with the fewest bullets that capture every distinct point. No duplicates, no play-by-play.
4. **Proposals & Recommendations**: Any proposals, ideas, or recommendations raised — especially by advisors, consultants, or presenters — each stated once and clearly. Omit this section only if there were genuinely none.
5. **Decisions Made**: Numbered list of finalized decisions only.
6. **Next Steps / Action Items**: Each task once, with owner and deadline if mentioned.

Write in the meeting's language. Start directly with the content — no preamble.`
  },
  {
    id: 'discovery',
    notesStructure: `**Client / Area:**\n\n**Goals for the session:**\n\n**Current state:**\n\n**Pain points:**\n\n**Ideas / recommendations:**\n`,
    name: 'Discovery / Consulting Session',
    prompt: `These are minutes of a discovery or consulting session. The most valuable output is what was LEARNED and what was PROPOSED — not a transcript. State each point once and group by theme; never repeat a point across sections.

Sections:
1. **Context**: Who met, the company/area, and the purpose of the session (1–3 lines).
2. **Current State**: How things work today — key facts, processes, numbers, and systems — grouped by topic and deduplicated.
3. **Pain Points & Risks**: The concrete problems, gaps, or risks that surfaced.
4. **Proposals & Recommendations**: The advisor's/consultant's recommendations — the heart of the session. One clear item each, in priority order.
5. **Decisions**: Anything actually decided (numbered). Omit if none.
6. **Next Steps / Action Items**: Each task once, with owner and deadline if mentioned.

Write in the meeting's language. Be concise.`
  },
  {
    id: 'action',
    notesStructure: `**Owners present:**\n\n**Tasks to capture:**\n\n**Deadlines mentioned:**\n`,
    name: 'Action Items & Tasks Table',
    prompt: `Synthesize the transcript and notes into a highly task-oriented summary. The focus must be 100% on execution.
Generate a structured Markdown table summarizing the Action Items. The table must have exactly these columns:
| Task / Deliverable | Owner | Deadline | Priority (High/Medium/Low) | Status/Description |

Below the table, provide:
1. **Critical Path Items**: A bulleted section describing the 3 most urgent roadblocks or tasks.
2. **Dependencies & Risks**: Any items that depend on other tasks or have potential risks associated with them.`
  },
  {
    id: 'executive',
    notesStructure: `**Audience:**\n\n**Headline outcomes:**\n\n**Asks for leadership:**\n`,
    name: 'Executive Brief (TL;DR)',
    prompt: `Provide a high-level, ultra-polished Executive Brief designed for C-level leadership who did not attend the meeting.
Structure it with:
1. **TL;DR Highlights**: 3-4 bullet points outlining the highest-impact results.
2. **Strategic Decisions**: Strategic choices made, and their business implications.
3. **Key Progress / Status Updates**: Brief summary of project updates discussed.
4. **Critical Asks / Needs**: Immediate needs or blockers that require leadership attention.
Keep paragraphs brief, dense, and punchy.`
  },
  {
    id: 'technical',
    notesStructure: `**Systems / components:**\n\n**Decisions:**\n\n**Risks / open questions:**\n`,
    name: 'Engineering & Tech Spec Summary',
    prompt: `Synthesize this into a technical spec summary. Focus on engineering architecture, designs, and systems discussed.
Structure it with:
1. **Architecture & Technical Decisions**: System diagrams discussed, database schema modifications, or APIs changes.
2. **Code & Implementation Notes**: Specific files, libraries, or technologies discussed.
3. **Bug Reports & Issues Addressed**: Technical problems identified and resolutions agreed upon.
4. **Testing & QA Actions**: Automated testing plans, manual QA scopes, and deployment steps.`
  },
  {
    id: 'creative',
    notesStructure: `**Theme:**\n\n**Ideas:**\n\n**Wild cards:**\n`,
    name: 'Creative Concept Map',
    prompt: `Synthesize this meeting into a conceptual outline showing the relationship of ideas and lateral brainstorming.
Structure it with:
1. **Core Theme / Anchor Idea**: The single central concept of the meeting.
2. **Primary Conceptual Branches**: The major ideas explored, with hierarchical sub-bullets for supporting suggestions.
3. **Tangential Explorations**: Ideas that were briefly touched upon but rejected or deferred (wildcard suggestions).
4. **Inspirational Takeaways**: Creative summaries, analogies, or vision statements created during the meeting.`
  }
];

function sanitizeTemplateId(raw) {
  const s = String(raw || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 64);
  return s.length > 0 ? s : null;
}

// Derive a readable, unique id from a template name.
function uniqueTemplateId(name, templates) {
  const base = slug(name) || 'template';
  const taken = new Set(templates.map((t) => t.id));
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

async function loadTemplates() {
  try {
    const arr = JSON.parse(await fs.readFile(TEMPLATES_FILE, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function saveTemplates(templates) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
}

// Seed the built-in templates on first boot ONLY. If templates.json already
// exists — even as an empty array because an admin deleted everything — we
// respect that and never re-seed.
async function seedTemplates() {
  try {
    await fs.access(TEMPLATES_FILE);
    return;
  } catch (e) { /* ENOENT → first boot, seed defaults */ }
  const today = new Date().toISOString().slice(0, 10);
  await saveTemplates(DEFAULT_TEMPLATES.map((t) => ({ ...t, createdAt: today })));
  console.log('[minutes-ai-api] seeded default templates');
}

// Backfill the notesStructure field on templates created before it existed.
// Only fills when the property is genuinely absent (never overwrites an admin's
// value, including an intentionally-empty one). Built-ins get their default
// scaffold by id; everything else gets an empty string.
async function migrateTemplates() {
  let templates;
  try {
    templates = await loadTemplates();
  } catch (e) { return; }
  if (!templates.length) return;
  const defaultsById = Object.fromEntries(DEFAULT_TEMPLATES.map((t) => [t.id, t]));
  let changed = false;
  for (const t of templates) {
    if (typeof t.notesStructure !== 'string') {
      t.notesStructure = (defaultsById[t.id] && defaultsById[t.id].notesStructure) || '';
      changed = true;
    }
  }
  if (changed) {
    await saveTemplates(templates);
    console.log('[minutes-ai-api] migrated templates: added notesStructure');
  }
}

// Resolve the logged-in identity from the session cookie. Returns null if
// unauthenticated. Role comes from the stored user record, never the client.
async function resolveSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  const payload = verifySessionToken(token);
  if (!payload || !payload.u) return null;
  const users = await loadUsers();
  const user = users.find((x) => x.username === payload.u);
  if (!user) return null; // user deleted since login
  return { username: user.username, role: user.role, language: sanitizeLang(user.language) };
}

// Middleware: require a valid session for everything it guards.
async function requireAuth(req, res, next) {
  try {
    const me = await resolveSession(req);
    if (!me) return res.status(401).json({ error: 'authentication required' });
    req.user = me;
    next();
  } catch (e) {
    console.error('auth check failed', e);
    res.status(500).json({ error: 'auth error' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'admin privileges required' });
  }
  next();
}

// Returns array of subdirectory names (each is one user's archive).
async function listUserDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function ensureUserDir(userDir) {
  await fs.mkdir(userDir, { recursive: true });
}

async function findFileById(userDir, id) {
  await ensureUserDir(userDir);
  const files = await fs.readdir(userDir);
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    try {
      const text = await fs.readFile(path.join(userDir, f), 'utf8');
      const m = parse(text);
      if (m && m.id === id) return f;
    } catch { /* ignore unreadable file */ }
  }
  return null;
}

// Health probe (no auth)
app.get('/api/health', (_, res) => res.json({ ok: true, dataDir: DATA_DIR }));

// ---- Audio compression (ffmpeg) ----
// Accepts a raw audio stream (application/octet-stream), re-encodes it to a
// small mono Opus file, and streams it back. Lets the browser shrink large
// meeting recordings before uploading them to Gemini. Auth-gated; the key
// never touches the server — only the bytes do.
app.post('/api/compress', requireAuth, (req, res) => {
  const id = crypto.randomBytes(8).toString('hex');
  const inPath = path.join(os.tmpdir(), `mai-in-${id}`);
  const outPath = path.join(os.tmpdir(), `mai-out-${id}.ogg`);
  const cleanup = () => { fsSync.unlink(inPath, () => {}); fsSync.unlink(outPath, () => {}); };

  const ws = fsSync.createWriteStream(inPath);
  ws.on('error', (e) => {
    console.error('compress write error', e);
    cleanup();
    if (!res.headersSent) res.status(500).json({ error: 'upload write failed' });
  });
  ws.on('finish', () => {
    // mono, Opus @ 24kbps, voip profile — excellent for speech, tiny output
    const ff = spawn('ffmpeg', ['-y', '-i', inPath, '-vn', '-ac', '1', '-c:a', 'libopus', '-b:a', '24k', '-application', 'voip', outPath]);
    let errLog = '';
    ff.stderr.on('data', (d) => { errLog += d.toString(); });
    ff.on('error', (e) => {
      console.error('ffmpeg spawn failed', e);
      cleanup();
      if (!res.headersSent) res.status(500).json({ error: 'ffmpeg unavailable: ' + e.message });
    });
    ff.on('close', (code) => {
      if (code !== 0) {
        console.error('ffmpeg exit', code, errLog.slice(-600));
        cleanup();
        if (!res.headersSent) res.status(500).json({ error: 'compression failed' });
        return;
      }
      res.setHeader('Content-Type', 'audio/ogg');
      const rs = fsSync.createReadStream(outPath);
      rs.on('error', () => { cleanup(); if (!res.headersSent) res.status(500).end(); });
      res.on('close', cleanup);
      rs.pipe(res);
    });
  });

  req.on('error', () => { cleanup(); });
  req.pipe(ws);
});

// ---- Auth endpoints ----
app.post('/api/auth/login', async (req, res) => {
  try {
    const username = sanitizeUser(req.body && req.body.username);
    const password = req.body && req.body.password;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const users = await loadUsers();
    const user = users.find((u) => u.username === username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'invalid username or password' });
    }
    setSessionCookie(req, res, { u: user.username, exp: Date.now() + SESSION_TTL_MS });
    res.json({ username: user.username, role: user.role, language: sanitizeLang(user.language) });
  } catch (e) {
    console.error('login failed', e);
    res.status(500).json({ error: 'login error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Who am I — frontend calls this on boot. 200 + identity if logged in, 401 if not.
app.get('/api/auth/me', async (req, res) => {
  const me = await resolveSession(req);
  if (!me) return res.status(401).json({ error: 'not authenticated' });
  res.json(me);
});

// ---- User management (admin only, except self password change) ----
app.get('/api/users', requireAuth, requireAdmin, async (_, res) => {
  const users = await loadUsers();
  res.json(users.map((u) => ({ username: u.username, role: u.role, language: sanitizeLang(u.language), createdAt: u.createdAt })));
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const username = sanitizeUser(req.body && req.body.username);
  const password = req.body && req.body.password;
  const role = (req.body && req.body.role) === 'admin' ? 'admin' : 'operator';
  const language = sanitizeLang(req.body && req.body.language);
  if (!username) return res.status(400).json({ error: 'invalid username (use letters, numbers, _ or -)' });
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'password must be at least 4 characters' });
  const users = await loadUsers();
  if (users.some((u) => u.username === username)) return res.status(409).json({ error: 'username already exists' });
  users.push({ username, role, language, passwordHash: hashPassword(password), createdAt: new Date().toISOString().slice(0, 10) });
  await saveUsers(users);
  res.json({ ok: true });
});

app.delete('/api/users/:username', requireAuth, requireAdmin, async (req, res) => {
  const target = sanitizeUser(req.params.username);
  if (target === req.user.username) return res.status(400).json({ error: "you can't delete your own account" });
  const users = await loadUsers();
  const next = users.filter((u) => u.username !== target);
  if (next.length === users.length) return res.status(404).json({ error: 'user not found' });
  await saveUsers(next);
  res.json({ ok: true });
});

app.post('/api/users/:username/password', requireAuth, async (req, res) => {
  const target = sanitizeUser(req.params.username);
  const password = req.body && req.body.password;
  // admins can reset anyone; non-admins only themselves
  if (req.user.role !== 'admin' && req.user.username !== target) {
    return res.status(403).json({ error: 'not allowed' });
  }
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'password must be at least 4 characters' });
  const users = await loadUsers();
  const user = users.find((u) => u.username === target);
  if (!user) return res.status(404).json({ error: 'user not found' });
  user.passwordHash = hashPassword(password);
  await saveUsers(users);
  res.json({ ok: true });
});

app.post('/api/users/:username/role', requireAuth, requireAdmin, async (req, res) => {
  const target = sanitizeUser(req.params.username);
  const role = (req.body && req.body.role) === 'admin' ? 'admin' : 'operator';
  if (target === req.user.username) return res.status(400).json({ error: "you can't change your own role" });
  const users = await loadUsers();
  const user = users.find((u) => u.username === target);
  if (!user) return res.status(404).json({ error: 'user not found' });
  user.role = role;
  await saveUsers(users);
  res.json({ ok: true });
});

// Change a user's language — admins can change anyone; users only themselves
app.post('/api/users/:username/language', requireAuth, async (req, res) => {
  const target = sanitizeUser(req.params.username);
  const language = sanitizeLang(req.body && req.body.language);
  if (req.user.role !== 'admin' && req.user.username !== target) {
    return res.status(403).json({ error: 'not allowed' });
  }
  const users = await loadUsers();
  const user = users.find((u) => u.username === target);
  if (!user) return res.status(404).json({ error: 'user not found' });
  user.language = language;
  await saveUsers(users);
  res.json({ ok: true, language });
});

// ---- Template management (read: any user; write: admin only) ----
app.get('/api/templates', requireAuth, async (_, res) => {
  try {
    res.json(await loadTemplates());
  } catch (e) {
    console.error('load templates failed', e);
    res.status(500).json({ error: 'could not load templates' });
  }
});

app.post('/api/templates', requireAuth, requireAdmin, async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  const prompt = String((req.body && req.body.prompt) || '').trim();
  const notesStructure = String((req.body && req.body.notesStructure) || '');
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (name.length > TPL_NAME_MAX) return res.status(400).json({ error: `name must be ${TPL_NAME_MAX} characters or fewer` });
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (prompt.length > TPL_PROMPT_MAX) return res.status(400).json({ error: 'prompt is too long' });
  if (notesStructure.length > TPL_NOTES_MAX) return res.status(400).json({ error: 'notes structure is too long' });
  const templates = await loadTemplates();
  const tpl = { id: uniqueTemplateId(name, templates), name, prompt, notesStructure, createdAt: new Date().toISOString().slice(0, 10) };
  templates.push(tpl);
  await saveTemplates(templates);
  res.json(tpl);
});

app.put('/api/templates/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = sanitizeTemplateId(req.params.id);
  const name = String((req.body && req.body.name) || '').trim();
  const prompt = String((req.body && req.body.prompt) || '').trim();
  const notesStructure = String((req.body && req.body.notesStructure) || '');
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (name.length > TPL_NAME_MAX) return res.status(400).json({ error: `name must be ${TPL_NAME_MAX} characters or fewer` });
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (prompt.length > TPL_PROMPT_MAX) return res.status(400).json({ error: 'prompt is too long' });
  if (notesStructure.length > TPL_NOTES_MAX) return res.status(400).json({ error: 'notes structure is too long' });
  const templates = await loadTemplates();
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) return res.status(404).json({ error: 'template not found' });
  tpl.name = name;
  tpl.prompt = prompt;
  tpl.notesStructure = notesStructure;
  await saveTemplates(templates);
  res.json(tpl);
});

app.delete('/api/templates/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = sanitizeTemplateId(req.params.id);
  const templates = await loadTemplates();
  const next = templates.filter((t) => t.id !== id);
  if (next.length === templates.length) return res.status(404).json({ error: 'template not found' });
  await saveTemplates(next);
  res.json({ ok: true });
});

// Meetings scope middleware — identity now comes from the validated session
// cookie. No valid session → 401. Role from the stored user record.
app.use('/api/meetings', requireAuth, (req, res, next) => {
  req.scopedUser = req.user.username;
  req.scopedRole = req.user.role;
  req.userDir = path.join(DATA_DIR, req.user.username);
  next();
});

// Walks every user subfolder and returns the first hit for `id`.
async function findFileGlobally(id) {
  const users = await listUserDirs();
  for (const u of users) {
    const userDir = path.join(DATA_DIR, u);
    const filename = await findFileById(userDir, id);
    if (filename) return { userDir, filename, owner: u };
  }
  return null;
}

async function listAllMeetingsAcrossUsers() {
  const users = await listUserDirs();
  const all = [];
  for (const u of users) {
    const userDir = path.join(DATA_DIR, u);
    const files = (await fs.readdir(userDir)).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      try {
        const text = await fs.readFile(path.join(userDir, f), 'utf8');
        const m = parse(text);
        if (m) { m._owner = u; all.push(m); }
      } catch (e) { console.warn('skip', f, e.message); }
    }
  }
  return all;
}

async function listMeetingsForUser(userDir, owner) {
  await ensureUserDir(userDir);
  const files = (await fs.readdir(userDir)).filter((f) => f.endsWith('.md'));
  const out = [];
  for (const f of files) {
    try {
      const text = await fs.readFile(path.join(userDir, f), 'utf8');
      const m = parse(text);
      if (m) { m._owner = owner; out.push(m); }
    } catch (e) { console.warn('skip', f, e.message); }
  }
  return out;
}

// LIST — admin sees everyone, operators see only themselves
app.get('/api/meetings', async (req, res) => {
  try {
    const meetings = req.scopedRole === 'admin'
      ? await listAllMeetingsAcrossUsers()
      : await listMeetingsForUser(req.userDir, req.scopedUser);
    meetings.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));
    res.json(meetings);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET one — admin can read across users
app.get('/api/meetings/:id', async (req, res) => {
  try {
    let dir = req.userDir, filename;
    if (req.scopedRole === 'admin') {
      const hit = await findFileGlobally(req.params.id);
      if (!hit) return res.status(404).json({ error: 'not found' });
      dir = hit.userDir; filename = hit.filename;
    } else {
      filename = await findFileById(req.userDir, req.params.id);
      if (!filename) return res.status(404).json({ error: 'not found' });
    }
    const text = await fs.readFile(path.join(dir, filename), 'utf8');
    const m = parse(text);
    if (!m) return res.status(500).json({ error: 'unparseable' });
    res.json(m);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PUT — always writes to the scoped user's own folder (admin's new meetings
// land in /data/admin/ just like operators' meetings land in /data/<them>/).
// Synthesis is the only call site; we never need to "update" someone else's
// meeting in place.
app.put('/api/meetings/:id', async (req, res) => {
  try {
    const m = req.body;
    if (!m || !m.id) return res.status(400).json({ error: 'missing id' });
    if (m.id !== req.params.id) return res.status(400).json({ error: 'id mismatch' });
    await ensureUserDir(req.userDir);
    const oldFile = await findFileById(req.userDir, m.id);
    const newFile = filenameFor(m);
    if (oldFile && oldFile !== newFile) {
      await fs.unlink(path.join(req.userDir, oldFile)).catch(() => {});
    }
    await fs.writeFile(path.join(req.userDir, newFile), serialize(m));
    res.json({ ok: true, filename: newFile });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE one — admin can delete any user's meeting; operators only their own
app.delete('/api/meetings/:id', async (req, res) => {
  try {
    if (req.scopedRole === 'admin') {
      const hit = await findFileGlobally(req.params.id);
      if (hit) await fs.unlink(path.join(hit.userDir, hit.filename)).catch(() => {});
      return res.json({ ok: true });
    }
    const f = await findFileById(req.userDir, req.params.id);
    if (f) await fs.unlink(path.join(req.userDir, f)).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// CLEAR — admin wipes every user's folder; operators wipe only their own
app.delete('/api/meetings', async (req, res) => {
  try {
    if (req.scopedRole === 'admin') {
      const users = await listUserDirs();
      let removed = 0;
      for (const u of users) {
        const userDir = path.join(DATA_DIR, u);
        const files = (await fs.readdir(userDir)).filter((f) => f.endsWith('.md'));
        await Promise.all(files.map((f) => fs.unlink(path.join(userDir, f)).catch(() => {})));
        removed += files.length;
      }
      return res.json({ ok: true, removed });
    }
    await ensureUserDir(req.userDir);
    const files = (await fs.readdir(req.userDir)).filter((f) => f.endsWith('.md'));
    await Promise.all(files.map((f) => fs.unlink(path.join(req.userDir, f)).catch(() => {})));
    res.json({ ok: true, removed: files.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

Promise.all([
  seedAdmin().catch((e) => console.error('seedAdmin failed', e)),
  seedTemplates()
    .then(() => migrateTemplates())
    .catch((e) => console.error('seedTemplates failed', e))
]).finally(() => {
  app.listen(PORT, () => {
    console.log(`[minutes-ai-api] listening on :${PORT}, data in ${DATA_DIR}`);
  });
});
