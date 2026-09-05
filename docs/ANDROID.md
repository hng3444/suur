# Android client

Suur's Android client is a Capacitor application with a bundled, touch-first interface. It connects to any compatible self-hosted Suur server instead of embedding one fixed website. The server remains authoritative while the client keeps notes, labels, settings, cached attachments, and unsent changes in a separate local database for every server and user.

The client includes a Keep-inspired card layout, search and filters, read and edit modes, checklists, labels, reminders, attachments, multi-select actions, archive, trash, sharing, history, a reminder calendar, profile controls, imports, exports, backups, and administrative settings.

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
  "clientVersion": "0.3.3"
}
```

The response returns a 256-bit bearer token once. The Android client must store it with Android's secure credential storage and send it on subsequent API requests:

```http
Authorization: Bearer TOKEN
```

Validate a stored session with `GET /api/mobile/auth/session` and revoke it with `DELETE /api/mobile/auth/session`.

Do not store the password, place credentials in the APK, log bearer tokens, or put the token in IndexedDB. Production mobile sessions require HTTPS. `SUUR_ALLOW_INSECURE_MOBILE=true` exists only for deliberate local development.

## Local offline database

`IndexedDbMobileSyncStore` provides the durable browser database used by the bundled Capacitor interface. It creates separate storage for every server ID and user ID and contains five stores:

- `notes`: complete local note records and attachment metadata
- `labels`: locally available labels
- `meta`: synchronization cursor and user settings
- `queue`: pending create, update, reorder, delete, label, and settings mutations
- `attachments`: authenticated media cached for offline viewing

The session token is deliberately excluded. Android stores it in an app-private encrypted value backed by Android Keystore. The store exposes a platform-independent interface so a native SQLite adapter can replace IndexedDB later without changing synchronization behavior.

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

## Offline behavior

Text notes, checklists, labels, settings, ordering, archiving, trash operations, and permanent deletion use the durable synchronization queue. Attachments are cached on the device after they have been viewed, so those files remain available offline. Creating a new attachment, public share link, server backup, import, export, user-management change, or history restore still requires a server connection.

## Cross-origin requests

Suur accepts API requests from Capacitor's standard `http://localhost`, `https://localhost`, and `capacitor://localhost` origins. Additional exact origins can be configured as a comma-separated list:

```dotenv
SUUR_ALLOWED_APP_ORIGINS=https://app.example.com
```

Wildcards are rejected and credential cookies are never enabled for cross-origin requests.

## Native capabilities

- Android notification permission and scheduled reminder notifications
- Microphone permission and audio recording
- Native file picker for images and supported documents
- Android share sheet for note links and exported files
- Android Keystore-backed bearer-session storage
- Bundled application UI that starts without loading a remote website

## Build a debug APK

Install dependencies, synchronize the Android project, and build:

```bash
npm ci
npm run mobile:sync
cd android
./gradlew assembleDebug
```

The debug APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Open the Android project with `npm run mobile:android` when an emulator or signed release build is needed.
