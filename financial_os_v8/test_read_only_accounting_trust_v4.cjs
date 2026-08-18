'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {sha256Canonical}=require('./canonical_json_v1.cjs');const {verifyReadOnlyAccountingTrustBundleV4}=require('./read_only_accounting_trust_bundle_v4.cjs');
const ROOT=__dirname;function load(n){return JSON.parse(fs.readFileSync(path.join(ROOT,'conformance',n),'utf8'));}function clone(x){return JSON.parse(JSON.stringify(x));}
const recognition=load('revenue_recognition_v2_canonical.json');const event=load('ledger_event_v1_recognized_revenue.json');const trace=load('economic_cycle_trace_v5_complete.json');const commitment=load('commitment_envelope_v4_trace_v5.json');
{
 const view=verifyReadOnlyAccountingTrustBundleV4({recognition,ledgerEvent:event,trace,commitment});assert.equal(view.status,'READ_ONLY_VERIFIED');assert.deepEqual(view.blockers,[]);assert.equal(view.recognizedReportingAmount,'118');assert.equal(view.traceDigest,'0182bbf05b7dc11690adf899bd6e3b353df47b3e2146c3629669693167dacfca');assert.equal(view.commitmentDigest,'b8a1737da1bc6a8b435f7d3a05f34d997ea229561e33a9003f0c0ccac7c184c4');assert.equal(view.accountingAuthority,'NONE');assert.equal(view.executionAuthority,'NONE');
}
{
 const fakeEvent=clone(event);fakeEvent.evidence_digest='99'.repeat(32);const fakeEventDigest=sha256Canonical(fakeEvent);
 const fakeTrace=clone(trace);fakeTrace.references.find(r=>r.phase==='LEDGER_EVENT').digest=fakeEventDigest;delete fakeTrace.digest;fakeTrace.digest=sha256Canonical(fakeTrace);
 const fakeCommitment=clone(commitment);fakeCommitment.payload_digest=sha256Canonical(fakeTrace);
 const view=verifyReadOnlyAccountingTrustBundleV4({recognition,ledgerEvent:fakeEvent,trace:fakeTrace,commitment:fakeCommitment});assert.equal(view.status,'READ_ONLY_BLOCKED');assert.ok(view.blockers.includes('LEDGER_RECOGNITION_EVIDENCE_MISMATCH'));
}
{
 const fakeRecognition=clone(recognition);fakeRecognition.recognized_reporting_amount='119';delete fakeRecognition.digest;fakeRecognition.digest=sha256Canonical(fakeRecognition);
 const view=verifyReadOnlyAccountingTrustBundleV4({recognition:fakeRecognition,ledgerEvent:event,trace,commitment});assert.equal(view.status,'READ_ONLY_BLOCKED');assert.ok(view.blockers.includes('LEDGER_RECOGNITION_EVIDENCE_MISMATCH')||view.blockers.includes('TRACE_RECOGNITION_REFERENCE_MISMATCH'));
}
console.log('read-only accounting/trust v4: PASS');
