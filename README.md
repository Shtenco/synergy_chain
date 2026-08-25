# SYNERGY V11 DISTILLED — REAL BASE POOL PACKAGE

Architecture:

`QE -> gradient -> USDC bridge pump -> real Base WETH/USDC pool -> ETH bridge pump -> QT -> canonical NAV`

Exactly four core contracts:

1. `src/InternalMintedPool.sol`
2. `src/BaseExternalPool.sol`
3. `src/USDCBridgePump.sol`
4. `src/ETHBridgePump.sol`

## Pinned external pool

Base Mainnet (chain id 8453), Uniswap V3 WETH/USDC 0.30%:

- Pool: `0x6c561B446416E1A00E8E93E221854d6eA4171372`
- Fee: `3000`
- WETH: `0x4200000000000000000000000000000000000006`
- native USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- QuoterV2: `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a`
- SwapRouter02: `0x2626664c2603336E57b271c5C0b26F421741e481`

The adapter hard-pins these addresses and exposes `verifyPinnedPool()` which checks the pool's on-chain `token0`, `token1`, and `fee`.

This is the same pool used as the largest checked Base WETH/USDC liquidity anchor in the SYNERGY 2026-08-24 research snapshot. The pair and fee tier are independently corroborated by current integration registries.

## What the fork test measures

The test obtains setup USDC through the real pinned pool, seeds about $1 of bridge capital, then creates its own QE gradients dynamically from the live external executable quote:

- +10% internal QE price -> USDC bridge pumps USDC into real WETH
- -10% internal QE price -> ETH bridge pumps the acquired WETH back into real USDC
- QT closes internal QE debt after each leg
- canonical NAV counts only real WETH + real USDC

No fixed `+12 bps` is injected.

## Run

```bash
cd SYNERGY_V11_DISTILLED_REAL_BASE_POOL
BASE_RPC_URL=https://mainnet.base.org forge test -vvvv
```

Main tests:

- `testPinnedLargestWethUsdcPoolIdentity`
- `testOneFullQEGradientTwoPumpCycleOnRealBasePool`
- `testTwentyCyclesDoNotTurnOneDollarIntoMillionsWithoutExternalFlow`

## Safety / scope

This package is a fork/audit harness, not a claim of guaranteed profit and not a live deployment recommendation. A real bridge-capital gain is counted only when canonical WETH/USDC NAV rises after the complete two-pump cycle and QT settlement.
