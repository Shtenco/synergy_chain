# SINERGYCHAIN — source packaging and monetary research

## Engineering contribution

The repository brings together two distinct lines of work: a versioned **Growth OS V7 application source archive** and a Solidity QE V10 experiment with Foundry tests. The combination is meaningful because presentation/application delivery is deliberately separated from monetary-contract experiments, so a successfully deployed site is not confused with a functioning blockchain economy.

## Concrete implementation

The application package is stored as `source/SINERGYCHAIN_GROWTH_OS_V7_SOURCE.tar.gz`; the CI pipeline expands it, installs the documented Node environment and calls the source validation task. A separate Foundry job builds and exercises `qe_v10/src/QEV10TwoElevator.sol` and `qe_v10/test/QEV10TwoElevator.t.sol`. The GitHub Pages workflow extracts **only the public site subset**, not the private server runtime.

The Solidity testbed defines a token, bridge vault, debt book, fixed DEX and two-elevator research controller. Their interplay explores how minted claims, locked collateral, debt and swap-driven returns propagate through a controlled scenario. An internal unit of debt is not itself an externally redeemable asset.

## Mathematical invariant

For a vault with externally available reserve $R$ and redeemable claim exposure $L$, simple solvency requires that the reserve remains sufficient for the claims under the chosen redemption rules:

$$
R-L\geq 0.
$$

An increase in a self-quoted token price alone does not increase the externally redeemable reserve $R$. Any claim of increased HardNAV requires actual asset inflows net of fees and obligations.

## Scientific opportunity

The strongest next experiment is an **end-to-end provenance split**: reproduce the packaged V7 source build independently, pin the archive digest, run Foundry tests on deterministic fixtures and verify that Pages publication contains no server-side permissions. The project could serve as an accessible case study in economic-system packaging, source provenance and controlled financial simulation.

## Entry points

[Source archive](../source/) · [Foundry contracts](../qe_v10/src/QEV10TwoElevator.sol) · [Test specification](../qe_v10/test/QEV10TwoElevator.t.sol) · [Deployment boundaries](../docs/DEPLOYMENT.md)
