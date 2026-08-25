from dataclasses import dataclass


@dataclass(frozen=True)
class V11Config:
    start_bridge_capital: float = 1.0
    cycles: int = 10_000
    leverage: float = 100.0
    external_pool_tvl: float = 111_528_225.62
    depth_fraction: float = 0.01
    net_external_capture_bps: float = 12.0
    gas_per_supercycle: float = 0.02


@dataclass(frozen=True)
class V11Result:
    bridge_capital: float
    cumulative_external_pnl: float
    cumulative_gas: float
    cumulative_notional: float
    executed_cycles: int


def run_v11(cfg: V11Config) -> V11Result:
    """Reproduce the V11 solvent-frontier recurrence.

    Only externally sourced canonical PnL may increase bridge capital. A candidate
    cycle is skipped when net canonical PnL is non-positive, matching the V11
    closed-control rule that zero/negative external capture cannot manufacture
    growth from internal QE/QT bookkeeping.
    """
    capital = cfg.start_bridge_capital
    cumulative_external_pnl = 0.0
    cumulative_gas = 0.0
    cumulative_notional = 0.0
    executed = 0
    max_notional = cfg.depth_fraction * cfg.external_pool_tvl

    for _ in range(cfg.cycles):
        notional = min(cfg.leverage * capital, max_notional)
        gross_external_capture = notional * cfg.net_external_capture_bps / 10_000.0
        net = gross_external_capture - cfg.gas_per_supercycle
        if net <= 0.0:
            continue
        capital += net
        cumulative_external_pnl += net
        cumulative_gas += cfg.gas_per_supercycle
        cumulative_notional += notional
        executed += 1

    return V11Result(
        bridge_capital=capital,
        cumulative_external_pnl=cumulative_external_pnl,
        cumulative_gas=cumulative_gas,
        cumulative_notional=cumulative_notional,
        executed_cycles=executed,
    )


def capture_bps_required_for_target(
    target: float,
    *,
    start: float = 1.0,
    cycles: int = 10_000,
    leverage: float = 100.0,
    external_pool_tvl: float = 111_528_225.62,
    depth_fraction: float = 0.01,
    gas: float = 0.02,
) -> float:
    """Binary-search the constant net capture required to reach target capital."""
    lo, hi = 0.0, 500.0
    for _ in range(100):
        mid = (lo + hi) / 2.0
        result = run_v11(
            V11Config(
                start_bridge_capital=start,
                cycles=cycles,
                leverage=leverage,
                external_pool_tvl=external_pool_tvl,
                depth_fraction=depth_fraction,
                net_external_capture_bps=mid,
                gas_per_supercycle=gas,
            )
        )
        if result.bridge_capital >= target:
            hi = mid
        else:
            lo = mid
    return hi


def canonical_bridge_delta(external_value_capture: float, external_costs: float) -> float:
    """Consolidated canonical-reserve identity used by the V9/V10/V12 audit."""
    return external_value_capture - external_costs


def bridge_equity(gross_locks: float, qe_debt: float) -> float:
    """Debt-adjusted bridge equity from the lock-collateral retest."""
    return gross_locks - qe_debt
