# SINERGYCHAIN Growth OS V7

Private source repository for the SINERGY ecosystem portal and business operating system.

## Public interface

GitHub Pages target: `https://shtenco.github.io/synergychain/`

The Pages deployment contains only the static `public/` interface. Server sessions, API Vault secrets, real AI-provider calls, databases and private business data are never published to GitHub Pages.

## Included systems

- SINERGYCHAIN / OGAS 2.0 portal
- OLGA AGI multi-agent chat
- Business Autopilot
- AI SMM
- AI CRM
- AI Sales
- AI CFO
- encrypted API Vault
- OpenRouter free-model discovery and fallback rotation
- recursive conversation memory

## Source package

The complete verified source is stored as:

`source/SINERGYCHAIN_GROWTH_OS_V7_SOURCE.tar.gz`

The GitHub Actions workflow checks the archive, extracts it, runs `npm run check`, publishes the expanded source to the `source-v7` branch, and deploys only `_project/public` to GitHub Pages.

## Local start

```bash
mkdir SINERGYCHAIN_GROWTH_OS_V7
tar -xzf source/SINERGYCHAIN_GROWTH_OS_V7_SOURCE.tar.gz -C SINERGYCHAIN_GROWTH_OS_V7
cd SINERGYCHAIN_GROWTH_OS_V7
npm run check
npm start
```

Never commit `.env`, production databases, passwords or API keys. Configure all secrets through the server-side encrypted API Vault.
