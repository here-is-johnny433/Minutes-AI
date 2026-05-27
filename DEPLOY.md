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
Internet  →  Caddy (TLS + basic_auth)  →  docker web-net  →  minutes-ai-app  →  nginx  →  static SPA
```

The app container has **no host port mapping** — Caddy reaches it by container name (`minutes-ai-app`) over a shared docker network called `web-net`. Bypassing Caddy from the public internet is therefore impossible.

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

3. **Configure `/opt/caddy/Caddyfile`** with a site block for Minutes-AI. Pick a subdomain you control (its DNS A/AAAA must point at this server) and a basic-auth password:

   ```caddyfile
   {
     email you@yourdomain.com
   }

   minutes.example.com {
     basic_auth {
       admin <BCRYPT_HASH>
     }
     reverse_proxy minutes-ai-app:80
   }
   ```

   Generate the bcrypt hash:

   ```bash
   docker run --rm caddy:latest caddy hash-password --plaintext 'YOUR_STRONG_PASSWORD'
   ```

   Paste the resulting `$2a$14$…` string in place of `<BCRYPT_HASH>`.

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

### What you get

- HTTPS with auto-renewing Let's Encrypt cert
- Basic auth gate (single shared password — see "Limitations" below)
- All app security headers (CSP, X-Frame-Options, etc.) pass through Caddy intact
- No public listener on port 8081

### Updating the app

```bash
ssh your-server
cd Minutes-AI
git pull
docker compose up -d --force-recreate
```

Bind-mounted source files (`app.js`, `index.html`, `styles.css`) update on refresh — no recreate needed. **Recreate only when `nginx.conf` changes** (it's a single-file mount).

---

## Limitations

- **Caddy `basic_auth` is one shared password.** To revoke one person, you have to rotate the password for everyone. For per-user auth, replace `basic_auth` with `forward_auth` against an oauth2-proxy, or front everything with Cloudflare Access.
- **The in-app login is decorative.** Cloudflare / Caddy / whatever-you-put-in-front is the real boundary. The app's `admin` / operator roles are UX, not security.
- **Default seeded credentials are `admin` / `admin123`.** Change the admin password on first boot, or your first visitor becomes admin.
- **Storage layout assumes per-user-on-this-browser.** The "Meetings Folder" feature picks a directory in the user's filesystem via the File System Access API; that's per-browser-profile. If you want truly shared meeting archives across machines, you need a backend (out of scope here).
