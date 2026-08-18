'use strict';

const { sha256Canonical } = require('./canonical_json_v1.cjs');

const HEX64 = /^[a-fA-F0-9]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;
const REQUIRED = Object.freeze([
  'schema','authorization_id','project_id','decision','decision_authority','funding_asset',
  'approved_amount','funding_source_id','funding_destination_id','payment_idempotency_key',
  'payment_purpose','usage_policy','screening_digest','financial_snapshot_digest',
  'financial_snapshot_sequence','valuation_policy_digest','requirement_registry_digest',
  'decision_evidence_digest','approver_policy_digest','notes_digest','decided_at','expires_at',
  'execution_authority','ai_authority','digest',
]);
const REQUIRED_SET = new Set(REQUIRED);
const DECISION_AUTHORITIES = new Set(['HUMAN_COMMITTEE','MULTISIG_GOVERNANCE']);

class CapitalAuthorizationV2VerificationError extends Error {}

function text(v, n) {
  if (typeof v !== 'string' || !v.trim()) throw new CapitalAuthorizationV2VerificationError(`${n} is required`);
  return v.trim();
}
function hex64(v, n, nullable = false) {
  if (nullable && v === null) return null;
  if (typeof v !== 'string' || !HEX64.test(v)) throw new CapitalAuthorizationV2VerificationError(`${n} must be hex64`);
  return v.toLowerCase();
}
function time(v, n) {
  if (typeof v !== 'string' || !v.endsWith('Z') || !Number.isFinite(Date.parse(v))) {
    throw new CapitalAuthorizationV2VerificationError(`${n} must be canonical UTC time`);
  }
  return Date.parse(v);
}

function verifyCapitalAuthorizationV2(payload, { now = null } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CapitalAuthorizationV2VerificationError('authorization must be an object');
  }
  const keys = Object.keys(payload);
  const missing = REQUIRED.filter((f) => !Object.prototype.hasOwnProperty.call(payload, f));
  const unknown = keys.filter((f) => !REQUIRED_SET.has(f));
  if (missing.length || unknown.length) throw new CapitalAuthorizationV2VerificationError('authorization shape mismatch');
  if (payload.schema !== 'capital.authorization/v2') throw new CapitalAuthorizationV2VerificationError('unsupported schema');
  if (payload.decision !== 'APPROVED') throw new CapitalAuthorizationV2VerificationError('display candidate must be APPROVED');
  if (!DECISION_AUTHORITIES.has(payload.decision_authority)) throw new CapitalAuthorizationV2VerificationError('unsupported decision authority');
  if (payload.payment_purpose !== 'productive_capital_funding') throw new CapitalAuthorizationV2VerificationError('wrong payment purpose');
  if (payload.usage_policy !== 'SINGLE_EXACT_PAYMENT') throw new CapitalAuthorizationV2VerificationError('unsupported usage policy');
  if (payload.execution_authority !== 'SEPARATE_METAPAY_HANDOFF') throw new CapitalAuthorizationV2VerificationError('embedded execution forbidden');
  if (payload.ai_authority !== 'NONE') throw new CapitalAuthorizationV2VerificationError('AI authorization forbidden');
  if (typeof payload.approved_amount !== 'string' || !DECIMAL.test(payload.approved_amount) || payload.approved_amount === '0') {
    throw new CapitalAuthorizationV2VerificationError('approved_amount must be canonical positive decimal');
  }
  for (const field of ['authorization_id','project_id','funding_asset','funding_source_id','funding_destination_id','payment_idempotency_key']) text(payload[field], field);
  for (const field of ['screening_digest','financial_snapshot_digest','valuation_policy_digest','requirement_registry_digest','decision_evidence_digest','approver_policy_digest']) hex64(payload[field], field);
  hex64(payload.notes_digest, 'notes_digest', true);
  if (!Number.isSafeInteger(payload.financial_snapshot_sequence) || payload.financial_snapshot_sequence < 0) {
    throw new CapitalAuthorizationV2VerificationError('financial_snapshot_sequence must be safe integer');
  }
  const decided = time(payload.decided_at, 'decided_at');
  const expires = time(payload.expires_at, 'expires_at');
  if (expires <= decided) throw new CapitalAuthorizationV2VerificationError('expiry must follow decision time');
  const supplied = hex64(payload.digest, 'digest');
  const body = { ...payload }; delete body.digest;
  const expected = sha256Canonical(body);
  if (supplied !== expected) throw new CapitalAuthorizationV2VerificationError('authorization digest mismatch');
  let validNow = null;
  if (now !== null) {
    const t = now instanceof Date ? now.getTime() : Date.parse(now);
    if (!Number.isFinite(t)) throw new CapitalAuthorizationV2VerificationError('invalid now');
    validNow = decided <= t && t < expires;
  }
  return Object.freeze({
    schema: payload.schema,
    authorizationId: payload.authorization_id,
    projectId: payload.project_id,
    fundingSourceId: payload.funding_source_id,
    fundingDestinationId: payload.funding_destination_id,
    paymentIdempotencyKey: payload.payment_idempotency_key,
    approvedAmount: payload.approved_amount,
    fundingAsset: payload.funding_asset,
    digest: supplied,
    validNow,
    displayAuthority: 'READ_ONLY',
    executionAuthority: 'NONE',
  });
}

module.exports = { CapitalAuthorizationV2VerificationError, verifyCapitalAuthorizationV2 };
