# Financial OS V8 cross-repository integration contract

The portal is a consumer of monetary and payment state. It is not an authority that may recompute backing, mint capacity or live payment readiness from browser data.

## Source-of-truth chain

```text
ai_financial_system
  FinancialSnapshot + digest
        |
        v
synergychain Financial OS V8
  schema validation + presentation

synergy_pay_system
  MetaPay route -> immutable ExecutionPlan + digest
        |
        v
existing synergy_pay live-readiness / compliance / settlement control
```

## Financial snapshot contract

The authoritative producer is the accounting core. The portal validates against:

`schemas/financial-snapshot.schema.json`

The following ordering is semantic, not cosmetic:

```text
HardNAV <= LiquidNAV <= EconomicNAV
```

The portal must never substitute a market-price estimate for `hard_nav`.

`distributable_profit` means HardNAV growth after subtracting net newly contributed capital. A deposit, capital injection, token mint, self-token market-cap increase or virtual TVL increase is not distributable profit.

A snapshot digest is an integrity identifier only. Production authenticity needs an approved digital-signature/HSM policy and replay protection based on monotonically increasing sequence numbers.

## MetaPay execution-plan contract

The V2 route layer can build a read-only plan only after every route leg is marked executable and compliant by its upstream evidence source.

The plan validates against:

`schemas/metapay-execution-plan.schema.json`

The plan itself has no credentials and no `execute()` action. It must pass to the existing `synergy_pay` live-readiness, provider registry and authenticated execution coordinator. A stale or unready provider invalidates the plan even when its digest remains unchanged.

Multi-leg routes must normalize both destination output and all economic costs into the **original source asset** before routes can be ranked. Fees denominated in KZT, USDC and CNY may not be naively added.

## Portal modes

- `GROWTH`: expansion is allowed only inside productive, reserve, liquidity and risk capacity.
- `NORMAL`: standard operation.
- `DEFENSE`: risk reduction; buyback can be frozen; reserves increase.
- `EMERGENCY`: new risk creation stops; redemptions and recovery take priority.

The UI should display degraded modes prominently. Hiding a risk-state transition is a reporting failure.

## No circular truth

The following feedback loop is forbidden:

```text
portal market price
 -> computed reserve value
 -> higher mint capacity
 -> more token supply
 -> higher displayed market cap
 -> higher reserve value
```

Own-token marks may appear as market analytics but never in HardNAV or hard backing.

## Versioning

Schemas are versioned independently. Consumers must fail closed on unknown major versions. New optional analytics should be added without silently changing the meaning of existing balance-sheet fields.
