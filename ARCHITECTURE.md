# Suur architecture

Suur is a modular monolith packaged as one container. This keeps installation, maintenance, backup, and upgrades straightforward while avoiding an unnecessary network boundary between the web UI and REST API.

## Request and data flow

1. The Next.js client uses an HttpOnly session cookie; mobile clients use a revocable bearer session against the same authenticated `/api/*` route handlers.
2. Zod validates request bodies, query values, identifiers, settings, and user input.
3. The repository layer performs authorization-aware SQLite operations.
4. `better-sqlite3` stores structured data in `/data/suur.db` using WAL mode.
5. Uploaded files live below `/data/uploads`; their ownership and metadata stay in SQLite.
6. A private service-worker cache stores the authenticated application shell and static assets.
7. A per-user IndexedDB database caches notes and queues offline mutations.
8. Reconnection replays idempotent mutations. Version conflicts preserve the client content as a separate conflict copy.

## Main directories

```text
app/
  api/                    REST route handlers
  api/mobile/             server discovery and mobile session endpoints
  s/[token]/              public read-only note page
  globals.css             design system and responsive layouts
  layout.tsx              PWA and metadata configuration
components/
  suur-app.tsx            application state, sync, filters, bulk actions
  note-card.tsx           grid/list card and selection behavior
  note-editor.tsx         autosaving editor, attachments, audio, Markdown
  note-viewer.tsx         read mode, history, sharing, duplication
  calendar-view.tsx       reminder calendar
lib/
  auth.ts                 scrypt passwords and session management
  cors.ts                 exact native-app origin allowlist
  db.ts                   SQLite setup and additive migrations
  repository.ts           authorized data-access layer
  portable.ts             export, import, backup, and restore
  validation.ts           Zod schemas
  offline.ts              IndexedDB cache and mutation queue
  i18n.ts                 ten-language message catalog
public/
  sw.js                   private offline shell and asset caching
  manifest.webmanifest    installable PWA manifest
casaos/
  docker-compose.yml      CasaOS App Store source manifest
```

`proxy.ts` handles API preflight requests and adds the mobile API version and restricted CORS headers. Authentication and authorization remain inside the route and repository layers.

## Persistent storage

Everything that must survive a container replacement is below `/data`:

```text
/data/suur.db
/data/suur.db-wal
/data/suur.db-shm
/data/uploads/*
/data/backups/<user-id>/*
```

Docker Compose mounts this directory from `suur-data` by default. CasaOS uses `/DATA/AppData/suur/data:/data`.

## Offline synchronization

The service worker caches a successful authenticated navigation under a private synthetic key. It never places note-list API responses in a shared HTTP cache. Structured note data is stored in a user-namespaced IndexedDB database instead.

Offline create, patch, reorder, and delete operations receive unique mutation IDs. The server records processed IDs for 30 days, making reconnect retries idempotent. Note updates include a base version. If another device changed the same note, Suur creates a conflict copy instead of silently overwriting client content.

Signing out deletes the private service-worker cache and the current user's IndexedDB database from that browser.

## Backup model

A portable Suur backup is a ZIP archive containing `manifest.json` and attachment bytes. Import is non-destructive: notes and attachment IDs are regenerated and labels are matched by name. Automatic daily or weekly backups are checked by the server-side maintenance scheduler and retain the latest 14 archives per user.

## Security boundaries

- The server is authoritative for authentication, ownership, assignment, quotas, and validation.
- Web sessions use HttpOnly cookies. Mobile sessions use 256-bit bearer tokens whose SHA-256 hashes, type, device description, and expiry are stored in SQLite.
- Cross-origin access is limited to Capacitor origins and explicitly configured exact origins; wildcard origins and cross-origin credential cookies are rejected.
- Assigned users may edit an assigned note; only its owner can permanently delete or publish it.
- Public sharing uses a random opaque token whose SHA-256 hash is stored in SQLite.
- Markdown is rendered as React elements without injecting raw HTML.
- Attachment MIME types, file sizes, filenames, ownership, and per-user quotas are checked server-side.
- Private instance pages opt out of search indexing even though the public project documentation is search-friendly.
