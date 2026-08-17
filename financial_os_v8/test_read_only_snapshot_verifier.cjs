'use strict';

const assert = require('assert');
const {
  SnapshotVerificationError,
  sha256Canonical,
  verifyFinancialSnapshotV2,
} = require('./read_only_snapshot_verifier.cjs');

function unsignedSnapshot() {
  return {
    schema: 'financial.snapshot/v2',
    sequence: 7,
    as_of: '2026-08-17T12:00:00+05:00',
    accounting_perimeter: 'SINERGY_CONSOLIDATED',
    reporting_currency: 'USD',
    ledger_digest: '11'.repeat(32),
    ledger_last_entry_digest: '22'.repeat(32),
    account_registry_digest: '33'.repeat(32),
    valuation_policy_id: 'valuation-v1',
    valuation_policy_digest: '44'.repeat(32),
    valuation_policy_as_of: '2026-08-17T11:55:00+05:00',
    period_start_sequence: 3,
    previous_snapshot_digest: '55'.repeat(32),
    hard_external_assets: '120',
    external_liabilities: '20',
    immediate_external_liabilities: '10',
    hard_nav: '100',
    liquid_nav: '105',
    economic_nav: '110',
    hard_coverage: '6',
    net_new_capital: '0',
    realized_external_revenue: '5',
    realized_external_pnl: '3',
    hard_nav_surplus_after_capital: '4',
    required_retention: '1',
    loss_carryforward: '0',
    period_profit_budget: '2',
    required_hard_nav_buffer: '50',
    distribution_capacity: '2',
    liquidity_horizons: [
      {
        horizon_weeks: 1,
        liquid_resources: '100',
        expected_net_outflows: '20',
        lcr: '5',
        liquidity_surplus: '80',
      },
      {
        horizon_weeks: 4,
        liquid_resources: '100',
        expected_net_outflows: '40',
        lcr: '2.5',
        liquidity_surplus: '60',
      },
      {
        horizon_weeks: 8,
        liquid_resources: '100',
        expected_net_outflows: '50',
        lcr: '2',
        liquidity_surplus: '50',
      },
    ],
    maturity_snapshot_refs: ['66'.repeat(32)],
    policy_mode: 'NORMAL',
    invariant_failures: [],
  };
}

function signedSnapshot() {
  const payload = unsignedSnapshot();
  return { ...payload, digest: sha256Canonical(payload) };
}

(function acceptsExactUntamperedSnapshot() {
  const snapshot = signedSnapshot();
  const verified = verifyFinancialSnapshotV2(snapshot);
  assert.strictEqual(verified.schema, 'financial.snapshot/v2');
  assert.strictEqual(verified.sequence, 7);
  assert.strictEqual(verified.digest, snapshot.digest);
  assert.strictEqual(verified.accountingPerimeter, 'SINERGY_CONSOLIDATED');
})();

(function rejectsFinancialValueTamperingWithoutRecomputingIt() {
  const snapshot = signedSnapshot();
  snapshot.hard_nav = '999999999';
  assert.throws(() => verifyFinancialSnapshotV2(snapshot), SnapshotVerificationError);
})();

(function rejectsMissingRequiredFieldEvenWithFreshDigest() {
  const snapshot = unsignedSnapshot();
  delete snapshot.hard_nav;
  snapshot.digest = sha256Canonical(snapshot);
  assert.throws(() => verifyFinancialSnapshotV2(snapshot), /missing required fields/);
})();

(function rejectsUnknownTopLevelFieldEvenWithFreshDigest() {
  const snapshot = unsignedSnapshot();
  snapshot.browser_computed_nav = '999';
  snapshot.digest = sha256Canonical(snapshot);
  assert.throws(() => verifyFinancialSnapshotV2(snapshot), /unknown fields/);
})();

(function rejectsWrongSchemaEvenWithFreshDigest() {
  const snapshot = unsignedSnapshot();
  snapshot.schema = 'financial.snapshot/v999';
  snapshot.digest = sha256Canonical(snapshot);
  assert.throws(() => verifyFinancialSnapshotV2(snapshot), /unsupported snapshot schema/);
})();

(function rejectsNonFiniteJsonNumbers() {
  const snapshot = signedSnapshot();
  snapshot.sequence = Number.POSITIVE_INFINITY;
  assert.throws(() => verifyFinancialSnapshotV2(snapshot), /non-finite number/);
})();

(function rejectsInvalidDigestFields() {
  const snapshot = signedSnapshot();
  snapshot.valuation_policy_digest = 'not-a-digest';
  snapshot.digest = sha256Canonical({ ...snapshot, digest: undefined });
  assert.throws(() => verifyFinancialSnapshotV2(snapshot), /valuation_policy_digest/);
})();

(function exportedVerifierHasNoFinancialRecomputationApi() {
  const moduleApi = require('./read_only_snapshot_verifier.cjs');
  assert.strictEqual(moduleApi.computeHardNAV, undefined);
  assert.strictEqual(moduleApi.computePnL, undefined);
  assert.strictEqual(moduleApi.computeLCR, undefined);
})();

console.log('read_only_snapshot_verifier: structural/tamper tests completed');
