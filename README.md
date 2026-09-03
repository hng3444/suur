# Suur — Open-source, self-hosted Google Keep alternative

Suur is an offline-first, self-hosted note-taking app inspired by the simplicity of Google Keep. Run it with Docker or CasaOS and keep full control of your notes and data.

It runs as a single Docker container, stores persistent data in SQLite under `/data`, installs as a PWA, and keeps text and checklist edits available when the network drops.

**Current release:** `v0.3.0`

**Keywords:** self-hosted notes, offline-first notes app, private Google Keep alternative, Docker note-taking app, CasaOS notes, SQLite PWA.

---

## Screenshots

<table>
<tr>
<td width="50%" align="center">
<strong>Home</strong><br><br>
<img src="screenshots/suur%20home.png" alt="Suur Home">
</td>
<td width="50%" align="center">
<strong>Notes</strong><br><br>
<img src="screenshots/suur%20home%202.png" alt="Suur Notes">
</td>
</tr>

<tr>
<td width="50%" align="center">
<strong>Edit Mode</strong><br><br>
<img src="screenshots/suur%20edit%20mode.png" alt="Suur Edit Mode">
</td>
<td width="50%" align="center">
<strong>Read Mode</strong><br><br>
<img src="screenshots/suur%20read%20mode.png" alt="Suur Read Mode">
</td>
</tr>

<tr>
<td width="50%" align="center">
<strong>To-do List</strong><br><br>
<img src="screenshots/suur%20to%20do%20list%20edit%20mode.png" alt="Suur To-do List">
</td>
<td width="50%" align="center">
<strong>Settings</strong><br><br>
<img src="screenshots/suur%20settings.png" alt="Suur Settings">
</td>
</tr>
</table>

---

## Why Suur?

- Familiar card-based workflow without copying Google branding or assets
- Your notes, labels, accounts, settings, backups, and uploads stay on your server
- Real offline app shell with an IndexedDB edit queue that syncs after reconnection
- Versioned mobile synchronization API with snapshots, incremental cursors, and deletion tombstones
- Single-container Docker deployment with persistent `/data` storage
- Responsive desktop and mobile interface
- Dark mode
- Installable PWA
- Multi-user support
- Available in English, Chinese, Hindi, Spanish, Arabic, French, Bengali, Portuguese, Russian, and Turkish

---

## Features

### Notes and organization

- Text notes
- Checklists
- Markdown editing
- Safe Markdown preview
- Pinning and custom pin order
- Archive
- Trash
- Configurable automatic trash cleanup
- Labels
- Note colors
- Reminders
- Browser notifications
- Search
- Advanced filters
- Grid and list layouts
- Drag-to-sort
- Keyboard shortcuts

### Productivity

- Multi-select actions
- Bulk labels
- Bulk archive and trash
- Restore and permanent deletion
- Read mode with explicit edit action
- Note duplication
- Version history and restore
- Reminder calendar

### Attachments

- Images
- Audio recordings
- PDFs
- Office documents
- Drag-and-drop uploads

### Sharing and collaboration

- Read-only public note links
- User assignment
- Multi-user accounts
- User roles
- Per-user storage quotas
- Profile photos

### Import and export

- Suur backup import/export
- JSON export
- Markdown export
- TXT export
- Markdown import
- Google Keep import
- Portable backup archives

### Customization

- Light and dark themes
- Accent colors
- Grid/list layout
- Multiple languages
- Checklist behavior settings

---

## Quick start with Docker Compose

### Requirements

- Docker Engine
- Docker Compose v2

Clone the repository and start Suur:

```bash
cp .env.example .env
docker compose up -d --build
```

Open:

```text
http://SERVER_IP:3721
```

### Initial account

The initial account is created only when the database is empty:

```text
Username: alaferoce
Password: 7Admin7
Role: superadmin
```

Suur blocks access to the rest of the application until the built-in password is changed in:

**Settings → Profile**

You can override the initial credentials in `.env` before the first start.

### Custom port and public URL

```dotenv
SUUR_PORT=8088
SUUR_PUBLIC_URL=https://notes.example.com

# Enable only when every request reaches Suur through a trusted proxy.
SUUR_TRUST_PROXY=true
```

### Check the deployment

```bash
docker compose ps
docker compose logs -f suur
```

---

## Docker image

Prebuilt Docker images for `linux/amd64` and `linux/arm64` are published to GitHub Container Registry.

Latest:

```text
ghcr.io/hng3444/suur:latest
```

Current release:

```text
ghcr.io/hng3444/suur:v0.3.0
```

### Minimal Compose example

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

---

## Updating Suur

When using the `latest` image:

```bash
docker compose pull
docker compose up -d
```

This pulls the newest published Docker image and recreates the container while preserving `/data`.

You can verify the running containers with:

```bash
docker compose ps
```

### CasaOS

When Suur is installed in CasaOS using:

```text
ghcr.io/hng3444/suur:latest
```

you can normally update it from the CasaOS interface using:

**Suur → Update and Restart**

after a new Docker image has been published.

Persistent data remains separate from the application container.

---

## CasaOS installation

For a manual CasaOS installation use:

```text
Image:          ghcr.io/hng3444/suur:latest
Container port: 3000
Host port:      3721
Host path:      /DATA/AppData/suur/data
Container path: /data
Restart policy: unless-stopped
```

The CasaOS v2 source manifest is available at:

[`casaos/docker-compose.yml`](casaos/docker-compose.yml)

It follows the `x-casaos` source format.

---

## Persistent data

All persistent Suur application data lives under:

```text
/data
```

Typical contents:

```text
/data/suur.db
/data/suur.db-wal
/data/suur.db-shm
/data/uploads/
/data/backups/
```

The Docker container itself is disposable.

Rebuilding, updating, or replacing the container does not remove your notes as long as `/data` remains mounted to persistent storage.

---

## Backups

A complete portable backup can be downloaded from:

**Settings → Data & backup**

Backups can contain:

- Notes
- Checklists
- Labels
- Settings
- Attachments
- Application metadata

Suur can also create automatic server-side backups on a daily or weekly schedule.

The backup scheduler runs on the server even when no browser is open.

The latest 14 backup archives per user are retained.

---

## Offline behavior

After a successful sign-in, Suur's service worker stores the private application shell and static assets locally.

Notes and labels are cached per user in IndexedDB.

Text and checklist changes made while offline are:

1. Stored locally
2. Added to an offline mutation queue
3. Replayed after reconnection
4. Confirmed with user-scoped mutation IDs so retries cannot duplicate changes
5. Followed by incremental server changes and deletion records
6. Preserved as a separate offline copy if another device edited the same version

An internet connection is still required for:

- First sign-in
- Uploading new attachments
- Creating public links
- Synchronizing changes with the server

---

## PWA and Android client foundation

Suur can be installed as a Progressive Web App on supported desktop and mobile browsers.

Version 0.3.0 completes the offline storage and synchronization foundation for a proper Capacitor client that can connect to any compatible self-hosted Suur instance. It includes server discovery, API capability negotiation, revocable 256-bit bearer sessions, a per-server and per-user local database, a durable mutation queue, incremental cursor synchronization, deletion tombstones, and conflict copies. The native Android shell and first debug APK are the next development phase.

See:

[`docs/ANDROID.md`](docs/ANDROID.md)

---

## Security

Suur includes several security measures:

- Passwords are hashed with scrypt and a unique random salt
- Session tokens are stored as SHA-256 hashes
- Mobile bearer tokens are returned only when created and expire after 90 days
- Production mobile sign-in requires HTTPS
- Cross-origin API access uses an exact allowlist and never enables credential cookies
- Authentication cookies are HttpOnly
- Cookies use `SameSite=Strict`
- HTTPS cookies are enabled when `SUUR_PUBLIC_URL` starts with `https://`
- Notes, labels, settings, uploads, backups, and offline caches are scoped per user
- API input is validated with Zod
- Uploads use allowlisted MIME types
- Upload size and quota checks are enforced
- Default-password changes are enforced by the API
- Attachment responses are sandboxed
- Non-media files are downloaded instead of executed in the Suur origin
- Production containers run as an unprivileged user
- `no-new-privileges` is enabled
- Content Security Policy is enabled
- Frame blocking is enabled
- MIME sniffing protection is enabled
- Restrictive browser permissions policies are used

For an internet-facing deployment:

- Use HTTPS
- Use Cloudflare Tunnel or another trusted reverse proxy
- Protect your CasaOS administration interface separately
- Never keep the default password

---

## Development

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

### Quality checks

```bash
npm run lint
npm run build
```

Architecture documentation:

[`ARCHITECTURE.md`](ARCHITECTURE.md)

Security reporting:

[`SECURITY.md`](SECURITY.md)

---

## Releases

Suur uses semantic versioning during development.

Examples:

```text
v0.1.1  Bug fixes and small improvements
v0.1.2  Patch release
v0.2.0  New features or larger changes
v0.3.0  Offline mobile synchronization foundation
v1.0.0  First stable release
```

Docker builds from the main development branch are published as:

```text
ghcr.io/hng3444/suur:latest
```

Stable releases can additionally be published with versioned tags such as:

```text
ghcr.io/hng3444/suur:v0.3.0
```

---

## Project status

Suur is under active development.

The current release is:

```text
v0.3.0
```

Test backups and upgrades on non-critical data before relying on a new release.

Contributions and focused bug reports are welcome.
