// Minutes.AI per-user storage backend.
//
// Files are stored as `<DATA_DIR>/<sanitized-username>/<rawDate>-<slug>.md`
// with the same HTML-comment-frontmatter format the frontend already
// produces, so a human can `cat` them or open them in any markdown viewer.
//
// No real auth here — Caddy's basic_auth is the actual boundary at the
// edge. The X-Minutes-User header that scopes per-user files is trusted
// best-effort organizational metadata. Anyone past Caddy who knows the
// API contract could spoof another username via DevTools. Don't treat the
// per-user separation as a security guarantee — it's a file-organization
// convenience for "small team that trusts each other but wants their own
// archive views."

const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || '/data';

app.use(express.json({ limit: '25mb' })); // long transcripts can get big
app.disable('x-powered-by');

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

// Admin usernames. In production these are the Caddy basic_auth users you
// want to grant cross-user visibility. 'local' is always admin so local
// dev (no gateway, no injected header) works without configuration.
const ADMIN_USERS = (process.env.ADMIN_USERS || 'admin')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  .concat('local');

// Identity comes from the X-Minutes-User header, which in production is
// injected by Caddy from the verified basic_auth login (the browser can't
// spoof it). In local dev there's no gateway, so we fall back to a 'local'
// admin identity. Role is always computed server-side from ADMIN_USERS —
// never trusted from the client.
function resolveIdentity(req) {
  const u = sanitizeUser(req.get('X-Minutes-User'));
  if (!u) return { username: 'local', role: 'admin', authed: false };
  return { username: u, role: ADMIN_USERS.includes(u) ? 'admin' : 'operator', authed: true };
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

// Health probe (no user scope)
app.get('/api/health', (_, res) => res.json({ ok: true, dataDir: DATA_DIR }));

// Identity probe — the frontend calls this on boot to learn who it is
// (from the Caddy-injected header) instead of showing its own login.
app.get('/api/whoami', (req, res) => res.json(resolveIdentity(req)));

// User-scope middleware. Identity + role are resolved server-side from the
// (Caddy-verified) X-Minutes-User header — never trusted from client JS.
app.use('/api/meetings', (req, res, next) => {
  const id = resolveIdentity(req);
  req.scopedUser = id.username;
  req.scopedRole = id.role;
  req.userDir = path.join(DATA_DIR, id.username);
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

app.listen(PORT, () => {
  console.log(`[minutes-ai-api] listening on :${PORT}, data in ${DATA_DIR}`);
});
