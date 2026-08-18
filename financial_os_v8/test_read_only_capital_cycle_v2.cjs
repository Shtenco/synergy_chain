'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sha256Canonical } = require('./canonical_json_v1.cjs');
const { CapitalAuthorizationV2VerificationError, verifyCapitalAuthorizationV2 } = require('./read_only_capital_authorization_verifier_v2.cjs');
const { EconomicCycleTraceV2VerificationError, verifyEconomicCycleTraceV2 } = require('./read_only_economic_cycle_trace_verifier_v2.cjs');

const AUTH_PATH = path.join(__dirname,'conformance','capital_authorization_v2_canonical.json');
const TRACE_PATH = path.join(__dirname,'conformance','economic_cycle_trace_v2_complete.json');
const load = (p) => JSON.parse(fs.readFileSync(p,'utf8'));
const redigest = (p) => { const x=JSON.parse(JSON.stringify(p)); delete x.digest; x.digest=sha256Canonical(x); return x; };

const auth = verifyCapitalAuthorizationV2(load(AUTH_PATH), { now:'2026-08-18T20:00:00Z' });
assert.strictEqual(auth.digest,'1e814153a18850865543e08b498b60d9bce80dbd34bfb2f4c378f3fe502fe89f');
assert.strictEqual(auth.fundingSourceId,'sinergy-capital-account');
assert.strictEqual(auth.fundingDestinationId,'project-001-escrow');
assert.strictEqual(auth.paymentIdempotencyKey,'capital-project-001-auth-v2-001');
assert.strictEqual(auth.executionAuthority,'NONE');

for (const [field,value] of [
  ['funding_destination_id','other-escrow'],
  ['funding_source_id','other-treasury'],
  ['payment_idempotency_key','replay-key'],
  ['ai_authority','APPROVE'],
]) {
  const bad=load(AUTH_PATH); bad[field]=value;
  assert.throws(()=>verifyCapitalAuthorizationV2(redigest(bad)),CapitalAuthorizationV2VerificationError);
}

const trace = verifyEconomicCycleTraceV2(load(TRACE_PATH));
assert.strictEqual(trace.digest,'9876d96b68c429d60c128770db0bf39c80a5bf93820d84d2fed86c64601a3823');
assert.strictEqual(trace.status,'TRACE_COMPLETE');
assert.strictEqual(trace.profitRecognition,'NONE');
assert.strictEqual(trace.executionAuthority,'NONE');

{
  const bad=load(TRACE_PATH);
  bad.references[3].schema_id='capital.authorization/v1';
  assert.throws(()=>verifyEconomicCycleTraceV2(redigest(bad)),EconomicCycleTraceV2VerificationError);
}
{
  const bad=load(TRACE_PATH);
  bad.references.splice(3,1);
  bad.complete=false; bad.status='TRACE_PARTIAL'; bad.missing_phases=[];
  assert.throws(()=>verifyEconomicCycleTraceV2(redigest(bad)),EconomicCycleTraceV2VerificationError);
}
{
  const bad=load(TRACE_PATH); bad.profit_recognition='RECOGNIZED';
  assert.throws(()=>verifyEconomicCycleTraceV2(redigest(bad)),EconomicCycleTraceV2VerificationError);
}

console.log('read-only capital/cycle v2: PASS');
