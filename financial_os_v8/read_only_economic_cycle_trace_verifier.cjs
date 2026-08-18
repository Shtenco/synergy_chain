'use strict';

const { sha256Canonical } = require('./canonical_json_v1.cjs');

const HEX64 = /^[a-fA-F0-9]{64}$/;
const EXPECTED_SCHEMA = 'economic.cycle-trace/v1';
const PHASES = Object.freeze([
  ['FUNDING_STATE', 'maturity.snapshot/v1', 'Shtenco/synergy_matrix_sota'],
  ['PROJECT_PROPOSAL', 'project.proposal/v2', 'Shtenco/synergy_eurasian'],
  ['PROJECT_SCREENING', 'project.screening/v1', 'Shtenco/synergy_financial_os'],
  ['CAPITAL_AUTHORIZATION', 'capital.authorization/v1', 'Shtenco/synergy_financial_os'],
  ['FUNDING_SETTLEMENT', 'settlement.receipt/v1', 'Shtenco/synergy_pay_system'],
  ['PROJECT_EVIDENCE', 'project.evidence/v1', 'Shtenco/synergy_eurasian'],
  ['REVENUE_SETTLEMENT', 'settlement.receipt/v1', 'Shtenco/synergy_pay_system'],
  ['ACCOUNTING_SNAPSHOT', 'financial.snapshot/v2', 'Shtenco/synergy_financial_os'],
  ['TRUST_COMMITMENT', 'commitment.envelope/v2', 'Shtenco/synergy_ai_blockchain'],
]);
const PROJECT_PHASES = new Set([
  'PROJECT_PROPOSAL', 'PROJECT_SCREENING', 'CAPITAL_AUTHORIZATION', 'PROJECT_EVIDENCE',
]);
const REQUIRED_FIELDS = Object.freeze([
  'schema', 'cycle_id', 'household_or_funding_subject', 'project_id', 'status',
  'complete', 'missing_phases', 'references', 'authority', 'profit_recognition',
  'execution_authority', 'digest',
]);
const REQUIRED_FIELD_SET = new Set(REQUIRED_FIELDS);
const REF_FIELDS = Object.freeze([
  'phase', 'schema_id', 'digest', 'source_repository', 'subject_id', 'observed_at',
]);
const REF_FIELD_SET = new Set(REF_FIELDS);

class EconomicCycleTraceVerificationError extends Error {}

function requireText(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new EconomicCycleTraceVerificationError(`${fieldName} is required`);
  }
  return value.trim();
}

function requireHex64(value, fieldName) {
  if (typeof value !== 'string' || !HEX64.test(value)) {
    throw new EconomicCycleTraceVerificationError(
      `${fieldName} must be a 64-character hexadecimal digest`,
    );
  }
  return value.toLowerCase();
}

function utcMillis(value, fieldName) {
  if (typeof value !== 'string' || !value.endsWith('Z')) {
    throw new EconomicCycleTraceVerificationError(`${fieldName} must be canonical UTC Z time`);
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new EconomicCycleTraceVerificationError(`${fieldName} must be valid ISO-8601 time`);
  }
  return millis;
}

function verifyEconomicCycleTraceV1(trace) {
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) {
    throw new EconomicCycleTraceVerificationError('economic cycle trace must be an object');
  }
  const keys = Object.keys(trace);
  const missing = REQUIRED_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(trace, field));
  const unknown = keys.filter((field) => !REQUIRED_FIELD_SET.has(field));
  if (missing.length || unknown.length) {
    throw new EconomicCycleTraceVerificationError(
      `trace shape mismatch: missing=${missing.join(',')} unknown=${unknown.join(',')}`,
    );
  }
  if (trace.schema !== EXPECTED_SCHEMA) {
    throw new EconomicCycleTraceVerificationError(`unsupported trace schema: ${trace.schema}`);
  }
  const cycleId = requireText(trace.cycle_id, 'cycle_id');
  const fundingSubject = requireText(
    trace.household_or_funding_subject, 'household_or_funding_subject',
  );
  const projectId = requireText(trace.project_id, 'project_id');
  if (trace.authority !== 'PROVENANCE_ONLY') {
    throw new EconomicCycleTraceVerificationError('trace authority must be PROVENANCE_ONLY');
  }
  if (trace.profit_recognition !== 'NOT_PERFORMED') {
    throw new EconomicCycleTraceVerificationError('control plane cannot accept trace profit recognition');
  }
  if (trace.execution_authority !== 'NONE') {
    throw new EconomicCycleTraceVerificationError('control plane cannot accept trace execution authority');
  }
  if (!Array.isArray(trace.references) || trace.references.length < 1 || trace.references.length > PHASES.length) {
    throw new EconomicCycleTraceVerificationError('trace references must contain 1..9 items');
  }

  let previousTime = null;
  trace.references.forEach((ref, index) => {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
      throw new EconomicCycleTraceVerificationError(`references[${index}] must be an object`);
    }
    const refKeys = Object.keys(ref);
    const refMissing = REF_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(ref, field));
    const refUnknown = refKeys.filter((field) => !REF_FIELD_SET.has(field));
    if (refMissing.length || refUnknown.length) {
      throw new EconomicCycleTraceVerificationError(`references[${index}] shape mismatch`);
    }
    const [expectedPhase, expectedSchema, expectedSource] = PHASES[index];
    if (ref.phase !== expectedPhase) {
      throw new EconomicCycleTraceVerificationError(
        `references[${index}] must be canonical phase ${expectedPhase}`,
      );
    }
    if (ref.schema_id !== expectedSchema) {
      throw new EconomicCycleTraceVerificationError(
        `${expectedPhase} requires schema ${expectedSchema}`,
      );
    }
    if (ref.source_repository !== expectedSource) {
      throw new EconomicCycleTraceVerificationError(
        `${expectedPhase} requires source ${expectedSource}`,
      );
    }
    requireHex64(ref.digest, `references[${index}].digest`);
    requireText(ref.subject_id, `references[${index}].subject_id`);
    const time = utcMillis(ref.observed_at, `references[${index}].observed_at`);
    if (previousTime !== null && time < previousTime) {
      throw new EconomicCycleTraceVerificationError('trace observation time cannot move backwards');
    }
    previousTime = time;
    if (expectedPhase === 'FUNDING_STATE' && ref.subject_id !== fundingSubject) {
      throw new EconomicCycleTraceVerificationError('FUNDING_STATE subject mismatch');
    }
    if (PROJECT_PHASES.has(expectedPhase) && ref.subject_id !== projectId) {
      throw new EconomicCycleTraceVerificationError(`${expectedPhase} project subject mismatch`);
    }
  });

  const expectedMissing = PHASES.slice(trace.references.length).map(([phase]) => phase);
  if (!Array.isArray(trace.missing_phases)) {
    throw new EconomicCycleTraceVerificationError('missing_phases must be an array');
  }
  if (JSON.stringify(trace.missing_phases) !== JSON.stringify(expectedMissing)) {
    throw new EconomicCycleTraceVerificationError('missing_phases does not match causal prefix');
  }
  const expectedComplete = trace.references.length === PHASES.length;
  if (trace.complete !== expectedComplete) {
    throw new EconomicCycleTraceVerificationError('complete flag does not match reference count');
  }
  const expectedStatus = expectedComplete ? 'TRACE_COMPLETE' : 'TRACE_PARTIAL';
  if (trace.status !== expectedStatus) {
    throw new EconomicCycleTraceVerificationError('trace status does not match completeness');
  }

  const suppliedDigest = requireHex64(trace.digest, 'digest');
  const digestPayload = { ...trace };
  delete digestPayload.digest;
  const expectedDigest = sha256Canonical(digestPayload);
  if (suppliedDigest !== expectedDigest) {
    throw new EconomicCycleTraceVerificationError(
      `trace digest mismatch: expected=${expectedDigest} got=${suppliedDigest}`,
    );
  }

  return Object.freeze({
    schema: EXPECTED_SCHEMA,
    cycleId,
    projectId,
    status: trace.status,
    complete: trace.complete,
    missingPhases: Object.freeze([...trace.missing_phases]),
    digest: suppliedDigest,
    displayAuthority: 'READ_ONLY',
    profitRecognition: 'NONE',
    executionAuthority: 'NONE',
  });
}

module.exports = {
  EXPECTED_SCHEMA,
  PHASES,
  EconomicCycleTraceVerificationError,
  verifyEconomicCycleTraceV1,
};
