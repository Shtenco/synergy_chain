# SINERGYCHAIN — strict read-only ProjectScreening consumer v2

Status: **additive draft hardening consumer**.

This file documents the portal-side verifier implementation:

- `read_only_project_screening_verifier_v2.cjs`
- `test_read_only_project_screening_verifier_v2.cjs`
- `.github/workflows/project-screening-readonly-v2.yml`

The payload schema remains:

```text
project.screening/v1
```

The `v2` suffix belongs to the **consumer/verifier implementation**, not to the federation payload schema.

## Why side-by-side

The previous portal verifier is preserved for provenance and comparison. It is not destructively overwritten during the current federation hardening pass.

The strict v2 verifier adds representation and type checks required by the current Financial OS producer:

- shared `sinergy.canonical-json/v1` serializer;
- safe-integer maturity;
- canonical decimal strings only;
- closed evidence status set;
- exact top-level shape;
- unique non-empty blockers;
- `REVIEWABLE` requires zero blockers;
- `NO_ACTION` requires at least one blocker;
- content digest verification after structural validation.

Examples of rejected alternative spellings:

```text
70.0
070
0.20
-0
```

The producer-side canonical spellings are:

```text
70
0.2
0
```

## Non-authorizing boundary

The verifier may prove only that a `project.screening/v1` object is structurally valid, canonical, digest-consistent and has one of the allowed screening statuses:

```text
REVIEWABLE
NO_ACTION
```

It must not interpret `REVIEWABLE` as:

```text
APPROVED
FUNDED
AUTHORIZED
QE_AUTHORIZED
```

No API is exported for:

- project approval;
- funding;
- underwriting calculation;
- risk-score recomputation;
- private-match recomputation;
- first-loss recomputation.

Those remain Financial OS / underwriting responsibilities outside the browser control plane.

## Verification status

Implementation and isolated tests exist on the draft branch. Runner status remains **PENDING_RUNNER** until GitHub Actions actually executes successfully.
