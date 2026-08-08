# SINERGYCHAIN Financial OS V8 integration layer

This directory is intentionally additive. The legacy `SINERGYCHAIN_GROWTH_OS_V7_SOURCE.tar.gz` bundle and the existing deployment workflow are not modified by this branch.

## Purpose

V8 turns the portal into a control plane and observability surface for the wider SINERGY Financial OS rather than embedding monetary logic directly in the UI.

The canonical system is separated into six domains:

1. **Monetary Core** — SYNA capital, SYNR reserve/savings capital, SYNT transaction money.
2. **Savings & Credit** — 2–5% automatic savings, 1–100 week duration ladder, P2P/productive credit.
3. **Treasury & Risk** — HardNAV, insurance, general reserve, sponsor first-loss, MIDAS risk sleeve.
4. **AI Central Bank** — deterministic policy + bounded RL residual + hard invariants.
5. **MetaPay** — fiat/CBDC/crypto/Interledger routing, clearing and reconciliation.
6. **Real Economy** — AI Sales, SMM, SaaS, marketplace, invoices and verified productive projects.

## Portal rule

The portal must never compute authoritative monetary state from browser-visible token prices. It consumes signed/read-only snapshots from the canonical accounting services.

Displayed values must be explicitly classified:

- `hard_nav` — externally redeemable assets less external liabilities;
- `liquid_nav` — haircut liquid assets less liabilities;
- `economic_nav` — haircut economic assets less liabilities;
- `market_price` — market quote only, never presented as backing;
- `distributable_profit` — HardNAV growth net of new contributed capital.

## Safety modes

The UI understands four monetary modes:

- `GROWTH`
- `NORMAL`
- `DEFENSE`
- `EMERGENCY`

`EMERGENCY` is a valid healthy control state. The portal must show which actions are disabled instead of hiding degraded conditions.

## Integration boundaries

V8 should consume, not duplicate:

- `ai_financial_system` for balance-sheet invariants and monetary policy research;
- `synergy_pay_system` for MetaPay, compliance and settlement control;
- existing Growth OS agents for AI-CFO, Sales, SMM and business automation.

The machine-readable contract is `manifest.json`. A standalone design prototype is in `public/index.html`; it is not wired into the old Pages deployment.
