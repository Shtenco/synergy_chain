# REAL BASE MAINNET EXTERNAL POOL

Pinned external market for the distilled V11 package:

- Chain: Base Mainnet (8453)
- DEX: Uniswap V3
- Pair: WETH / native USDC
- Pool: `0x6c561B446416E1A00E8E93E221854d6eA4171372`
- Fee tier: `3000` = 0.30%
- Tick spacing: 60
- WETH: `0x4200000000000000000000000000000000000006`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- QuoterV2: `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a`
- SwapRouter02: `0x2626664c2603336E57b271c5C0b26F421741e481`

This address is hard-pinned by `BaseExternalPool.sol`; the adapter also verifies `token0/token1/fee` against the pool contract on a Base fork before use.

The pool choice follows the latest liquidity snapshot used in the SYNERGY analysis (2026-08-24), where this WETH/USDC 0.30% pool was the dominant checked Base venue by TVL. The pool address/pair/fee are independently corroborated by current integration registries.
