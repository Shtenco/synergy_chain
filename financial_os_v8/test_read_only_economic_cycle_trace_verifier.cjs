'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sha256Canonical } = require('./canonical_json_v1.cjs');
const {
  EconomicCycleTraceVerificationError,
  verifyEconomicCycleTraceV1,
} = require('./read_only_economic_cycle_trace_verifier.cjs');

const FIXTURE = path.join(__dirname, 'conformance', 'economic_cycle_trace_v1_complete.json');

function payload() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
}

function redigest(input) {
  const copy = JSON.parse(JSON.stringify(input));
  delete copy.digest;
  copy.digest = sha256Canonical(copy);
  return copy;
}

const verified = verifyEconomicCycleTraceV1(payload());
assert.strictEqual(verified.digest, 'c8fbff33f6eea386b5cf1c48db426aa54232f6d831169ccbf4b3a440b8a7eabf');
assert.strictEqual(verified.status, 'TRACE_COMPLETE');
assert.strictEqual(verified.complete, true);
assert.deepStrictEqual([...verified.missingPhases], []);
assert.strictEqual(verified.displayAuthority, 'READ_ONLY');
assert.strictEqual(verified.profitRecognition, 'NONE');
assert.strictEqual(verified.executionAuthority, 'NONE');

{
  const partial = payload();
  partial.references = partial.references.slice(0, 4);
  partial.status = 'TRACE_PARTIAL';
  partial.complete = false;
  partial.missing_phases = [
    'FUNDING_SETTLEMENT', 'PROJECT_EVIDENCE', 'REVENUE_SETTLEMENT',
    'ACCOUNTING_SNAPSHOT', 'TRUST_COMMITMENT',
  ];
  const result = verifyEconomicCycleTraceV1(redigest(partial));
  assert.strictEqual(result.status, 'TRACE_PARTIAL');
  assert.strictEqual(result.complete, false);
}

{
  const bad = payload();
  bad.references.splice(3, 1); // skip CAPITAL_AUTHORIZATION
  bad.complete = false;
  bad.status = 'TRACE_PARTIAL';
  bad.missing_phases = [];
  assert.throws(
    () => verifyEconomicCycleTraceV1(redigest(bad)),
    EconomicCycleTraceVerificationError,
  );
}

{
  const bad = payload();
  bad.profit_recognition = 'RECOGNIZED';
  assert.throws(
    () => verifyEconomicCycleTraceV1(redigest(bad)),
    EconomicCycleTraceVerificationError,
  );
}

{
  const bad = payload();
  bad.execution_authority = 'EXECUTE';
  assert.throws(
    () => verifyEconomicCycleTraceV1(redigest(bad)),
    EconomicCycleTraceVerificationError,
  );
}

{
  const bad = payload();
  bad.references[6].observed_at = '2026-08-18T09:00:00Z';
  assert.throws(
    () => verifyEconomicCycleTraceV1(redigest(bad)),
    EconomicCycleTraceVerificationError,
  );
}

{
  const bad = payload();
  bad.references[1].schema_id = 'project.proposal/v1';
  assert.throws(
    () => verifyEconomicCycleTraceV1(redigest(bad)),
    EconomicCycleTraceVerificationError,
  );
}

{
  const bad = payload();
  bad.references[3].source_repository = 'Shtenco/agi_olga';
  assert.throws(
    () => verifyEconomicCycleTraceV1(redigest(bad)),
    EconomicCycleTraceVerificationError,
  );
}

{
  const bad = payload();
  bad.references[5].subject_id = 'other-project';
  assert.throws(
    () => verifyEconomicCycleTraceV1(redigest(bad)),
    EconomicCycleTraceVerificationError,
  );
}

console.log('read-only EconomicCycleTrace verifier: PASS');
