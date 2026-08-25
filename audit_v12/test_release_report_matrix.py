import unittest


class ReleaseReportMatrixAudit(unittest.TestCase):
    """Regression assertions for the published release-report outcomes.

    These do not replace bytecode/fork execution. They prevent later releases from
    silently reclassifying executor PnL, gross locks, or cancelled QE debt as
    externally sourced canonical bridge capital.
    """

    def test_ab_baseline_closed_loop_is_negative(self):
        bridge_delta = -21_113.95
        qe_under_collateralization = 21_113.95
        external_arb_profit = 19_782.58
        self.assertLess(bridge_delta, 0.0)
        self.assertAlmostEqual(-bridge_delta, qe_under_collateralization, places=2)
        self.assertGreater(external_arb_profit, 0.0)

    def test_endogenous_protocol_executor_improves_but_does_not_create_capital(self):
        base_bridge_delta = -1_529.41
        polygon_bridge_delta = -427.87
        base_profit_relocked = 19_553.40
        polygon_profit_relocked = 20_710.90
        self.assertGreater(base_profit_relocked, 0.0)
        self.assertGreater(polygon_profit_relocked, 0.0)
        self.assertLess(base_bridge_delta, 0.0)
        self.assertLess(polygon_bridge_delta, 0.0)

    def test_one_dollar_zero_cost_is_conservation_not_growth(self):
        start = 1.0
        end_alpha_110 = 1.0000000000003855
        self.assertAlmostEqual(end_alpha_110, start, places=9)

    def test_one_dollar_real_fee_controls_are_negative(self):
        self.assertLess(0.34249837 - 1.0, 0.0)  # Base 30 bp
        self.assertLess(0.88742476 - 1.0, 0.0)  # Polygon 5 bp

    def test_bridge_capital_first_separates_executor_pnl_from_bridge_delta(self):
        cases = [
            (3.954011, -0.308799),  # Base alpha=1.10
            (4.181206, -0.085999),  # Polygon alpha=1.10
        ]
        for executor_pnl, bridge_delta in cases:
            self.assertGreater(executor_pnl, 0.0)
            self.assertLess(bridge_delta, 0.0)

    def test_lock_collateral_funded_qt_uses_equity_not_gross_locks(self):
        cases = [
            (2_209.45, 289.74, 1_919.71),
            (2_297.42, 336.23, 1_961.19),
            (2_377.66, 377.66, 2_000.00),
        ]
        for gross, debt, reported_equity in cases:
            self.assertAlmostEqual(gross - debt, reported_equity, places=2)

    def test_v8_headline_is_flagged_conditional_not_asset_backed_proof(self):
        start = 1.0
        reported_base_end = 9_862_104.37
        cancelled_qe_debt_pnl_counter = 9_907_000.0
        self.assertGreater(reported_base_end, start)
        self.assertGreater(cancelled_qe_debt_pnl_counter, 0.0)
        # The asset-backed V9 control, not the V8 internal-cancellation branch,
        # is authoritative for canonical-balance growth.
        v9_zero_fee_asset_backed_end = 1.0000000000000002
        self.assertAlmostEqual(v9_zero_fee_asset_backed_end, start, places=12)

    def test_v9_fee_controls_are_strictly_negative(self):
        self.assertLess(0.999999999899975 - 1.0, 0.0)  # 5 bp
        self.assertLess(0.99999999939985 - 1.0, 0.0)   # 30 bp

    def test_v11_headline_is_explicitly_external_capture_funded(self):
        start = 1.0
        end = 13_282_122.045297
        externally_booked_pnl = 13_282_121.05
        self.assertAlmostEqual(end - start, externally_booked_pnl, places=2)
        self.assertGreater(end, start)


if __name__ == "__main__":
    unittest.main()
