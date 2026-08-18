'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {canonicalStringify,sha256Canonical}=require('./canonical_json_v1.cjs');
const {verifyReadOnlyAccountingCloseTrustBundleV5}=require('./read_only_accounting_close_trust_bundle_v5.cjs');
const ROOT=path.join(__dirname,'conformance');
const load=(n)=>JSON.parse(fs.readFileSync(path.join(ROOT,n),'utf8'));
function canonical(){return {recognition:load('revenue_recognition_v2_canonical.json'),ledgerEvent:load('ledger_event_v2_recognized_revenue.json'),ledgerPrefix:[load('ledger_event_v2_recognized_revenue.json')],snapshot:load('financial_snapshot_v2_cycle_003.json'),accountingClose:load('accounting_close_v2_cycle_003.json'),inclusionProof:load('ledger_inclusion_proof_v2_cycle_003.json'),trace:load('economic_cycle_trace_v6_complete.json'),commitment:load('commitment_envelope_v5_trace_v6.json')};}
function entryDigest(e){const body={sequence:e.sequence,event_id:e.event_id,reference:e.external_reference,flow_type:e.event_type,lines:e.lines.map(x=>({account_id:x.account,debit:x.debit,credit:x.credit})),previous_entry_digest:e.previous_reporting_entry_digest,evidence_digest:e.evidence_digest,metadata:Object.fromEntries(Object.entries(e.metadata).sort(([a],[b])=>a.localeCompare(b)))};return sha256Canonical(body);}
function leaf(event){return crypto.createHash('sha256').update(Buffer.from('SINERGY_LEDGER_EVENT_V2_LEAF\0')).update(Buffer.from(canonicalStringify(event),'utf8')).digest('hex');}
function rehash(obj){const x=JSON.parse(JSON.stringify(obj));delete x.digest;x.digest=sha256Canonical(x);return x;}
(function testCanonical(){const result=verifyReadOnlyAccountingCloseTrustBundleV5(canonical());assert.strictEqual(result.status,'READ_ONLY_VERIFIED');assert.deepStrictEqual(result.blockers,[]);assert.strictEqual(result.reportingEntryDigest,'f38f6ce7c8a23bea46b95681b21aa490af7b8b1797252ec6645f76c2c3eb6086');assert.strictEqual(result.accountingCloseDigest,'aa880abd2c32fd4ef6a6360e46ea802f224d91e66f3154f5ae175f60796d6617');assert.strictEqual(result.commitmentDigest,'9a3398ecdd6367356c5e2179d490e615f9940ad2ff500bcf59a0f2e921c216d1');assert.strictEqual(result.accountingAuthority,'NONE');assert.strictEqual(result.executionAuthority,'NONE');})();
(function testFullFreshHashAttackStillBlocked(){const b=canonical();b.ledgerEvent.lines[0].debit='126';b.ledgerEvent.lines[1].credit='119';b.ledgerEvent.reporting_entry_digest=entryDigest(b.ledgerEvent);b.ledgerPrefix=[b.ledgerEvent];
 b.snapshot.ledger_last_entry_digest=b.ledgerEvent.reporting_entry_digest;b.snapshot.ledger_digest='88'.repeat(32);b.snapshot=rehash(b.snapshot);
 b.accountingClose.financial_snapshot_digest=b.snapshot.digest;b.accountingClose.snapshot_ledger_digest=b.snapshot.ledger_digest;b.accountingClose.snapshot_ledger_last_entry_digest=b.snapshot.ledger_last_entry_digest;b.accountingClose.ledger_root=leaf(b.ledgerEvent);b.accountingClose=rehash(b.accountingClose);
 b.inclusionProof.close_digest=b.accountingClose.digest;b.inclusionProof.ledger_root=b.accountingClose.ledger_root;b.inclusionProof.event_digest=sha256Canonical(b.ledgerEvent);b.inclusionProof.reporting_entry_digest=b.ledgerEvent.reporting_entry_digest;b.inclusionProof=rehash(b.inclusionProof);
 for(const r of b.trace.references){if(r.phase==='LEDGER_EVENT')r.digest=b.inclusionProof.event_digest;if(r.phase==='ACCOUNTING_SNAPSHOT')r.digest=b.snapshot.digest;if(r.phase==='ACCOUNTING_CLOSE'){r.digest=b.accountingClose.digest;r.subject_id=b.accountingClose.close_id;}if(r.phase==='LEDGER_INCLUSION_PROOF')r.digest=b.inclusionProof.digest;}b.trace=rehash(b.trace);
 b.commitment.payload_digest=sha256Canonical(b.trace);
 const result=verifyReadOnlyAccountingCloseTrustBundleV5(b);assert.strictEqual(result.status,'READ_ONLY_BLOCKED');assert(result.blockers.includes('LEDGER_GROSS_DEBIT_MISMATCH'));assert(result.blockers.includes('LEDGER_RECOGNITION_CREDIT_COMPONENTS_MISMATCH'));})();
console.log('read-only accounting close trust v5: PASS');
