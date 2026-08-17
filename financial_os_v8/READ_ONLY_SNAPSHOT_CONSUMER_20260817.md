# SINERGYCHAIN control plane — read-only FinancialSnapshot consumer

Status: **additive draft boundary**. Existing Growth OS V7 and prior `financial_os_v8/` files remain untouched.

## Responsibility

`synergychain` is a portal/control-plane consumer of canonical financial state. It is **not** the accounting authority.

The portal may:

- parse `financial.snapshot/v2`;
- verify its exact top-level shape;
- verify canonical SHA-256 content digest;
- verify ledger/account/valuation-policy digest fields are well formed;
- verify sequence/perimeter/currency metadata;
- verify canonical decimal-string shape and 1/4/8-week liquidity-state shape;
- display already-computed Financial OS values;
- forward the verified snapshot digest to trust/governance layers.

The portal must not:

- recompute HardNAV from browser-side balances;
- recompute realized external P&L;
- derive distributable profit from token price or HardNAV movement;
- recompute LCR from partially loaded data;
- substitute a locally fetched token/AMM/oracle mark for the bound valuation policy;
- convert a digest verification into an authorization or audit claim.

## Why this boundary exists

Two independent implementations of financial arithmetic can diverge because of:

- valuation-policy version;
- accounting perimeter;
- rounding/quantisation;
- stale asset data;
- incomplete maturity outflows;
- intra-group elimination;
- different treatment of principal vs revenue.

Therefore the browser/control plane consumes a signed/digestible Financial OS state instead of becoming a second accounting engine.

## Verifier

Additive CommonJS module:

```text
financial_os_v8/read_only_snapshot_verifier.cjs
```

Regression script:

```text
financial_os_v8/test_read_only_snapshot_verifier.cjs
```

The verifier checks structural and cryptographic integrity only. Its exported API intentionally contains no `computeHardNAV`, `computePnL` or `computeLCR` function.

## Canonical JSON

Digest verification uses recursively sorted object keys, compact separators and UTF-8 JSON. Snapshot monetary values are canonical decimal strings rather than JavaScript floating-point numbers.

This avoids browser floating-point reinterpretation of accounting amounts.

## Trust boundary

A valid SHA-256 digest proves content identity, not authenticity. Production authenticity still requires the approved signing/HSM/trust-layer policy.

The intended chain is:

```text
Financial OS
  -> financial.snapshot/v2
  -> canonical digest/signing policy
  -> read-only portal verification
  -> optional trust-layer commitment
```

Never:

```text
browser token prices
  -> browser NAV calculation
  -> claim of canonical Financial OS state
```

## Legacy preservation

This module is side-by-side. It does not delete or rewrite Growth OS V7, the older portal, or historical Financial OS V8 prototypes.
