// Minutes.AI shared-pool storage backend.
//
// Files are stored as `<rawDate>-<slug>.md` in DATA_DIR with the same
// HTML-comment-frontmatter format the frontend already produces, so a
// human can `cat` them or open them in any markdown viewer.
//
// No auth here on purpose — Caddy's basic_auth is the boundary. Don't
// expose this service to the public internet directly.

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

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function findFileById(id) {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    try {
      const text = await fs.readFile(path.join(DATA_DIR, f), 'utf8');
      const m = parse(text);
      if (m && m.id === id) return f;
    } catch { /* ignore unreadable file */ }
  }
  return null;
}

// Health probe
app.get('/api/health', (_, res) => res.json({ ok: true, dataDir: DATA_DIR }));

// List all meetings (newest first)
app.get('/api/meetings', async (_, res) => {
  try {
    await ensureDir();
    const files = (await fs.readdir(DATA_DIR)).filter((f) => f.endsWith('.md'));
    const meetings = [];
    for (const f of files) {
      try {
        const text = await fs.readFile(path.join(DATA_DIR, f), 'utf8');
        const m = parse(text);
        if (m) meetings.push(m);
      } catch (e) { console.warn('skip', f, e.message); }
    }
    meetings.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));
    res.json(meetings);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Get one meeting
app.get('/api/meetings/:id', async (req, res) => {
  try {
    const f = await findFileById(req.params.id);
    if (!f) return res.status(404).json({ error: 'not found' });
    const text = await fs.readFile(path.join(DATA_DIR, f), 'utf8');
    const m = parse(text);
    if (!m) return res.status(500).json({ error: 'unparseable' });
    res.json(m);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Create or update one meeting
app.put('/api/meetings/:id', async (req, res) => {
  try {
    const m = req.body;
    if (!m || !m.id) return res.status(400).json({ error: 'missing id' });
    if (m.id !== req.params.id) return res.status(400).json({ error: 'id mismatch' });
    await ensureDir();
    // If title changed, the filename changes too — remove the old file
    const oldFile = await findFileById(m.id);
    const newFile = filenameFor(m);
    if (oldFile && oldFile !== newFile) {
      await fs.unlink(path.join(DATA_DIR, oldFile)).catch(() => {});
    }
    await fs.writeFile(path.join(DATA_DIR, newFile), serialize(m));
    res.json({ ok: true, filename: newFile });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Delete one meeting
app.delete('/api/meetings/:id', async (req, res) => {
  try {
    const f = await findFileById(req.params.id);
    if (f) await fs.unlink(path.join(DATA_DIR, f)).catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Wipe all meetings
app.delete('/api/meetings', async (_, res) => {
  try {
    await ensureDir();
    const files = (await fs.readdir(DATA_DIR)).filter((f) => f.endsWith('.md'));
    await Promise.all(files.map((f) => fs.unlink(path.join(DATA_DIR, f)).catch(() => {})));
    res.json({ ok: true, removed: files.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[minutes-ai-api] listening on :${PORT}, data in ${DATA_DIR}`);
});
