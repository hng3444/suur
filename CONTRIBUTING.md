# Contributing to Suur

Focused fixes and small, well-tested improvements are welcome.

1. Create a branch from `main`.
2. Keep changes modular and preserve backward-compatible SQLite migrations.
3. Run `npm run lint` and `npm run build`.
4. Test desktop, a narrow mobile viewport, offline reopening, and Docker startup when relevant.
5. Describe user-visible behavior, data migrations, and security impact in the pull request.

Never commit real notes, databases, access tokens, passwords, `.env` files, or `/data` contents.
