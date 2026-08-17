'use strict';

const {
  CanonicalJsonError,
  assertCanonicalJsonProfile,
  canonicalStringify,
  sha256Canonical,
} = require('./canonical_json_v1.cjs');

const HEX64 = /^[a-fA-F0-9]{64}$/;
const SIGNED_DECIMAL_TEXT = /^(0|-?[1-9][0-9]*|-?0\.[0-9]*[1-9]|-?[1-9][0-9]*\.[0-9]*[1-9])$/;
const NONNEGATIVE_DECIMAL_TEXT = /^(0|[1-9][0-9]*|0\.[0-9]*[1-9]|[1-9][0-9]*\.[0-9]*[1-9])$/;
const EXPECTED_SCHEMA = 'financial.snapshot/v2';
const POLICY_MODES = new Set(['GROWTH', 'NORMAL', 'DEFENSE', 'EMERGENCY']);
const REQUIRED_HORIZONS = Object.freeze([1, 4, 8]);
const REQUIRED_FIELDS = Object.freeze([
  'schema',
  'sequence',
  'as_of',
  'accounting_perimeter',
  'reporting_currency',
  'ledger_digest',
  'ledger_last_entry_digest',
  'account_registry_digest',
  'valuation_policy_id',
  'valuation_policy_digest',
  'valuation_policy_as_of',
  'period_start_sequence',
  'previous_snapshot_digest',
  'hard_external_assets',
  'external_liabilities',
  'immediate_external_liabilities',
  'hard_nav',
  'liquid_nav',
  'economic_nav',
  'hard_coverage',
  'net_new_capital',
  'realized_external_revenue',
  'realized_external_pnl',
  'hard_nav_surplus_after_capital',
  'required_retention',
  'loss_carryforward',
  'period_profit_budget',
  'required_hard_nav_buffer',
  'distribution_capacity',
  'liquidity_horizons',
  'maturity_snapshot_refs',
  'policy_mode',
  'invariant_failures',
  'digest',
]);
const REQUIRED_FIELD_SET = new Set(REQUIRED_FIELDS);
const SIGNED_DECIMAL_FIELDS = Object.freeze([
  'hard_nav',
  'liquid_nav',
  'economic_nav',
  'net_new_capital',
  'realized_external_pnl',
  'hard_nav_surplus_after_capital',
]);
const NONNEGATIVE_DECIMAL_FIELDS = Object.freeze([
  'hard_external_assets',
  'external_liabilities',
  'immediate_external_liabilities',
  'realized_external_revenue',
  'required_retention',
  'loss_carryforward',
  'period_profit_budget',
  'required_hard_nav_buffer',
  'distribution_capacity',
]);

class SnapshotVerificationError extends Error {}

function assertJsonSafe(value, path = '$') {
  try {
    assertCanonicalJsonProfile(value, path);
  } catch (error) {
    if (error instanceof CanonicalJsonError) {
      throw new SnapshotVerificationError(error.message);
    }
    throw error;
  }
}

function requireHex64(value, fieldName) {
  if (typeof value !== 'string' || !HEX64.test(value)) {
    throw new SnapshotVerificationError(`${fieldName} must be a 64-character hex digest`);
  }
  return value.toLowerCase();
}

function requireDecimalText(value, fieldName, { nonnegative = false, nullable = false } = {}) {
  if (nullable && value === null) {
    return null;
  }
  const pattern = nonnegative ? NONNEGATIVE_DECIMAL_TEXT : SIGNED_DECIMAL_TEXT;
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new SnapshotVerificationError(
      `${fieldName} must be a canonical ${nonnegative ? 'non-negative ' : ''}decimal string${nullable ? ' or null' : ''}`,
    );
  }
  return value;
}

function requireExactTopLevelShape(snapshot) {
  const keys = Object.keys(snapshot);
  const missing = REQUIRED_FIELDS.filter(
    (field) => !Object.prototype.hasOwnProperty.call(snapshot, field),
  );
  const unknown = keys.filter((field) => !REQUIRED_FIELD_SET.has(field));
  if (missing.length) {
    throw new SnapshotVerificationError(`snapshot missing required fields: ${missing.join(', ')}`);
  }
  if (unknown.length) {
    throw new SnapshotVerificationError(`snapshot contains unknown fields: ${unknown.join(', ')}`);
  }
}

function requireLiquidityHorizonShape(liquidityHorizons) {
  if (!Array.isArray(liquidityHorizons)) {
    throw new SnapshotVerificationError('liquidity_horizons must be an array');
  }
  if (liquidityHorizons.length !== REQUIRED_HORIZONS.length) {
    throw new SnapshotVerificationError(
      'liquidity_horizons must contain exactly 1w, 4w and 8w states',
    );
  }
  const seen = [];
  liquidityHorizons.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new SnapshotVerificationError(`liquidity_horizons[${index}] must be an object`);
    }
    const expectedKeys = new Set([
      'horizon_weeks',
      'liquid_resources',
      'expected_net_outflows',
      'lcr',
      'liquidity_surplus',
    ]);
    const keys = Object.keys(item);
    if (keys.length !== expectedKeys.size || keys.some((key) => !expectedKeys.has(key))) {
      throw new SnapshotVerificationError(`liquidity_horizons[${index}] has an invalid shape`);
    }
    if (!Number.isSafeInteger(item.horizon_weeks) || !REQUIRED_HORIZONS.includes(item.horizon_weeks)) {
      throw new SnapshotVerificationError(
        `liquidity_horizons[${index}].horizon_weeks must be safe integer 1, 4 or 8`,
      );
    }
    seen.push(item.horizon_weeks);
    requireDecimalText(
      item.liquid_resources,
      `liquidity_horizons[${index}].liquid_resources`,
      { nonnegative: true },
    );
    requireDecimalText(
      item.expected_net_outflows,
      `liquidity_horizons[${index}].expected_net_outflows`,
      { nonnegative: true },
    );
    requireDecimalText(item.lcr, `liquidity_horizons[${index}].lcr`, {
      nonnegative: true,
      nullable: true,
    });
    requireDecimalText(
      item.liquidity_surplus,
      `liquidity_horizons[${index}].liquidity_surplus`,
    );
  });
  seen.sort((a, b) => a - b);
  if (seen.some((value, index) => value !== REQUIRED_HORIZONS[index])) {
    throw new SnapshotVerificationError(
      'liquidity_horizons must contain unique 1w, 4w and 8w states',
    );
  }
}

function verifyFinancialSnapshotV2(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new SnapshotVerificationError('snapshot must be an object');
  }
  assertJsonSafe(snapshot);
  requireExactTopLevelShape(snapshot);
  if (snapshot.schema !== EXPECTED_SCHEMA) {
    throw new SnapshotVerificationError(`unsupported snapshot schema: ${snapshot.schema}`);
  }
  if (!Number.isSafeInteger(snapshot.sequence) || snapshot.sequence < 0) {
    throw new SnapshotVerificationError('sequence must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(snapshot.period_start_sequence) || snapshot.period_start_sequence < 0) {
    throw new SnapshotVerificationError('period_start_sequence must be a non-negative safe integer');
  }
  if (snapshot.period_start_sequence > snapshot.sequence) {
    throw new SnapshotVerificationError('period_start_sequence cannot exceed sequence');
  }
  if (typeof snapshot.accounting_perimeter !== 'string' || !snapshot.accounting_perimeter.trim()) {
    throw new SnapshotVerificationError('accounting_perimeter is required');
  }
  if (typeof snapshot.reporting_currency !== 'string' || !snapshot.reporting_currency.trim()) {
    throw new SnapshotVerificationError('reporting_currency is required');
  }
  if (typeof snapshot.valuation_policy_id !== 'string' || !snapshot.valuation_policy_id.trim()) {
    throw new SnapshotVerificationError('valuation_policy_id is required');
  }
  if (!POLICY_MODES.has(snapshot.policy_mode)) {
    throw new SnapshotVerificationError(
      'policy_mode must be GROWTH, NORMAL, DEFENSE or EMERGENCY',
    );
  }

  SIGNED_DECIMAL_FIELDS.forEach((field) => requireDecimalText(snapshot[field], field));
  NONNEGATIVE_DECIMAL_FIELDS.forEach((field) =>
    requireDecimalText(snapshot[field], field, { nonnegative: true }),
  );
  requireDecimalText(snapshot.hard_coverage, 'hard_coverage', {
    nonnegative: true,
    nullable: true,
  });

  const digest = requireHex64(snapshot.digest, 'digest');
  requireHex64(snapshot.ledger_digest, 'ledger_digest');
  requireHex64(snapshot.ledger_last_entry_digest, 'ledger_last_entry_digest');
  requireHex64(snapshot.account_registry_digest, 'account_registry_digest');
  requireHex64(snapshot.valuation_policy_digest, 'valuation_policy_digest');
  if (snapshot.previous_snapshot_digest !== null) {
    requireHex64(snapshot.previous_snapshot_digest, 'previous_snapshot_digest');
  }
  if (!Array.isArray(snapshot.maturity_snapshot_refs)) {
    throw new SnapshotVerificationError('maturity_snapshot_refs must be an array');
  }
  snapshot.maturity_snapshot_refs.forEach((value, index) =>
    requireHex64(value, `maturity_snapshot_refs[${index}]`),
  );
  requireLiquidityHorizonShape(snapshot.liquidity_horizons);
  if (!Array.isArray(snapshot.invariant_failures)) {
    throw new SnapshotVerificationError('invariant_failures must be an array');
  }
  if (snapshot.invariant_failures.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new SnapshotVerificationError(
      'invariant_failures must contain only non-empty strings',
    );
  }

  const payload = { ...snapshot };
  delete payload.digest;
  const expectedDigest = sha256Canonical(payload);
  if (digest !== expectedDigest) {
    throw new SnapshotVerificationError(
      `snapshot digest mismatch: expected=${expectedDigest} got=${digest}`,
    );
  }

  return Object.freeze({
    schema: EXPECTED_SCHEMA,
    sequence: snapshot.sequence,
    digest,
    ledgerDigest: snapshot.ledger_digest.toLowerCase(),
    valuationPolicyDigest: snapshot.valuation_policy_digest.toLowerCase(),
    accountRegistryDigest: snapshot.account_registry_digest.toLowerCase(),
    accountingPerimeter: snapshot.accounting_perimeter,
    reportingCurrency: snapshot.reporting_currency,
  });
}

module.exports = {
  EXPECTED_SCHEMA,
  REQUIRED_FIELDS,
  SnapshotVerificationError,
  canonicalStringify,
  sha256Canonical,
  verifyFinancialSnapshotV2,
};
