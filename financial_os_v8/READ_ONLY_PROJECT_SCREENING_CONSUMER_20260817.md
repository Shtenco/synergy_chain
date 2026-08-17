# SINERGYCHAIN control plane — read-only project screening consumer

Status: **additive draft boundary**. This file does not modify Growth OS V7 or authorize any financial action.

## Object consumed

```text
project.screening/v1
```

Produced by the canonical Financial OS screening layer after it has evaluated a productive-project proposal against:

- proposal digest;
- supplied project-evidence bundle digest;
- screening-policy digest;
- FX translation-set digest;
- evidence class/finality;
- risk score;
- private-capital match;
- first-loss capital;
- maturity ceiling;
- FX hedge policy.

## Allowed portal meaning

The portal may display:

```text
REVIEWABLE
NO_ACTION
```

`REVIEWABLE` means only:

> this proposal passed the narrow deterministic pre-underwriting screening gate represented by the bound policy and evidence inputs.

It does **not** mean:

- approved credit;
- approved investment;
- funded project;
- QE authorization;
- executable payment;
- guaranteed return;
- investment advice.

## Forbidden status escalation

The read-only verifier accepts exactly:

```text
REVIEWABLE
NO_ACTION
```

It rejects authorizing labels even when someone recomputes a fresh content digest after editing the object:

```text
APPROVED
FUNDED
AUTHORIZED
QE_AUTHORIZED
```

This prevents a UI/control-plane developer from silently turning a screening result into a credit decision by renaming a status.

## Blocker semantics

```text
REVIEWABLE -> blockers must be empty
NO_ACTION  -> at least one blocker must exist
```

The portal displays blockers verbatim. It does not delete or reinterpret them to make a project appear more attractive.

## Integrity checks

The additive verifier:

```text
financial_os_v8/read_only_project_screening_verifier.cjs
```

checks:

- exact top-level shape;
- canonical SHA-256 digest;
- proposal/evidence/policy/translation digests;
- canonical decimal-string representation;
- evidence status enum;
- risk score shape;
- maturity shape;
- blocker consistency;
- non-authorizing status policy.

Regression tests:

```text
financial_os_v8/test_read_only_project_screening_verifier.cjs
```

## Separation of responsibilities

```text
synergy_eurasian
  -> project.proposal/v1 + project.evidence/v1

synergy_financial_os
  -> project.screening/v1

synergychain
  -> verify + display only
```

A later investment-bank/credit committee/governance layer may consume a `REVIEWABLE` result, but that is a separate object, separate policy and separate authorization boundary.

## Legacy preservation

This consumer is additive and side-by-side. Existing portal logic and historical Financial OS prototypes are preserved for provenance and are not silently reinterpreted as authorization logic.
