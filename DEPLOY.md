# Deployment

There are two supported shapes: **local dev** (your laptop, no TLS, no auth) and **production** (a server behind a Caddy reverse proxy that terminates TLS and gates the site with basic auth).

The repo's `docker-compose.yml` ships configured for **production**. Local dev needs a one-time `docker-compose.override.yml` (see below).

---

## Local development

```bash
git clone https://github.com/here-is-johnny433/Minutes-AI.git
cd Minutes-AI
cp docker-compose.override.example.yml docker-compose.override.yml
docker compose up -d
```

Open **http://localhost:8081**. Hot-reload via the bind mount: edit `index.html`, `app.js`, or `styles.css` and refresh.

`docker-compose.override.yml` is git-ignored — your local port mapping never gets pushed.

---

## Production (Caddy reverse proxy)

### Architecture

```
Internet  →  Caddy (TLS only)  →  docker web-net  →  minutes-ai-app (nginx + static SPA)
                                                                  │
                                                                  │ /api/* (default docker network)
                                                                  ↓
                                                          minutes-ai-api (Node + Express)
                                                          login → HttpOnly session cookie
                                                                  │
                                                                  ↓
                                                  meetings_data volume (users.json + per-user .md files)
```

- **Authentication is in the app itself.** The api service owns the user store (`users.json`, scrypt-hashed passwords) and issues an HMAC-signed, HttpOnly session cookie at login. Every `/api/meetings` and `/api/users` request is validated against that cookie, with the role taken from the stored record — nothing the client sends can be spoofed. Caddy does **TLS only**, no basic_auth gate.
- The **app container** has no host port mapping — Caddy reaches it by container name (`minutes-ai-app`) over the `web-net` docker network.
- The **api container** has no host port mapping at all — only the app container reaches it over the default docker network, and the app's nginx proxies `/api/*` to it. Users and per-user `.md` meeting files live in the `meetings_data` named volume and survive rebuilds.

### One-time server setup

1. **Create the shared network** (only the first time you ever deploy something behind this Caddy):

   ```bash
   docker network create web-net
   ```

2. **Run Caddy** as its own container on `web-net`, with port 80 + 443 published. Example `docker-compose.yml` for Caddy:

   ```yaml
   services:
     caddy:
       image: caddy:latest
       container_name: caddy
       restart: unless-stopped
       ports:
         - "80:80"
         - "443:443"
         - "443:443/udp"
       volumes:
         - /opt/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
         - caddy_data:/data
         - caddy_config:/config
       networks:
         - web-net

   networks:
     web-net:
       external: true

   volumes:
     caddy_data:
     caddy_config:
   ```

3. **Configure `/opt/caddy/Caddyfile`** with a site block for Minutes-AI. Pick a subdomain you control (its DNS A/AAAA must point at this server). No basic_auth — the app handles login itself:

   ```caddyfile
   {
     email you@yourdomain.com
   }

   minutes.example.com {
     reverse_proxy minutes-ai-app:80
   }
   ```

4. **Deploy the app**:

   ```bash
   git clone https://github.com/here-is-johnny433/Minutes-AI.git
   cd Minutes-AI
   docker compose up -d
   ```

5. **Reload Caddy** to pick up the new site block:

   ```bash
   docker exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```

Caddy obtains a Let's Encrypt cert automatically on first request to `minutes.example.com`.

5. **Log in and secure the admin account.** Visit `https://minutes.example.com`, sign in with the seeded `admin` / `admin123`, then go to **Users → Reset Pass** and set a strong password. Add teammates from the same screen (each gets their own login and their own private archive; admins see everyone's).

### What you get

- HTTPS with auto-renewing Let's Encrypt cert
- Real per-user login (session cookies), passwords scrypt-hashed server-side
- Per-user meeting isolation; admins see all, operators see only their own
- All app security headers (CSP, X-Frame-Options, etc.) pass through Caddy intact
- No public listener on port 8081

### Session secret

The api auto-generates a session-signing secret and persists it in the data volume (`.session_secret`), so logins survive restarts. To pin it explicitly (e.g. to share across replicas), set `SESSION_SECRET` on the `api` service in `docker-compose.yml`.

### Updating the app

```bash
ssh your-server
cd Minutes-AI
git pull
docker compose up -d --force-recreate
```

Bind-mounted source files (`app.js`, `index.html`, `styles.css`) update on refresh — no recreate needed. **Recreate only when `nginx.conf` changes** (it's a single-file mount) **or when `api/server.js` changes** (the api container needs a rebuild + restart to pick up backend changes — `docker compose up -d --build`).

### Inspecting / backing up meeting storage

The api container persists every meeting to `/data/<rawDate>-<slug>.md` inside a docker named volume:

```bash
# List all meeting files on the host
docker run --rm -v meeting-ai_meetings_data:/data alpine ls -la /data

# Tarball backup of the whole archive
docker run --rm -v meeting-ai_meetings_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/minutes-ai-meetings-$(date +%F).tar.gz -C /data .
```

---

## Limitations

- **Default seeded credentials are `admin` / `admin123`.** Change the admin password immediately on first login, or your first visitor becomes admin.
- **No password-reset email / account recovery.** An admin resets any user's password from the Users screen. If you lose the only admin password, reset it by editing `users.json` in the data volume (delete the file to re-seed `admin`/`admin123`).
- **No login rate-limiting yet.** For a public deployment, consider adding a rate limit in Caddy (or fail2ban) in front of `/api/auth/login`.
- **Storage layout assumes per-user-on-this-browser.** The "Meetings Folder" feature picks a directory in the user's filesystem via the File System Access API; that's per-browser-profile. If you want truly shared meeting archives across machines, you need a backend (out of scope here).
