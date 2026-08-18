'use strict';

const { sha256Canonical } = require('./canonical_json_v1.cjs');

const HEX64 = /^[a-fA-F0-9]{64}$/;
const CANONICAL_NONNEGATIVE_DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;
const EXPECTED_SCHEMA = 'capital.authorization/v1';
const MAX_SAFE_JSON_INTEGER = Number.MAX_SAFE_INTEGER;
const REQUIRED_FIELDS = Object.freeze([
  'schema', 'authorization_id', 'project_id', 'decision', 'decision_authority',
  'funding_asset', 'approved_amount', 'screening_digest', 'financial_snapshot_digest',
  'financial_snapshot_sequence', 'valuation_policy_digest', 'requirement_registry_digest',
  'decision_evidence_digest', 'notes_digest', 'decided_at', 'expires_at',
  'execution_authority', 'ai_authority', 'digest',
]);
const REQUIRED_FIELD_SET = new Set(REQUIRED_FIELDS);
const DECISION_AUTHORITIES = new Set(['HUMAN_COMMITTEE', 'MULTISIG_GOVERNANCE']);

class CapitalAuthorizationVerificationError extends Error {}

function requireText(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CapitalAuthorizationVerificationError(`${fieldName} is required`);
  }
  return value.trim();
}

function requireHex64(value, fieldName, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !HEX64.test(value)) {
    throw new CapitalAuthorizationVerificationError(
      `${fieldName} must be a 64-character hexadecimal digest`,
    );
  }
  return value.toLowerCase();
}

function requireCanonicalAmount(value) {
  if (typeof value !== 'string' || !CANONICAL_NONNEGATIVE_DECIMAL.test(value)) {
    throw new CapitalAuthorizationVerificationError(
      'approved_amount must be a canonical non-negative decimal string',
    );
  }
  if (value === '0') {
    throw new CapitalAuthorizationVerificationError(
      'APPROVED authorization requires positive approved_amount',
    );
  }
}

function parseUtcTime(value, fieldName) {
  if (typeof value !== 'string' || !value.endsWith('Z')) {
    throw new CapitalAuthorizationVerificationError(`${fieldName} must be canonical UTC Z time`);
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new CapitalAuthorizationVerificationError(`${fieldName} must be valid ISO-8601 time`);
  }
  return millis;
}

function verifyCapitalAuthorizationV1(payload, { now = null } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CapitalAuthorizationVerificationError('capital authorization must be an object');
  }
  const keys = Object.keys(payload);
  const missing = REQUIRED_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(payload, field));
  const unknown = keys.filter((field) => !REQUIRED_FIELD_SET.has(field));
  if (missing.length || unknown.length) {
    throw new CapitalAuthorizationVerificationError(
      `capital authorization shape mismatch: missing=${missing.join(',')} unknown=${unknown.join(',')}`,
    );
  }
  if (payload.schema !== EXPECTED_SCHEMA) {
    throw new CapitalAuthorizationVerificationError(`unsupported schema: ${payload.schema}`);
  }
  requireText(payload.authorization_id, 'authorization_id');
  requireText(payload.project_id, 'project_id');
  requireText(payload.funding_asset, 'funding_asset');
  if (payload.decision !== 'APPROVED') {
    throw new CapitalAuthorizationVerificationError('read-only funding view requires APPROVED decision');
  }
  if (!DECISION_AUTHORITIES.has(payload.decision_authority)) {
    throw new CapitalAuthorizationVerificationError('unsupported decision_authority');
  }
  if (payload.execution_authority !== 'SEPARATE_METAPAY_HANDOFF') {
    throw new CapitalAuthorizationVerificationError('embedded payment execution authority is forbidden');
  }
  if (payload.ai_authority !== 'NONE') {
    throw new CapitalAuthorizationVerificationError('AI capital authorization is forbidden');
  }
  requireCanonicalAmount(payload.approved_amount);
  requireHex64(payload.screening_digest, 'screening_digest');
  requireHex64(payload.financial_snapshot_digest, 'financial_snapshot_digest');
  requireHex64(payload.valuation_policy_digest, 'valuation_policy_digest');
  requireHex64(payload.requirement_registry_digest, 'requirement_registry_digest');
  requireHex64(payload.decision_evidence_digest, 'decision_evidence_digest');
  requireHex64(payload.notes_digest, 'notes_digest', true);
  if (
    !Number.isSafeInteger(payload.financial_snapshot_sequence)
    || payload.financial_snapshot_sequence < 0
  ) {
    throw new CapitalAuthorizationVerificationError(
      'financial_snapshot_sequence must be a non-negative safe integer',
    );
  }
  const decidedAt = parseUtcTime(payload.decided_at, 'decided_at');
  const expiresAt = parseUtcTime(payload.expires_at, 'expires_at');
  if (expiresAt <= decidedAt) {
    throw new CapitalAuthorizationVerificationError('expires_at must follow decided_at');
  }

  const suppliedDigest = requireHex64(payload.digest, 'digest');
  const digestPayload = { ...payload };
  delete digestPayload.digest;
  const expectedDigest = sha256Canonical(digestPayload);
  if (suppliedDigest !== expectedDigest) {
    throw new CapitalAuthorizationVerificationError(
      `capital authorization digest mismatch: expected=${expectedDigest} got=${suppliedDigest}`,
    );
  }

  let validNow = null;
  if (now !== null) {
    const nowMillis = now instanceof Date ? now.getTime() : Date.parse(now);
    if (!Number.isFinite(nowMillis)) {
      throw new CapitalAuthorizationVerificationError('now must be a valid Date or ISO time');
    }
    validNow = decidedAt <= nowMillis && nowMillis < expiresAt;
  }

  return Object.freeze({
    schema: EXPECTED_SCHEMA,
    authorizationId: payload.authorization_id,
    projectId: payload.project_id,
    decision: payload.decision,
    decisionAuthority: payload.decision_authority,
    fundingAsset: payload.funding_asset,
    approvedAmount: payload.approved_amount,
    financialSnapshotSequence: payload.financial_snapshot_sequence,
    digest: suppliedDigest,
    validNow,
    displayAuthority: 'READ_ONLY',
    executionAuthority: 'NONE',
  });
}

module.exports = {
  EXPECTED_SCHEMA,
  CapitalAuthorizationVerificationError,
  verifyCapitalAuthorizationV1,
};
