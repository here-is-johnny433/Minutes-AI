# Minutes.AI

A privacy-first single-page web app that turns meeting audio, live microphone dictation, or pasted transcripts into clean, structured Markdown minutes using Google Gemini. Optional pairing of the raw transcript with your own handwritten notes helps the AI resolve context gaps and correct names.

Everything stays on your machine: meetings live as real `.md` files in a folder you choose, the app sends only the synthesis request to Google Gemini (with your own API key), and there is no backend, no analytics, and no cloud database.

---

## ✨ Features

- **Two AI engines, your choice**
  - **Cloud Gemini API** — fast synthesis via `gemini-2.5-flash` REST calls direct from your browser. Requires a free key from Google AI Studio.
  - **On-Device Gemini Nano** *(experimental)* — Chrome's local `LanguageModel` API. Zero network calls; fully offline once the ~2 GB model is cached.
- **Five synthesis templates** — Standard Chronological Minutes, Action-Item Focused, Executive Brief (TL;DR), Technical Engineering Summary, Creative Concept Map. Each template's prompt is editable in Settings.
- **Three input methods** — live microphone dictation (Web Speech API with multi-language support: English, Spanish ES/MX, German, French, Italian, Portuguese, Japanese, Chinese), uploaded audio file (sent to Gemini multimodal), or pasted/uploaded `.txt`/`.md` transcript.
- **File-based archive** — when you pick a folder via the File System Access API, every synthesized meeting is written as a `.md` file there with metadata in an HTML-comment frontmatter. The archive view reflects whatever is in the folder. Per-user subfolders (`<folder>/<username>/...`) isolate accounts. Falls back to `localStorage` when no folder is set or in unsupported browsers.
- **Multi-user local auth** — admin / user roles, isolated per-user meeting archives. All credentials stay in browser storage.
- **Live transcript editor** — interim speech results stream into the textarea in real time; you can edit before synthesizing.

---

## 🚀 Quick start

### Option 1: Docker Compose (recommended)

```bash
git clone https://github.com/here-is-johnny433/Minutes-AI.git
cd Minutes-AI
docker compose up -d
```

Open **http://localhost:8081**.

To change the port, edit the `ports:` mapping in `docker-compose.yml`.

### Option 2: The bash helper

```bash
./run-dev.sh
```

Same effect — it stops/recreates the `minutes-ai-app` container with bind-mounted source for live reload.

### Option 3: Static server (no Docker)

```bash
npx --yes http-server . -p 8080 -c-1
```

Then open **http://localhost:8080**. You'll lose the nginx config's gzip and SPA-fallback niceties, but it's the fastest way to try the app.

---

## 🔐 First login

The API seeds a default administrator account on first boot. Use:

- **Username:** `admin`
- **Password:** `admin123`

Log in, then **change the password immediately** from the **Users** view, and add accounts for your team there. Each user gets their own private archive; admins see everyone's.

Authentication is server-enforced: passwords are scrypt-hashed in the API's data volume (`users.json`) and login issues an HttpOnly session cookie. If you lose the admin password, delete `users.json` from the `meetings_data` volume to re-seed `admin` / `admin123`.

---

## ⚙️ Configuring an AI engine

From the **Settings** view, pick one engine:

### Cloud Gemini API

1. Grab a free key from [Google AI Studio](https://aistudio.google.com/).
2. Select **Cloud Gemini API**.
3. Paste the key. It is stored only in your browser's `localStorage` and is sent only to `generativelanguage.googleapis.com`.

### On-Device Gemini Nano *(experimental)*

Requires Chrome 148+ (or Chrome Dev / Canary) on a machine with 16 GB+ RAM.

1. Open `chrome://flags`.
2. Enable **Optimization Guide On-Device Model** → `Enabled BypassPrefChecks`.
3. Enable **Prompt API for Gemini Nano** (`#prompt-api-for-gemini-nano`).
4. Relaunch Chrome.
5. In Minutes.AI → Settings → select **On-Device Gemini Nano** → **Initialize Model Download** (~2 GB, one-time).

When the badge turns to **Ready**, synthesis runs entirely on your device.

---

## 💾 Where your meetings live

There are two storage tiers:

| Tier | When used | Where |
|---|---|---|
| **Folder-based** | After you pick a folder in **Settings → Meetings Folder** | `<picked-folder>/<username>/<rawDate>-<slug>.md` on your filesystem |
| **Browser-only** | If you have not picked a folder, or your browser doesn't support the File System Access API | `localStorage` key `minutae_meetings_<username>` |

Each `.md` file is human-readable in any Markdown viewer (Obsidian, iA Writer, GitHub, `bat`...). Metadata is in an HTML-comment frontmatter so the rendered view shows the clean minutes only.

Browser support for folder-based storage: **Chrome, Edge, Arc, Brave, Opera**. Safari and Firefox fall back to `localStorage`-only mode.

---

## 🔒 Privacy

- **No server** — the app is a static site. There is no backend collecting anything.
- **No analytics** — no tracking, no telemetry.
- **What leaves your machine** — only the synthesis request you explicitly trigger, sent directly to Google's Gemini API with your own key. (When using Gemini Nano on-device, nothing leaves your machine at all.)
- **Where data lives** — meetings in the folder you pick (or `localStorage` as fallback); users, settings, and API key in `localStorage`.

---

## 🧱 Stack

- Vanilla JavaScript, HTML, CSS — no framework, no build step.
- Served by **nginx** inside a Docker container (or a plain Node static server for the lightweight path).
- Bind-mounted source for hot reload during development.

---

## 📁 Project layout

```
.
├── index.html           Markup
├── app.js               All application logic
├── styles.css           Glassmorphic dark theme
├── nginx.conf           Cache headers, gzip, SPA fallback
├── Dockerfile           nginx:alpine base
├── docker-compose.yml   Bind-mount + port mapping
├── run-dev.sh           One-shot bash launcher (alternative to compose)
└── .claude/launch.json  preview_start config for Claude Code users
```

---

## 📝 License

No license file is included. Treat this as "all rights reserved" until the maintainer adds one.
