# Android client foundation

Suur's Android client is designed as a Capacitor application with a bundled interface. It connects to any compatible self-hosted Suur server instead of embedding one fixed website. The server remains authoritative while the client keeps notes, labels, settings, and unsent changes in a per-server, per-user local database.

Version 0.3.0 completes the offline storage and synchronization foundation. The native Android shell and screens are the next phase.

## Server discovery

Normalize the user-provided HTTPS address and request:

```text
GET /api/mobile/server
```

The response contains the stable server ID, display name, Suur version, mobile API version, supported capabilities, upload limit, authentication endpoint, and synchronization endpoint. The stable server ID prevents data from different Suur installations from being mixed locally.

## Mobile authentication

Create a mobile session:

```http
POST /api/mobile/auth/session
Content-Type: application/json

{
  "username": "user",
  "password": "password",
  "deviceName": "Galaxy S23",
  "platform": "android",
  "clientVersion": "0.3.0"
}
```

The response returns a 256-bit bearer token once. The Android client must store it with Android's secure credential storage and send it on subsequent API requests:

```http
Authorization: Bearer TOKEN
```

Validate a stored session with `GET /api/mobile/auth/session` and revoke it with `DELETE /api/mobile/auth/session`.

Do not store the password, place credentials in the APK, log bearer tokens, or put the token in IndexedDB. Production mobile sessions require HTTPS. `SUUR_ALLOW_INSECURE_MOBILE=true` exists only for deliberate local development.

## Local offline database

`IndexedDbMobileSyncStore` provides the durable browser database used by the bundled Capacitor interface. It creates separate storage for every server ID and user ID and contains four stores:

- `notes`: complete local note records and attachment metadata
- `labels`: locally available labels
- `meta`: synchronization cursor and user settings
- `queue`: pending create, update, reorder, delete, label, and settings mutations

The session token is deliberately excluded. The Android shell will keep it in secure native storage in the next phase. The store exposes a platform-independent interface so a native SQLite adapter can replace IndexedDB later without changing synchronization behavior.

## Initial synchronization

The first synchronization requests a consistent snapshot:

```text
GET /api/mobile/sync
```

The response includes all notes visible to the user, labels, settings, and a numeric cursor. Archived and trashed notes are included because the local client must work without the server.

## Incremental synchronization

Later requests send the saved cursor:

```text
GET /api/mobile/sync?cursor=42
```

Only entities changed after that cursor are returned. Results are ordered, paginated, and include deletion tombstones, so a deleted note cannot reappear after reconnection. The server keeps one current change record per user and entity rather than an ever-growing history.

If a restored server has an older cursor, it returns `SYNC_RESET_REQUIRED`. The client then obtains a fresh snapshot. Every response includes the server ID and user ID; a mismatch is rejected before local data can be changed.

## Uploading queued changes

Offline edits are stored as durable operations with a unique mutation ID. On reconnection, the client:

1. Compacts repeated autosaves for the same note.
2. Uploads queued operations in creation order.
3. Sends the mutation ID in `X-Suur-Mutation-Id`.
4. Removes an operation only after the server confirms it.
5. Downloads incremental server changes.

Mutation IDs are scoped to the authenticated user and make retries safe when a response is lost. The queue only accepts known Suur API paths and never follows redirects, preventing a bearer token from being forwarded to another host.

## Conflict behavior

Note updates contain the version that was edited. If another device changed the same note first, the server returns `VERSION_CONFLICT`. The mobile synchronization engine preserves the offline text as a deterministic separate note named `(... offline copy)` instead of silently overwriting either version.

## Current offline limits

Text notes, checklists, labels, settings, ordering, archiving, trash operations, and permanent deletion can use the synchronization queue. Existing attachment metadata is available offline, but downloading attachment bytes for offline viewing and uploading new files while offline are reserved for a later media-cache phase.

## Cross-origin requests

Suur accepts API requests from Capacitor's standard `http://localhost`, `https://localhost`, and `capacitor://localhost` origins. Additional exact origins can be configured as a comma-separated list:

```dotenv
SUUR_ALLOWED_APP_ORIGINS=https://app.example.com
```

Wildcards are rejected and credential cookies are never enabled for cross-origin requests.

## Next phase

The next Android phase creates the Capacitor project and native application shell, adds the server-address and sign-in screens, stores the bearer token with Android secure credentials, connects the interface to this local database, and produces the first debug APK.
