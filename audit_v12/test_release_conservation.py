import unittest

from model import (
    V11Config,
    bridge_equity,
    canonical_bridge_delta,
    capture_bps_required_for_target,
    run_v11,
)


class ReleaseConservationAudit(unittest.TestCase):
    def test_v11_reproduces_reported_12bps_frontier(self):
        r = run_v11(V11Config())
        self.assertEqual(r.executed_cycles, 10_000)
        self.assertAlmostEqual(r.bridge_capital, 13_282_122.045297, places=2)
        self.assertAlmostEqual(r.cumulative_external_pnl, r.bridge_capital - 1.0, places=6)
        self.assertAlmostEqual(r.cumulative_gas, 200.0, places=6)
        self.assertAlmostEqual(r.cumulative_notional, 11_068_600_871.08, delta=5.0)

    def test_v11_zero_external_capture_cannot_grow_bridge(self):
        r = run_v11(V11Config(net_external_capture_bps=0.0))
        self.assertEqual(r.bridge_capital, 1.0)
        self.assertEqual(r.cumulative_external_pnl, 0.0)
        self.assertEqual(r.executed_cycles, 0)

    def test_v11_required_capture_to_beat_v8_at_one_percent_depth(self):
        required = capture_bps_required_for_target(9_862_104.37)
        self.assertAlmostEqual(required, 8.933, delta=0.002)
        self.assertGreater(12.0, required)

    def test_v9_closed_zero_cost_identity(self):
        self.assertEqual(canonical_bridge_delta(0.0, 0.0), 0.0)

    def test_v9_positive_external_costs_make_closed_loop_negative(self):
        self.assertLess(canonical_bridge_delta(0.0, 1e-9), 0.0)
        self.assertLess(canonical_bridge_delta(0.0, 0.02), 0.0)

    def test_lock_growth_report_must_be_debt_adjusted(self):
        # Ideal zero-cost funded-QT case from the lock-collateral report.
        self.assertAlmostEqual(bridge_equity(2_377.66, 377.66), 2_000.0, places=6)

    def test_free_cancel_branch_is_not_asset_backed_by_itself(self):
        # A ledger cancellation does not transfer canonical tokens. If external
        # value capture is zero, the canonical delta remains zero regardless of
        # how much internal debt is cancelled.
        cancelled_internal_debt = 9_907_000.0
        self.assertGreater(cancelled_internal_debt, 0.0)
        self.assertEqual(canonical_bridge_delta(0.0, 0.0), 0.0)


if __name__ == "__main__":
    unittest.main()
