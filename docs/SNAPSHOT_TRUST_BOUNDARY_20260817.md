# Snapshot trust boundary

## Goal

Prevent presentation code from becoming an accidental accounting engine.

## Minimum verification

Before privileged use of a FinancialSnapshot, the control plane should verify or receive verification for:

- supported schema version;
- monotonic sequence;
- expected accounting perimeter;
- acceptable staleness window;
- canonical JSON digest;
- approved signature/attestation when required;
- absence of reported hard-invariant failures for the requested action class.

## Display vs authority

A dashboard may display unverified/stale information for diagnostics if clearly marked. It must not use such state to authorize money creation, credit expansion, withdrawal, buyback, provider execution or other privileged actions.

## Browser boundary

The browser may calculate presentation-only derived metrics, but authoritative values such as HardNAV, liabilities, realized external revenue and distributable profit must originate from the canonical accounting service/snapshot.

## Auditability

A privileged portal action should retain:

- snapshot sequence/digest used for the decision;
- request/intent id;
- policy decision id;
- resulting execution/settlement id;
- actor/session identity according to security policy.

This enables reconstruction without storing private credentials in the public presentation layer.
