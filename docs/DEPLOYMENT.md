# Deployment

## GitHub Pages

The `Deploy SINERGYCHAIN to GitHub Pages` workflow extracts the clean V7 source bundle, runs `npm run check`, and publishes only `_source/public`.

For a private repository, GitHub Pages requires a plan that supports Pages from private repositories. The resulting website is public unless private Pages is configured through GitHub Enterprise Cloud.

Repository settings:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions**.
3. Run the Pages workflow from the **Actions** tab if it did not start automatically.

Expected project URL:

`https://shtenco.github.io/synergychain/`

## Production backend

GitHub Pages is static and cannot run Node.js, sessions, encrypted API Vault, live model calls, CRM writes, CFO database operations, or real social-network publishing.

Deploy the extracted Node.js application to a VPS, container host, or application platform for full functionality. Keep all API keys in the server-side Vault or environment variables.
