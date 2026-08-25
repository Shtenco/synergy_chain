# SYNERGY QE V12.3 — Canonical EVM Causality Audit

This harness tests one narrow claim:

> Can a QE-created internal price premium, followed by owned execution, QT, flash repayment and zero residual inventory, create positive consolidated canonical ETH/WETH+USDC bridge NAV by itself?

## Accounting boundary

Protocol bridge NAV is only:

`WETH.balanceOf(ETHBridge) * P_ETH + USDC.balanceOf(USDCBridge)`

Internal QE debt has zero NAV. Executor PnL is tracked separately. Flash principal is external working capital and is not counted as protocol capital.

## EVM flow

1. Start with exactly $1 bridge capital: $0.50 WETH + $0.50 USDC.
2. Borrow $0.10 USDC from a zero-fee flash vault.
3. Buy canonical WETH from an external fixed-price venue.
4. QE creates an internal premium, so the USDC bridge pays the executor more than external fair value.
5. Canonical WETH is locked into the ETH bridge.
6. Flash principal is repaid.
7. Executor surplus is relocked into the USDC bridge.
8. QT burns all protocol-internal QE debt.
9. Executor must end with zero WETH and zero USDC residual inventory.
10. Measure actual bridge NAV.

## Core identity

The QE premium changes executor PnL, but after consolidation it cancels against the canonical USDC released by the protocol itself.

For one cycle:

`Delta bridge NAV = external canonical quote value received - flash principal - external execution costs`

Therefore the internal QE premium drops out of the consolidated bridge-NAV equation.

## Tests

- `testClosedNoQEConservesCanonicalBridgeNAV`
- `testQECanCreateExecutorPnLButNotCanonicalNAVInClosedMarket`
- `testBaseLikeExternalFeeMakesCanonicalNAVFallEvenWithQE`
- `testTwelveBpsCanonicalGainRequiresTwelveBpsExternalNetQuote`
- `testQEPremiumChangesExecutorPnLButNotCanonicalCapture`
- `testQEAloneCannotManufactureV11TwelveBps`

The most important A/B is the last two tests:

- with the same +12 bps external net quote, changing QE premium from 0% to +10% increases executor PnL but leaves canonical bridge gain unchanged;
- with zero external quote advantage, even a +20% QE-created internal premium cannot manufacture +12 bps of canonical bridge gain.

## Interpretation for V11

V11's `12 bps` can be a QE-triggered trading opportunity, but it cannot be booked as QE-created canonical value merely because executor PnL is positive. To justify the `$1 -> $13.282M` frontier, the fork/live route must show a genuine post-settlement canonical balance gain of about 12 bps on the external leg(s), after all external fees/slippage/MEV and before gas.

A real Base fork phase should replace the fixed external venue in this harness with exact Uniswap/Aerodrome/Pancake quotes and replay the same invariant on block snapshots.
