# SYNERGYCHAIN Growth OS ↔ PQ-EVM/NEXUS integration

## Repository roles

- `Shtenco/synergy_ai_blockchain` — consensus/execution core: PQ transaction authorization, validator/P2P PQ migration, deterministic NEXUS precompiles.
- `Shtenco/agi_olga` — NEXUS research/source checkpoints and deterministic consensus-export pipeline.
- `Shtenco/synergy_pay_system` — omnichain settlement, bridge/migration adapters, HSM/MPC/readiness/compliance controls.
- `Shtenco/synergychain` — Growth OS / OLGA product surface and user orchestration.

Growth OS must consume the other layers through authenticated APIs/RPC. It must never become the custodian of raw blockchain or PQ private keys.

## User-facing PQ identity

The product may display one SYNERGY PQ identity associated with multiple legacy accounts:

```text
SYNERGY PQ Account
  ├─ Bitcoin legacy binding
  ├─ Ethereum legacy binding
  ├─ Solana legacy binding
  └─ native SYNERGY PQ account
```

The binding process requires both source-chain ownership proof and proof of possession of the independently generated PQ key.

## Required wallet/RPC capabilities

The PQ-EVM node/wallet service should expose an authenticated integration surface equivalent to:

- `synergy_getPqAccount(accountId)` — public-key IDs, policy, nonce, activation state;
- `synergy_preparePqTransaction(tx)` — return canonical unsigned PQ-EVM envelope/signing payload;
- `synergy_submitPqTransaction(envelope)` — submit already signed transaction;
- `synergy_getNexusManifest()` — active model root, implementation hash, activation block and gas schedule;
- `synergy_nexusCall(input)` — read-only simulation against the active deterministic NEXUS precompile;
- `synergy_getMigrationBinding(sourceChain, legacyId)` — public migration state;
- `synergy_getMigrationProofStatus(id)` — source finality/proof/mint status;
- `synergy_getAssetBacking(assetId)` — finalized locked, withdrawals, minted and backing margin.

Names are an integration contract for the project and may later be mapped to exact JSON-RPC method specifications.

## Signing boundary

Growth OS/OLGA can construct intents and explain transactions, but signing happens in a dedicated wallet/HSM/MPC boundary.

```text
OLGA/NEXUS intent
      |
      v
transaction simulation
      |
      v
human/policy approval
      |
      v
PQ wallet / HSM / MPC signing
      |
      v
SYNERGY PQ-EVM submission
```

No raw seed phrase, Bitcoin private key, Ethereum private key, Solana private key, ML-DSA secret or SLH-DSA secret is sent to the OLGA chat/model context.

## NEXUS in the product and NEXUS in consensus are different trust surfaces

### Product NEXUS

Can use larger models, tools, memory and external data for planning/explanation.

### Consensus NEXUS

Must be the frozen deterministic integer model/precompile identified by the active `model_root` or a deterministic proof verifier for `NEXUS_PROVED` mode.

Product NEXUS must never claim an off-chain answer is the same as consensus inference unless the model root, input encoding and returned proof/result match the chain.

## Economic safety

AI recommendations do not override exact invariants. In particular Growth OS must surface and verify:

`minted_on_synergy <= finalized_locked_on_source - finalized_withdrawals`

and must not present unfinalized migration credits as spendable canonical reserves.

## Migration UX

1. Generate independent PQ keys in wallet/HSM/MPC.
2. Display the PQ public identity and backup/recovery status.
3. Connect legacy BTC/ETH/SOL wallet only to sign the binding statement.
4. Verify both legacy and PQ proofs.
5. Present source-chain lock/burn transaction separately.
6. Track source finality/light-client proof.
7. Mint only after proof acceptance.
8. From that point, SYNERGY-native ownership is controlled by the PQ account, not by the old legacy key.

## Model-upgrade UX

Before a NEXUS consensus-model activation, Growth OS should display:

- old and new model roots;
- activation height/time estimate;
- model provenance/checkpoint report;
- compatibility/gas changes;
- governance authorization;
- validator readiness percentage.

The web/product layer does not download a model on behalf of validators during block execution.
