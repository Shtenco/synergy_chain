'use strict';

const {
  CanonicalJsonError,
  assertCanonicalJsonProfile,
  canonicalStringify,
  sha256Canonical,
} = require('./canonical_json_v1.cjs');

const HEX64 = /^[a-fA-F0-9]{64}$/;
const NONNEGATIVE_DECIMAL_TEXT = /^(0|[1-9][0-9]*|0\.[0-9]*[1-9]|[1-9][0-9]*\.[0-9]*[1-9])$/;
const UNIT_INTERVAL_DECIMAL_TEXT = /^(0|1|0\.[0-9]*[1-9])$/;
const REPORTING_CURRENCY = /^[A-Z0-9]{1,16}$/;
const EXPECTED_SCHEMA = 'project.screening/v1';
const STATUSES = new Set(['REVIEWABLE', 'NO_ACTION']);
const EVIDENCE_STATUSES = new Set([
  'SCENARIO',
  'MODEL_ESTIMATE',
  'OBSERVED_OPERATIONAL',
  'EXTERNALLY_SETTLED',
  'AUDITED',
]);
const REQUIRED_FIELDS = Object.freeze([
  'schema',
  'project_id',
  'proposal_digest',
  'evidence_bundle_digest',
  'policy_id',
  'policy_digest',
  'translation_set_digest',
  'reporting_currency',
  'requested_funding',
  'private_capital',
  'first_loss_capital',
  'private_to_requested_ratio',
  'first_loss_to_requested_ratio',
  'evidence_status',
  'risk_score',
  'maturity_weeks',
  'status',
  'blockers',
  'digest',
]);
const REQUIRED_FIELD_SET = new Set(REQUIRED_FIELDS);
const NONNEGATIVE_DECIMAL_FIELDS = Object.freeze([
  'requested_funding',
  'private_capital',
  'first_loss_capital',
  'private_to_requested_ratio',
  'first_loss_to_requested_ratio',
]);

class ProjectScreeningVerificationError extends Error {}

function fail(message) {
  throw new ProjectScreeningVerificationError(message);
}

function assertJsonSafe(value, path = '$') {
  try {
    assertCanonicalJsonProfile(value, path);
  } catch (error) {
    if (error instanceof CanonicalJsonError) {
      throw new ProjectScreeningVerificationError(error.message);
    }
    throw error;
  }
}

function requireHex64(value, fieldName, { nullable = false } = {}) {
  if (nullable && value === null) {
    return null;
  }
  if (typeof value !== 'string' || !HEX64.test(value)) {
    fail(`${fieldName} must be a 64-character hex digest${nullable ? ' or null' : ''}`);
  }
  return value.toLowerCase();
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${fieldName} is required`);
  }
  return value;
}

function requireDecimalText(value, fieldName, pattern = NONNEGATIVE_DECIMAL_TEXT) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail(`${fieldName} must be canonical decimal text`);
  }
  return value;
}

function requireExactTopLevelShape(payload) {
  const keys = Object.keys(payload);
  const missing = REQUIRED_FIELDS.filter(
    (field) => !Object.prototype.hasOwnProperty.call(payload, field),
  );
  const unknown = keys.filter((field) => !REQUIRED_FIELD_SET.has(field));
  if (missing.length) {
    fail(`project screening result missing required fields: ${missing.join(', ')}`);
  }
  if (unknown.length) {
    fail(`project screening result contains unknown fields: ${unknown.join(', ')}`);
  }
}

function verifyProjectScreeningV1V2(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('project screening result must be an object');
  }

  assertJsonSafe(payload);
  requireExactTopLevelShape(payload);

  if (payload.schema !== EXPECTED_SCHEMA) {
    fail(`unsupported project screening schema: ${payload.schema}`);
  }

  requireNonEmptyString(payload.project_id, 'project_id');
  requireNonEmptyString(payload.policy_id, 'policy_id');

  const proposalDigest = requireHex64(payload.proposal_digest, 'proposal_digest');
  const evidenceBundleDigest = requireHex64(
    payload.evidence_bundle_digest,
    'evidence_bundle_digest',
    { nullable: true },
  );
  const policyDigest = requireHex64(payload.policy_digest, 'policy_digest');
  const translationSetDigest = requireHex64(
    payload.translation_set_digest,
    'translation_set_digest',
  );
  const digest = requireHex64(payload.digest, 'digest');

  if (
    typeof payload.reporting_currency !== 'string' ||
    !REPORTING_CURRENCY.test(payload.reporting_currency)
  ) {
    fail('reporting_currency must be uppercase canonical currency text');
  }

  NONNEGATIVE_DECIMAL_FIELDS.forEach((field) =>
    requireDecimalText(payload[field], field),
  );

  if (payload.risk_score !== null) {
    requireDecimalText(payload.risk_score, 'risk_score', UNIT_INTERVAL_DECIMAL_TEXT);
  }

  if (
    !Number.isSafeInteger(payload.maturity_weeks) ||
    payload.maturity_weeks < 1
  ) {
    fail('maturity_weeks must be a positive cross-language safe integer');
  }

  if (!EVIDENCE_STATUSES.has(payload.evidence_status)) {
    fail(`unsupported evidence_status: ${payload.evidence_status}`);
  }
  if (!STATUSES.has(payload.status)) {
    fail(`unsupported non-authorizing screening status: ${payload.status}`);
  }

  if (!Array.isArray(payload.blockers)) {
    fail('blockers must be an array');
  }
  if (
    payload.blockers.some(
      (item) => typeof item !== 'string' || !item.trim(),
    )
  ) {
    fail('blockers must contain only non-empty strings');
  }
  if (payload.blockers.length !== new Set(payload.blockers).size) {
    fail('blockers must be unique');
  }

  if (payload.status === 'REVIEWABLE' && payload.blockers.length !== 0) {
    fail('REVIEWABLE result cannot contain blockers');
  }
  if (payload.status === 'NO_ACTION' && payload.blockers.length === 0) {
    fail('NO_ACTION result requires at least one blocker');
  }

  const unsigned = { ...payload };
  delete unsigned.digest;
  const expectedDigest = sha256Canonical(unsigned);
  if (digest !== expectedDigest) {
    fail(`project screening digest mismatch: expected=${expectedDigest} got=${digest}`);
  }

  return Object.freeze({
    schema: EXPECTED_SCHEMA,
    projectId: payload.project_id,
    proposalDigest,
    evidenceBundleDigest,
    policyDigest,
    translationSetDigest,
    reportingCurrency: payload.reporting_currency,
    status: payload.status,
    blockers: Object.freeze([...payload.blockers]),
    digest,
    reviewable: payload.status === 'REVIEWABLE',
  });
}

module.exports = {
  EXPECTED_SCHEMA,
  REQUIRED_FIELDS,
  ProjectScreeningVerificationError,
  canonicalStringify,
  sha256Canonical,
  verifyProjectScreeningV1V2,
};
