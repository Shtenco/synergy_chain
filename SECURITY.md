# Security policy

## Secrets

Do not commit real API keys, access tokens, passwords, cookies, private keys, populated databases or production logs.

The public GitHub Pages deployment contains only files extracted from `public/`. It does not publish `server.js`, `lib/`, `config/`, runtime databases or environment variables.

## API Vault

Production credentials are stored server-side and encrypted with AES-256-GCM. The browser receives only masked configuration status and never receives the stored secret again.

Set a strong deployment secret:

```env
VAULT_MASTER_KEY=<at least 32 random characters>
SESSION_SECRET=<at least 32 random characters>
```

## Repository bundle

The source archive must contain only a clean empty example database. Before replacing the bundle, run the project checks and scan it for `.env`, token files, logs, archives from users and executable binaries.

## GitHub Pages

A Pages site is public even when its source repository is private on supported GitHub plans. Never place private information under `public/`.

## Reporting

Report suspected exposure privately to the repository owner and rotate affected credentials immediately.
