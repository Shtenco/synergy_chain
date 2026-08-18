# SINERGYCHAIN Read-Only Capital/Cycle V2 — 2026-08-18

This additive control-plane layer preserves all v1 consumers and adds the hardened v2 Financial OS contracts.

## CapitalAuthorization v2 display boundary

The verifier checks exact bytes and exposes only read-only fields. V2 additionally shows the exact authorized funding source, destination and PaymentIntent idempotency key. It rejects semantic tampering even when a fresh SHA-256 is supplied.

The control plane does not create PaymentIntent objects, reserve liquidity, sign, send or settle funds.

## EconomicCycleTrace v2

The v2 trace is identical in causal shape to v1 except that phase four requires `capital.authorization/v2`. A v1 authorization cannot be silently inserted into a v2 trace.

`TRACE_COMPLETE` still means only that all required fact classes are present in causal order. The portal never derives P&L or execution authority from the trace.

## Shared fixtures

- CapitalAuthorization v2 digest: `1e814153a18850865543e08b498b60d9bce80dbd34bfb2f4c378f3fe502fe89f`
- EconomicCycleTrace v2 digest: `9876d96b68c429d60c128770db0bf39c80a5bf93820d84d2fed86c64601a3823`

## Non-destructive evolution

All v1 control-plane consumers remain in place. No Growth OS V7, OGAS, OLGA, backend, wallet, existing verifier or public surface is modified by this v2 child layer.
