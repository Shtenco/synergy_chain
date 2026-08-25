# SYNERGY QE V12.4 — Distilled Base Fork

## One architecture

`QE -> BEST EXTERNAL DEX -> QT -> REPAY -> NAV`

No fixed `+12 bps` exists anywhere in the fork path.

The external route is selected from real Base contracts at the forked block:

- Uniswap V3 QuoterV2 `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a`
- Uniswap SwapRouter02 `0x2626664c2603336E57B271c5C0b26F421741e481`
- Aerodrome Classic Router `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`
- Aerodrome Slipstream Quoter `0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0`
- Aerodrome Slipstream Router `0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5`
- PancakeSwap V3 Quoter `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997`
- PancakeSwap V3 SmartRouter `0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86`
- Base WETH `0x4200000000000000000000000000000000000006`
- Base native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

Uniswap deployment addresses are from the Uniswap Base deployment documentation. Aerodrome/Pancake addresses were cross-checked against current integration registries before being embedded in this audit harness.

## The five counters

1. `BRIDGE_NAV_BEFORE`
2. `BRIDGE_NAV_AFTER`
3. `QE_EXECUTOR_PNL`
4. `QE_CAUSAL_NAV`
5. `QE_DEBT_END`

Closure checks are additionally enforced:

- `FLASH_DEBT_END = 0`
- `RESIDUAL = 0`

## Exact definition of QE_CAUSAL_NAV

The test uses the same fork state and the same external route twice:

- A: QE = 0
- B: QE = +10%

`QE_CAUSAL_NAV = DeltaNAV(B) - DeltaNAV(A)`

This removes natural Uniswap/Aerodrome/Pancake price differences from the QE attribution. If a market edge already exists in both runs, it cannot be mislabeled as QE-created value.

## NAV definition

`BRIDGE_NAV` is canonical USDC in the USDC bridge plus the best real Base executable USDC quote for the canonical WETH held in the ETH bridge.

Internal QE debt has zero NAV. Executor balances must be zero after settlement. QT can burn internal debt but cannot mint Base WETH or Base USDC.

## Strict economic PASS

```text
BRIDGE_NAV_AFTER > BRIDGE_NAV_BEFORE
QE_CAUSAL_NAV > 0
QE_DEBT_END = 0
FLASH_DEBT_END = 0
RESIDUAL = 0
```

The Solidity test itself does not fake a PASS. It emits the five counters and separately verifies settlement/accounting invariants.

## Tests

- `testFork_LiveQuotes_UniswapAerodromePancake`
- `testFork_DistilledFiveCounters_QE10`
- `testFork_QETradeAgainstDoNothingBaseline_IsMeasuredNotAssumed`
- `testFork_QE0vsQE20_SameCanonicalNAV_DifferentExecutorPnL`

## Run

```bash
cd qe_v12_4
BASE_RPC_URL=https://mainnet.base.org forge test -vvvv
```

The test contract obtains its setup USDC through a real Base DEX swap before the measured snapshot. The measured QE cycle then uses a zero-fee local flash vault so flash principal is isolated as temporary working capital; no flash subsidy is counted in bridge NAV.
