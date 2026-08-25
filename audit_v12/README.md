# SYNERGY V12.2 Causal Value-Conservation Audit

This audit is deliberately harsher than the earlier growth simulations. Its purpose is to separate:

- internal QE/QT bookkeeping;
- executor PnL;
- gross bridge locks;
- debt-adjusted bridge equity;
- externally sourced canonical ETH/USDC capture.

## Pass rule

A release may claim **real bridge-capital growth** only if, after the complete cycle:

1. canonical bridge ERC-20 balances are larger;
2. all flash principal is repaid;
3. all externally redeemable claims are fully accounted;
4. QT does not book debt cancellation as canonical income;
5. external costs are included;
6. the increase is attributable to an identifiable external value source;
7. unexplained value creation is approximately zero.

## Release classification under this rule

| Release line | Result under causal conservation audit |
|---|---|
| A/B dual-bridge baseline | Closed endogenous loop loses canonical NAV once external costs are included. |
| Endogenous QE retest | QE can create a trader-side edge, but not positive consolidated canonical capital in a fixed-price closed system. |
| $1 retest | Zero-cost closed control conserves $1; positive external costs reduce canonical NAV. |
| Bridge-capital-first retest | Positive executor PnL is not the same as bridge growth; exact bridge delta is negative with fees/gas and zero in the ideal closed control. |
| Lock-growth collateral retest | Gross locks can rise with debt, but funded-QT zero-cost bridge equity remains unchanged. |
| V8 max-growth | Explosive $1-to-millions path depends on a protocol-cancellable-debt accounting branch and is not sufficient evidence of asset-backed canonical growth. |
| V9 asset-backed audit | Restores actual-token accounting; closed zero-fee canonical NAV is invariant and positive costs make it negative. |
| V10 two-elevator | Solidity tests target the same conservation property for asymmetric two-elevator schedules. |
| V11 solvent frontier | Growth is conditional on externally realized canonical capture; 12 bps is a research assumption to be replaced by live/fork quotes. |

## Automated checks in this folder

`python -m unittest audit_v12.test_release_conservation -v`

The tests reproduce the V11 12-bps recurrence, verify the V11 zero-capture control, recover the reported approximately 8.933-bps threshold required to beat the V8 headline at the 1% depth cap, and assert the V9/V10 conservation identities used by the audit.

The GitHub workflow also runs the existing `qe_v10` Foundry tests when the runner and Foundry toolchain are available.
