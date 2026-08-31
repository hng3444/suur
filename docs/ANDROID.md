# Android APK readiness

Suur's responsive UI, web manifest, service worker, private offline shell, and IndexedDB mutation queue form the reusable layer for an Android package.

The recommended future packaging path is a Trusted Web Activity generated with Bubblewrap. It keeps the production server as the synchronization source while presenting Suur as a standalone Android app. The public HTTPS origin must serve a valid Digital Asset Links file containing the final Android package name and signing-certificate fingerprint.

Before producing a release APK:

1. Choose a permanent HTTPS origin and Android application ID.
2. Generate and securely store the Android signing key.
3. Add `/.well-known/assetlinks.json` with the real certificate fingerprint.
4. Generate the TWA project and configure the start URL as `/`.
5. Verify offline cold start, queued edits, file permissions, microphone permission, and reconnection on physical devices.
6. Build signed AAB/APK artifacts through a reproducible CI release workflow.

Do not place server credentials or a GitHub token inside the APK. Users still authenticate to their own Suur server, and synchronization remains protected by the existing session and API authorization model.
