# SINERGYCHAIN as federation control plane

Status: additive architecture document. Existing Growth OS V7 source, OGAS 2.0 portal, OLGA integration, business applications, API Vault and public build remain unchanged.

## Repository role

`Shtenco/synergychain` is the portal/orchestration/control-plane layer of the SINERGY federation.

It may present and orchestrate:

- Financial OS state;
- household/maturity state;
- MetaPay routing/settlement state;
- real-economy project state;
- OLGA/NEXUS proposals;
- business applications and automation;
- governance and operational controls.

It must not become the authoritative source for financial backing, realized profit or ledger balances merely because it renders those values in a browser.

## Source-of-truth boundary

```text
synergy_financial_os / canonical ledger
        |
        v
signed/digestible FinancialSnapshot
        |
        +--> synergychain portal
        +--> dashboards
        +--> OGAS views
        +--> AI context
```

The portal consumes authoritative state; it does not recompute HardNAV from token prices or UI-side assumptions.

## Growth OS V7 preservation

The existing repository lineage remains valuable and is preserved:

- SINERGYCHAIN / OGAS 2.0 public portal;
- OLGA AGI multi-agent chat;
- single-model/chain/consensus/debate/department modes;
- recursive compressed memory;
- model routing;
- Business Expert Autopilot;
- AI SMM / CRM / Sales / CFO;
- encrypted API Vault;
- Node.js backend;
- static GitHub Pages build.

Federation integration is additive around this stack.

## Financial state consumption

Preferred incoming objects include:

- `financial.snapshot/v1+`;
- `maturity.snapshot/v1+`;
- risk/policy state;
- investment/project decisions;
- settlement receipts;
- evidence references.

The UI should display schema version, sequence, as-of time and digest/signature state where relevant.

## Command boundary

Portal actions should create explicit intents/proposals rather than mutate authoritative balances directly.

Examples:

```text
user requests payment
 -> PaymentIntent
 -> synergy_pay_system
 -> SettlementReceipt
 -> canonical ledger

user requests investment
 -> InvestmentIntent / ProjectAllocationRequest
 -> Financial OS policy/risk gate
 -> approved instruction
 -> settlement/execution layer
```

## AI boundary

OLGA/NEXUS may analyze and propose. Any financial action requiring authority must pass deterministic policy and hard invariant checks outside the generative UI layer.

## Public build boundary

`Shtenco/synergychain.github.io` remains a public static presentation surface. Backend code, secrets, authoritative databases and private runtime state must not be moved into the public build for convenience.

## Failure behavior

If an authoritative snapshot is stale, unsigned when a signature is required, schema-incompatible or fails digest verification, the portal should fail closed for privileged actions and clearly mark the displayed state as stale/unverified.

## Non-destructive rule

No legacy Growth OS V7 component is removed by this boundary. New Financial OS integration should be placed side-by-side and versioned so the historical portal remains reproducible.
