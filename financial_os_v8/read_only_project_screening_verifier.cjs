'use strict';

const {
  SnapshotVerificationError,
  sha256Canonical,
} = require('./read_only_snapshot_verifier.cjs');

const HEX64 = /^[a-fA-F0-9]{64}$/;
const NONNEGATIVE_DECIMAL_TEXT = /^[0-9]+(\.[0-9]+)?$/;
const UNIT_INTERVAL_DECIMAL_TEXT = /^(0(\.[0-9]+)?|1(\.0+)?)$/;
const EXPECTED_SCHEMA = 'project.screening/v1';
const ALLOWED_STATUSES = new Set(['REVIEWABLE', 'NO_ACTION']);
const ALLOWED_EVIDENCE_STATUSES = new Set([
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

class ProjectScreeningVerificationError extends SnapshotVerificationError {}

function requireHex64(value, fieldName, { nullable = false } = {}) {
  if (nullable && value === null) {
    return null;
  }
  if (typeof value !== 'string' || !HEX64.test(value)) {
    throw new ProjectScreeningVerificationError(
      `${fieldName} must be a 64-character hex digest${nullable ? ' or null' : ''}`,
    );
  }
  return value.toLowerCase();
}

function requireNonnegativeDecimalText(value, fieldName) {
  if (typeof value !== 'string' || !NONNEGATIVE_DECIMAL_TEXT.test(value)) {
    throw new ProjectScreeningVerificationError(
      `${fieldName} must be a canonical non-negative decimal string`,
    );
  }
}

function requireExactShape(result) {
  const keys = Object.keys(result);
  const missing = REQUIRED_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(result, field));
  const unknown = keys.filter((field) => !REQUIRED_FIELD_SET.has(field));
  if (missing.length) {
    throw new ProjectScreeningVerificationError(
      `project screening missing required fields: ${missing.join(', ')}`,
    );
  }
  if (unknown.length) {
    throw new ProjectScreeningVerificationError(
      `project screening contains unknown fields: ${unknown.join(', ')}`,
    );
  }
}

function verifyProjectScreeningV1(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new ProjectScreeningVerificationError('project screening result must be an object');
  }
  requireExactShape(result);
  if (result.schema !== EXPECTED_SCHEMA) {
    throw new ProjectScreeningVerificationError(`unsupported project screening schema: ${result.schema}`);
  }
  if (typeof result.project_id !== 'string' || !result.project_id.trim()) {
    throw new ProjectScreeningVerificationError('project_id is required');
  }
  if (typeof result.policy_id !== 'string' || !result.policy_id.trim()) {
    throw new ProjectScreeningVerificationError('policy_id is required');
  }
  if (typeof result.reporting_currency !== 'string' || !result.reporting_currency.trim()) {
    throw new ProjectScreeningVerificationError('reporting_currency is required');
  }

  const digest = requireHex64(result.digest, 'digest');
  requireHex64(result.proposal_digest, 'proposal_digest');
  requireHex64(result.evidence_bundle_digest, 'evidence_bundle_digest', { nullable: true });
  requireHex64(result.policy_digest, 'policy_digest');
  requireHex64(result.translation_set_digest, 'translation_set_digest');

  [
    'requested_funding',
    'private_capital',
    'first_loss_capital',
    'private_to_requested_ratio',
    'first_loss_to_requested_ratio',
  ].forEach((field) => requireNonnegativeDecimalText(result[field], field));

  if (result.risk_score !== null) {
    if (typeof result.risk_score !== 'string' || !UNIT_INTERVAL_DECIMAL_TEXT.test(result.risk_score)) {
      throw new ProjectScreeningVerificationError(
        'risk_score must be a canonical decimal string in [0,1] or null',
      );
    }
  }
  if (!Number.isInteger(result.maturity_weeks) || result.maturity_weeks < 1) {
    throw new ProjectScreeningVerificationError('maturity_weeks must be a positive integer');
  }
  if (!ALLOWED_EVIDENCE_STATUSES.has(result.evidence_status)) {
    throw new ProjectScreeningVerificationError('unsupported evidence_status');
  }
  if (!ALLOWED_STATUSES.has(result.status)) {
    throw new ProjectScreeningVerificationError(
      'status must be REVIEWABLE or NO_ACTION; authorizing statuses are forbidden',
    );
  }
  if (!Array.isArray(result.blockers)) {
    throw new ProjectScreeningVerificationError('blockers must be an array');
  }
  if (result.blockers.some((blocker) => typeof blocker !== 'string' || !blocker.trim())) {
    throw new ProjectScreeningVerificationError('blockers must contain only non-empty strings');
  }
  if (new Set(result.blockers).size !== result.blockers.length) {
    throw new ProjectScreeningVerificationError('blockers must be unique');
  }
  if (result.status === 'REVIEWABLE' && result.blockers.length !== 0) {
    throw new ProjectScreeningVerificationError('REVIEWABLE result cannot contain blockers');
  }
  if (result.status === 'NO_ACTION' && result.blockers.length === 0) {
    throw new ProjectScreeningVerificationError('NO_ACTION result requires at least one blocker');
  }

  const payload = { ...result };
  delete payload.digest;
  const expectedDigest = sha256Canonical(payload);
  if (digest !== expectedDigest) {
    throw new ProjectScreeningVerificationError(
      `project screening digest mismatch: expected=${expectedDigest} got=${digest}`,
    );
  }

  return Object.freeze({
    schema: EXPECTED_SCHEMA,
    projectId: result.project_id,
    status: result.status,
    blockers: Object.freeze([...result.blockers]),
    digest,
    proposalDigest: result.proposal_digest.toLowerCase(),
    evidenceBundleDigest:
      result.evidence_bundle_digest === null ? null : result.evidence_bundle_digest.toLowerCase(),
    policyDigest: result.policy_digest.toLowerCase(),
    translationSetDigest: result.translation_set_digest.toLowerCase(),
  });
}

module.exports = {
  EXPECTED_SCHEMA,
  ALLOWED_STATUSES,
  ProjectScreeningVerificationError,
  verifyProjectScreeningV1,
};
