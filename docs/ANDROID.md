# Android client foundation

Suur's Android client will be a Capacitor application with a bundled interface. It will connect to any compatible self-hosted Suur server instead of embedding one fixed website. The server remains the source of truth while the client keeps an encrypted local session token and, in the next phase, a local notes database and mutation queue.

## Server discovery

The client starts by normalizing the user-provided HTTPS address and requesting:

```text
GET /api/mobile/server
```

The response contains the stable server ID, display name, Suur version, mobile API version, supported capabilities, upload limit, and authentication endpoint. The stable server ID prevents data from two servers with the same hostname or display name from being mixed locally.

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
  "clientVersion": "0.2.0"
}
```

The response returns a 256-bit bearer token once. The Android client must store it with the platform's secure credential storage and send it on subsequent API requests:

```http
Authorization: Bearer TOKEN
```

Validate a stored session with `GET /api/mobile/auth/session` and revoke it with `DELETE /api/mobile/auth/session`.

Do not store the user's password, place credentials in the APK, or write bearer tokens to logs. Production mobile sessions require HTTPS. `SUUR_ALLOW_INSECURE_MOBILE=true` exists only for deliberate local development and must not be used for an internet-facing deployment.

## Cross-origin requests

Suur accepts API requests from Capacitor's standard `http://localhost`, `https://localhost`, and `capacitor://localhost` origins. Additional exact origins can be configured as a comma-separated list:

```dotenv
SUUR_ALLOWED_APP_ORIGINS=https://app.example.com
```

Wildcards are intentionally rejected and credential cookies are never enabled for cross-origin requests.

## Next phase

The next Android phase will add the Capacitor project, secure credential storage, server onboarding screens, a local note database, queued offline mutations, conflict handling, and physical-device tests.
