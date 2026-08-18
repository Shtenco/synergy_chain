# SYNERGY AI Autopilot Economic Node v1

## Thesis

The Business Expert Autopilot becomes a first-class **service node** of the SYNERGY network. It is not a consensus oracle and does not receive the owner's private keys. It automates a person or company by observing authorized data, producing plans/proposals, simulating effects, requesting/using bounded approvals and returning auditable execution receipts.

This preserves the existing Growth OS / OLGA product surface while moving durable policy, commitments, payments and permissions onto SYNERGY PQ-EVM.

## Node roles

A deployment may run one or more roles:

- `PERSONAL_AUTOPILOT` — budgeting, bills, purchases, savings, scheduling, document workflows;
- `COMPANY_AUTOPILOT` — CRM, sales, procurement, invoicing, treasury proposals, payroll preparation, reporting;
- `PAYMENT_ROUTER` — Meta Pay route/fee optimization under policy;
- `STORAGE_ARCHIVIST` — compression/placement/restore management;
- `COGNITIVE_NODE` — NEXUS specialist inference/evidence;
- `AUDITOR` — accounting, anomaly, compliance and policy verification;
- `MARKET_AGENT` — quote/auction/solver participation within explicit limits.

Consensus validator/sequencer roles remain separate from stochastic AI roles.

## Identity

Each Autopilot Node has:

- node id;
- owner/account id;
- post-quantum operational key;
- software/image commitment;
- NEXUS/model roots used;
- capabilities root;
- policy root;
- optional hardware/workload attestation;
- pricing/service manifest;
- reputation/evidence history.

A node cannot expand its own capabilities. Capability changes require the account/organization governance path.

## Execution pipeline

```text
company/person data + events
          |
       observe
          |
 NEXUS / specialist graph
          |
 evidence + alternatives
          |
 deterministic policy filter
          |
     simulation
          |
  bounded proposal commitment
          |
 approval / corporate quorum / pre-authorized rule
          |
 wallet/HSM/MPC PQ signature
          |
 PQ-EVM / Meta Pay / external adapter
          |
 realized-effect receipt
          |
 ledger + memory + policy feedback
```

The AI stops at **proposal** until a cryptographic authority path permits execution.

## Capabilities

Examples:

- read specific ledger accounts;
- read CRM pipeline;
- prepare but not sign a payment;
- pay approved supplier up to X per action/day;
- request quotes from allowlisted providers;
- prepare a contract call to allowlisted targets/selectors;
- archive documents under a retention policy;
- schedule workflows;
- create accounting entries subject to deterministic reconciliation;
- request human/corporate approval.

Capabilities are deny-by-default and scoped by resource, destination, value, time and rate.

## Individual mode

A personal node can automate routine administration while retaining explicit boundaries:

- recurring bills;
- household budget rebalancing;
- savings/investment proposals;
- subscription detection;
- document/receipt archival;
- calendar/workflow preparation;
- shopping/payment routing.

High-risk actions remain human-approved unless a narrow deterministic rule was explicitly granted.

## Company mode

A company can create a graph of departmental nodes:

```text
CEO / governance policy
        |
   Company Governor
   /    |      |     \
CFO   Sales   CRM   Procurement
 |      |      |       |
Pay   leads  clients  suppliers
   \    |      |      /
       Evidence Graph
            |
      deterministic ERP/ledger
```

NEXUS can coordinate the graph, but deterministic accounting/compliance/contract invariants remain sovereign.

## Economic loop

Nodes may be paid for measurable useful work:

- successful payment routing savings;
- verified storage delivered;
- validated leads/sales outcomes;
- completed workflow tasks;
- solver/quote improvement;
- verified inference/proof work.

Rewards should be based on signed receipts and realized metrics, not self-reported AI scores.

## Autopilot memory

Three tiers:

1. **Canonical state** — policy, balances, rights, final receipts, commitments.
2. **Hot private state** — current company/personal context with access controls.
3. **Archival state** — compressed encrypted documents/logs/traces in the SYNERGY storage layer referenced by hashes.

This avoids storing private enterprise data directly in public EVM state.

## NEXUS integration

Use two NEXUS planes:

- `Consensus NEXUS` — compact deterministic fixed-point/proof-verified primitives available to EVM;
- `Product NEXUS` — large R7.x/R7.5 cognitive graph outside consensus, producing evidence/proposals whose hashes/proofs can be committed on-chain.

R7.5 multinode scaling maps naturally to a decentralized cognitive service network: specialist nodes expose typed roles, evidence, confidence/calibration, model hash and cost; the Trust Governor selects a sparse subgraph; Authority may veto the collective.

## Safety invariants

- AI model output is never a signature;
- private keys are never passed into OLGA/NEXUS prompts or model memory;
- target/value/calldata are committed before approval;
- simulation state root is bound to the proposal;
- policy/budget/expiry are checked again at execution;
- replay/idempotency protection is mandatory;
- realized outcome is reconciled after execution;
- a model upgrade changes the model root and cannot silently inherit unrestricted authority;
- emergency pause/revocation works without asking the AI node.

## Product objective

The objective is not to remove people from economic sovereignty. It is to make high-frequency administrative and economic work machine-executable while keeping ownership, accountability, permissions and final cryptographic authority explicit.
