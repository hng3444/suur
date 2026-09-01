# Suur — private, self-hosted notes that work offline

Suur is a fast, multilingual, self-hosted note-taking app for people who like the simplicity of Google Keep but want full control of their data. It runs as one Docker container, stores everything in SQLite and `/data`, installs as a PWA, and keeps text edits available when the network drops.

**Keywords:** self-hosted notes, offline-first notes app, private Google Keep alternative, Docker note-taking app, CasaOS notes, SQLite PWA.

## Screenshots

### Home
![Suur Home](screenshots/suur%20home.png)

### Notes
![Suur Home](screenshots/suur%20home%202.png)

### Edit Mode
![Suur Edit Mode](screenshots/suur%20edit%20mode.png)

### Read Mode
![Suur Read Mode](screenshots/suur%20read%20mode.png)

### To-do List
![Suur To-do List](screenshots/suur%20to%20do%20list%20edit%20mode.png)

### Settings
![Suur Settings](screenshots/suur%20settings.png)

## Why Suur?

- Familiar card-based workflow without copying Google branding or assets
- Notes, labels, accounts, settings, backups, and uploads stay on your server
- Real offline app shell plus an IndexedDB edit queue that syncs after reconnection
- One-command Docker installation with a persistent `/data` volume
- Responsive desktop and mobile UI, dark mode, and installable PWA
- English, Chinese, Hindi, Spanish, Arabic, French, Bengali, Portuguese, Russian, and Turkish

## Feature overview

- Text notes, checklists, Markdown editing, and safe Markdown preview
- Pinning, custom pin order, archive, trash, and configurable automatic trash cleanup
- Labels, colors, reminders, browser notifications, search, and advanced filters
- Grid/list layouts, drag-to-sort, keyboard shortcuts, and note templates
- Multi-select actions for labels, archive, trash, restore, and permanent deletion
- Images, audio recordings, PDFs, and office-document attachments with drag and drop
- Read mode with an explicit edit action, note duplication, version history, and restore
- Read-only public note links, user assignment, and a reminder calendar
- Automatic daily/weekly server backups plus manual backup download and restore
- JSON, Markdown, and TXT export; Suur, JSON, Markdown, and Google Keep import
- Multi-user accounts, profile photos, roles, per-user storage quotas, and secure sessions
- Theme, accent color, layout, language, and checklist behavior settings

## Quick start with Docker Compose

Requirements: Docker Engine and Docker Compose v2.

```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://SERVER_IP:3721`.

The initial account is created only when the database is empty:

```text
Username: alaferoce
Password: 7Admin7
Role: superadmin
```

Suur blocks access to the rest of the application until this built-in password is changed in **Settings → Profile**. You can override the initial credentials in `.env` before the first start.

Change the host port without editing Compose:

```dotenv
SUUR_PORT=8088
SUUR_PUBLIC_URL=https://notes.example.com
# Set this only when every request reaches Suur through your trusted proxy.
SUUR_TRUST_PROXY=true
```

Check the deployment:

```bash
docker compose ps
docker compose logs -f suur
```

## Use the prebuilt container image

Images for `linux/amd64` and `linux/arm64` are published from `main`:

```text
ghcr.io/hng3444/suur:latest
```

Minimal Compose example:

```yaml
services:
  suur:
    image: ghcr.io/hng3444/suur:latest
    restart: unless-stopped
    ports:
      - "3721:3000"
    environment:
      DATA_DIR: /data
      SUUR_PUBLIC_URL: http://localhost:3721
    volumes:
      - suur-data:/data

volumes:
  suur-data:
```

## CasaOS

For the manual installer use:

- Image: `ghcr.io/hng3444/suur:latest`
- Container port: `3000`
- Host port: `3721` or any available port
- Host path: `/DATA/AppData/suur/data`
- Container path: `/data`
- Restart policy: `unless-stopped`

The ready-to-submit CasaOS v2 source manifest is available at [`casaos/docker-compose.yml`](casaos/docker-compose.yml). It follows the current official `x-casaos` source format.

## Data, updates, and backups

All persistent application data lives below `/data`:

```text
/data/suur.db
/data/suur.db-wal
/data/suur.db-shm
/data/uploads/
/data/backups/
```

Rebuilding or replacing the container does not remove the volume. Update with:

```bash
docker compose pull
docker compose up -d
```

You can also download a complete portable ZIP from **Settings → Data & backup**. It contains the user's notes, labels, settings, and attachments. A server-side scheduler creates enabled daily or weekly backups even when no browser is open and retains the latest 14 archives per user.

## Offline behavior and future Android APK

After a successful sign-in, the service worker stores a private application shell and static assets. Notes and labels are cached per user in IndexedDB. Text/checklist changes made offline are queued with mutation IDs, replayed after reconnection, and protected by note-version conflict detection.

An internet connection is still required to sign in for the first time, upload a new attachment, create a public link, or synchronize with the server. The same responsive, offline-capable web layer is suitable for a future Android Trusted Web Activity or native wrapper; see [`docs/ANDROID.md`](docs/ANDROID.md).

## Security model

- Passwords are hashed with scrypt and a unique random salt
- Session tokens are stored as SHA-256 hashes; cookies are HttpOnly and SameSite=Strict
- HTTPS cookies are enabled when `SUUR_PUBLIC_URL` starts with `https://`
- Every note, label, setting, upload, backup, and offline cache is scoped to a user
- API input is validated with Zod and uploads use allowlisted MIME types and size/quota checks
- A forced default-password change is enforced by the API, not only by the interface
- Attachment responses are sandboxed; non-media files download instead of running in the Suur origin
- The production container runs as an unprivileged user with `no-new-privileges`
- CSP, frame blocking, MIME sniffing protection, and a restrictive permissions policy are enabled

For an internet-facing deployment, use HTTPS through Cloudflare Tunnel or another trusted reverse proxy, protect the CasaOS administration panel separately, and never keep the default password.

## Development

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm run lint
npm run build
```

Architecture details are in [`ARCHITECTURE.md`](ARCHITECTURE.md). Security reporting guidance is in [`SECURITY.md`](SECURITY.md).

## Project status

Suur is under active development. Test backups and upgrades on non-critical data before relying on a new release. Contributions and focused bug reports are welcome.
