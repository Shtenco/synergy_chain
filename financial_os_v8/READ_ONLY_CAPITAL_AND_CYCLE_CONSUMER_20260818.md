# SINERGYCHAIN Read-Only Capital + Economic Cycle Consumers — 2026-08-18

## Purpose

This additive control-plane layer lets SINERGYCHAIN display two new Financial OS facts without becoming an underwriting, accounting or payment engine:

- `capital.authorization/v1`;
- `economic.cycle-trace/v1`.

No Growth OS V7, OGAS, OLGA, SMM/CRM/Sales/CFO, backend, session, wallet or existing V8 verifier is modified.

## CapitalAuthorization consumer

The verifier checks exact shape, digest, canonical amount, safe sequence, human/multisig decision authority, AI authority NONE, separate MetaPay execution authority and decision/expiry timestamps.

It may report whether the authorization is currently inside its validity window for display purposes.

It does not recompute screening, NAV, valuation, requirement semantics or underwriting. It does not create a PaymentIntent and has no execute method.

## EconomicCycleTrace consumer

The verifier checks the canonical strict causal prefix:

```text
Funding State
-> Project Proposal
-> Project Screening
-> Capital Authorization
-> Funding Settlement
-> Project Evidence
-> Revenue Settlement
-> Accounting Snapshot
-> Trust Commitment
```

For every phase it verifies the fixed schema, source repository, digest shape and non-decreasing timestamp. Project-domain references must bind the trace project id.

`TRACE_COMPLETE` only means all required fact classes are present in order. The portal deliberately returns:

```text
displayAuthority = READ_ONLY
profitRecognition = NONE
executionAuthority = NONE
```

It never recomputes Financial OS P&L.

## Shared conformance fixtures

The control-plane branch mirrors Financial OS fixtures:

- CapitalAuthorization digest `1bf53290d288e2117ce9c339227669673658eed2c95d72dc2657236b11ae2140`;
- complete EconomicCycleTrace digest `c8fbff33f6eea386b5cf1c48db426aa54232f6d831169ccbf4b3a440b8a7eabf`.

Adversarial tests rehash modified objects and verify that semantic violations still fail. A fresh SHA-256 cannot turn AI approval, skipped phases, wrong source repositories, time reversal or profit-recognition claims into valid control-plane state.

## Non-destructive evolution

This is a child layer above the existing `docs/federation-control-plane-20260817` work. Older project-screening/snapshot consumers remain available and unchanged.
