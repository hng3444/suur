# Security policy

## Reporting a vulnerability

Please do not publish exploit details in a public issue. Open a private GitHub security advisory for this repository and include the affected version, reproduction steps, impact, and any suggested mitigation.

## Deployment guidance

- Change the initial password immediately.
- Put Suur behind HTTPS and set `SUUR_PUBLIC_URL` to the public HTTPS origin.
- Keep `SUUR_ALLOW_INSECURE_MOBILE=false` outside isolated local development.
- Add `SUUR_ALLOWED_APP_ORIGINS` only when a custom client origin is required; never use a wildcard.
- Keep mobile bearer tokens in Android secure credential storage. Never place them in IndexedDB, backups, logs, or exported notes.
- Do not expose the CasaOS administration panel directly to the internet.
- Keep Docker, CasaOS, the reverse proxy, and Suur updated.
- Download and test backups regularly.
- Treat anyone with filesystem access to `/data` as a trusted administrator.

Suur does not currently provide end-to-end encryption. Data is protected by server access controls, HTTPS in transit, the host filesystem, and the mobile operating system's application sandbox. Anyone with unlocked access to a device may be able to read that device's offline note cache.
