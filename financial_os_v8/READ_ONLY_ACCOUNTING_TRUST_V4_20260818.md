# Read-only accounting + trust bundle v4

This layer is additive. Growth OS V7, Autopilot, PQ-EVM, wallets, backend/session code and all prior read-only verifiers remain unchanged.

The control plane independently verifies four artifacts:

1. RevenueRecognition v2;
2. recognized-revenue LedgerEvent v1;
3. non-circular EconomicCycleTrace v5;
4. external CommitmentEnvelope v4 over the completed Trace v5.

The bundle checks recognition->ledger evidence/reference/time links, trace references, exact Trace v5 bytes committed by Envelope v4 and the external-finalization marker.

A valid new hash is never treated as sufficient economic authority. Adversarial tests alter ledger evidence, recompute the LedgerEvent hash, repoint/re-hash Trace v5 and update the commitment payload hash. The bundle still blocks because the independent RevenueRecognition digest no longer matches the ledger evidence root.

`READ_ONLY_VERIFIED` is a display/provenance result only. The portal has no accounting, posting, authorization, signing, liquidity or execution authority.
