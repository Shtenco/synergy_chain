# V12.3 EVM Causality Result

## Status

A self-contained Solidity/Foundry harness was added in PR #16. GitHub Actions run 32836191190 was created, but the hosted runner failed before executing any workflow step (`steps=[]`), so this document does **not** claim a completed bytecode-level EVM PASS.

The contract-flow identity below is exact for the Solidity implementation and is covered by six Foundry tests once the runner is available.

## Test constants

- initial canonical bridge NAV = $1.00
- ETH bridge = $0.50 WETH-equivalent at $2,500/WETH
- USDC bridge = $0.50
- zero-fee flash principal = $0.10 USDC
- QE premium examples = +10% and +20%
- QT burns all protocol-internal QE debt
- executor ends with zero WETH and zero USDC inventory

## A. Closed external venue, +10% QE premium

External venue gives exactly $0.100000 of WETH for the $0.10 flash principal.

- external WETH fair value received: $0.100000
- internal QE price paid by USDC bridge: $0.110000
- QE internal debt issued: $0.010000
- flash principal repaid: $0.100000
- executor surplus: +$0.010000
- executor surplus relocked to USDC bridge: +$0.010000
- QT debt end: $0

Bridge balances after settlement:

- ETH bridge value: $0.600000
- USDC bridge: $0.400000
- total canonical bridge NAV: **$1.000000**
- canonical NAV delta: **$0.000000**

So QE creates positive executor PnL, but the same value was released by the protocol's USDC bridge. After consolidation the QE premium cancels exactly.

## B. Base-like -30 bps external quote, +10% QE premium

- external WETH fair value: $0.099700
- internal QE pay: $0.109670
- executor surplus: +$0.009670
- ETH bridge final value: $0.599700
- USDC bridge final value: $0.400000
- total bridge NAV: **$0.999700**
- delta: **-$0.000300**

Executor PnL remains positive while canonical bridge NAV falls.

## C. External venue +42 bps quote bonus and 30 bps fee = +12 bps net, +10% QE premium

- external WETH fair value: $0.100120
- internal QE pay: $0.110132
- QE internal premium: $0.010012
- executor surplus: +$0.010132
- ETH bridge final value: $0.600120
- USDC bridge final value: $0.400000
- total bridge NAV: **$1.000120**
- delta: **+$0.000120**

Since $0.000120 / $0.10 = 0.0012, the real canonical gain is exactly **12 bps** of notional, up to integer rounding.

## D. Same +12 bps external net quote, QE premium 0% vs +10%

The canonical bridge delta is the same in both cases: about **+$0.000120**.

QE increases executor-side PnL dramatically, but does not change the canonical source of the +12 bps.

## E. Zero external edge, +20% QE premium

- executor PnL: about +$0.020000
- canonical bridge gain: **$0**
- a V11-style 12-bps gain would have been $0.000120 on this principal

Thus the executor can show PnL more than 160x larger than a 12-bps target while consolidated canonical bridge NAV still does not grow.

## Exact identity implemented by the harness

For the complete settled cycle:

`Delta bridge NAV = canonical value received from external venue - flash principal`

(with explicit external costs subtracted when present).

The internal QE premium cancels because it is paid by one protocol-owned bridge and then appears as executor surplus/reinvestment. QT changes the internal debt ledger but moves no canonical token.

## Consequence for V11

The V11 `$1 -> $13.282M` frontier remains a conditional throughput frontier. To make its 12 bps causal-canonical rather than merely executor-side, a real Base fork must show that the external leg(s) return about 12 bps more canonical value than the protocol sends out after DEX fees/slippage/MEV, and then survive gas, flash repayment, QT and full consolidation.
