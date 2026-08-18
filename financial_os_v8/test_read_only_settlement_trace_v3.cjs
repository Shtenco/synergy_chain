'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sha256Canonical } = require('./canonical_json_v1.cjs');
const { verifySettlementReceiptV2 } = require('./read_only_settlement_receipt_verifier_v2.cjs');
const { verifyEconomicCycleTraceV3 } = require('./read_only_economic_cycle_trace_verifier_v3.cjs');
const { verifyReadOnlyEconomicCycleBundleV3 } = require('./read_only_economic_cycle_bundle_v3.cjs');

const ROOT=__dirname;
function load(name){return JSON.parse(fs.readFileSync(path.join(ROOT,'conformance',name),'utf8'));}
function clone(x){return JSON.parse(JSON.stringify(x));}
function rehashReceipt(r){const x=clone(r);delete x.receipt_digest;x.receipt_digest=sha256Canonical(x);return x;}
function rehashTrace(t){const x=clone(t);delete x.digest;x.digest=sha256Canonical(x);return x;}

const auth=load('capital_authorization_v2_canonical.json');
const funding=load('settlement_receipt_v2_funding.json');
const revenue=load('settlement_receipt_v2_revenue.json');
const trace=load('economic_cycle_trace_v3_complete.json');
const evidence='66'.repeat(32);

{
  const f=verifySettlementReceiptV2(funding);const r=verifySettlementReceiptV2(revenue);const t=verifyEconomicCycleTraceV3(trace);
  assert.equal(f.receiptDigest,'cedcfe564fed28c5902cbed40361e9924afc8ccaa9f5d535b5b35cc019f06588');
  assert.equal(r.receiptDigest,'cd3a1886789eb431dde2b06feb4236bcf0f5d6f97f327de9204ec437fb8222e8');
  assert.equal(t.digest,'94e3c28f0abd86ded00e0177387a551eb6663343a5b13f597d4245a70368f897');
}

{
  const view=verifyReadOnlyEconomicCycleBundleV3({authorization:auth,fundingReceipt:funding,revenueReceipt:revenue,trace,projectEvidenceDigest:evidence,now:'2026-08-18T20:00:00Z'});
  assert.equal(view.status,'READ_ONLY_VERIFIED');assert.deepEqual(view.blockers,[]);
  assert.equal(view.accountingAuthority,'NONE');assert.equal(view.authorizationAuthority,'NONE');assert.equal(view.executionAuthority,'NONE');assert.equal(view.profitRecognition,'NONE');
}

{
  let fakeFunding=clone(funding);fakeFunding.payee_id='attacker-controlled-destination';fakeFunding=rehashReceipt(fakeFunding);
  let fakeTrace=clone(trace);const ref=fakeTrace.references.find(r=>r.phase==='FUNDING_SETTLEMENT');ref.digest=fakeFunding.receipt_digest;fakeTrace=rehashTrace(fakeTrace);
  verifySettlementReceiptV2(fakeFunding);verifyEconomicCycleTraceV3(fakeTrace);
  const view=verifyReadOnlyEconomicCycleBundleV3({authorization:auth,fundingReceipt:fakeFunding,revenueReceipt:revenue,trace:fakeTrace,projectEvidenceDigest:evidence});
  assert.equal(view.status,'READ_ONLY_BLOCKED');assert.ok(view.blockers.includes('FUNDING_DESTINATION_MISMATCH'));
}

{
  let fakeRevenue=clone(revenue);fakeRevenue.causal_binding.project_evidence_digest='88'.repeat(32);fakeRevenue=rehashReceipt(fakeRevenue);
  let fakeTrace=clone(trace);fakeTrace.references.find(r=>r.phase==='REVENUE_SETTLEMENT').digest=fakeRevenue.receipt_digest;fakeTrace=rehashTrace(fakeTrace);
  const view=verifyReadOnlyEconomicCycleBundleV3({authorization:auth,fundingReceipt:funding,revenueReceipt:fakeRevenue,trace:fakeTrace,projectEvidenceDigest:evidence});
  assert.equal(view.status,'READ_ONLY_BLOCKED');assert.ok(view.blockers.includes('REVENUE_PROJECT_EVIDENCE_MISMATCH'));
}

console.log('read-only settlement/trace v3: PASS');
