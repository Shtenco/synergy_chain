'use strict';

const crypto = require('crypto');

const HEX64 = /^[a-fA-F0-9]{64}$/;
const EXPECTED_SCHEMA = 'financial.snapshot/v2';

class SnapshotVerificationError extends Error {}

function assertJsonSafe(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new SnapshotVerificationError(`${path} contains a non-finite number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach((key) => assertJsonSafe(value[key], `${path}.${key}`));
    return;
  }
  throw new SnapshotVerificationError(`${path} contains a non-JSON value`);
}

function canonicalStringify(value) {
  assertJsonSafe(value);
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function sha256Canonical(payload) {
  return crypto.createHash('sha256').update(canonicalStringify(payload), 'utf8').digest('hex');
}

function requireHex64(value, fieldName) {
  if (typeof value !== 'string' || !HEX64.test(value)) {
    throw new SnapshotVerificationError(`${fieldName} must be a 64-character hex digest`);
  }
  return value.toLowerCase();
}

function verifyFinancialSnapshotV2(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new SnapshotVerificationError('snapshot must be an object');
  }
  assertJsonSafe(snapshot);
  if (snapshot.schema !== EXPECTED_SCHEMA) {
    throw new SnapshotVerificationError(`unsupported snapshot schema: ${snapshot.schema}`);
  }
  if (!Number.isInteger(snapshot.sequence) || snapshot.sequence < 0) {
    throw new SnapshotVerificationError('sequence must be a non-negative integer');
  }
  if (typeof snapshot.accounting_perimeter !== 'string' || !snapshot.accounting_perimeter.trim()) {
    throw new SnapshotVerificationError('accounting_perimeter is required');
  }
  if (typeof snapshot.reporting_currency !== 'string' || !snapshot.reporting_currency.trim()) {
    throw new SnapshotVerificationError('reporting_currency is required');
  }

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
  SnapshotVerificationError,
  canonicalStringify,
  sha256Canonical,
  verifyFinancialSnapshotV2,
};
