# QE V9 EVM audit

Asset-backed dual-bridge EVM test. Bridge capital is derived only from actual canonical ERC-20 balances after zero-fee flash repayment. Protocol-cancellable QE debt is an internal non-redeemable ledger and cannot itself increase bridge balances.

CI trigger: base workflow contains the temporary conditional Foundry job for this branch.
