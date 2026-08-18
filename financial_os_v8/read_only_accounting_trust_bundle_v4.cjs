'use strict';
const {verifyRevenueRecognitionV2}=require('./read_only_revenue_recognition_verifier_v2.cjs');
const {verifyLedgerEventV1}=require('./read_only_ledger_event_verifier_v1.cjs');
const {verifyEconomicCycleTraceV5}=require('./read_only_economic_cycle_trace_verifier_v5.cjs');
const {verifyCommitmentEnvelopeV4}=require('./read_only_commitment_envelope_verifier_v4.cjs');

function ref(trace,phase){const x=trace.references.find(r=>r.phase===phase);if(!x)throw new Error(`missing ${phase}`);return x;}
function verifyReadOnlyAccountingTrustBundleV4({recognition,ledgerEvent,trace,commitment}){
 const r=verifyRevenueRecognitionV2(recognition);const e=verifyLedgerEventV1(ledgerEvent);const t=verifyEconomicCycleTraceV5(trace);const c=verifyCommitmentEnvelopeV4(commitment,{payload:trace});const blockers=new Set();
 if(r.decision!=='RECOGNIZED')blockers.add('REVENUE_NOT_RECOGNIZED');
 if(e.evidenceDigest!==r.digest)blockers.add('LEDGER_RECOGNITION_EVIDENCE_MISMATCH');
 if(e.externalReference!==r.recognitionId)blockers.add('LEDGER_RECOGNITION_REFERENCE_MISMATCH');
 if(e.metadata.project_id!==r.projectId)blockers.add('LEDGER_PROJECT_MISMATCH');
 if(e.metadata.settlement_receipt_digest!==r.settlementReceiptDigest)blockers.add('LEDGER_SETTLEMENT_MISMATCH');
 if(ref(t,'REVENUE_RECOGNITION').digest!==r.digest)blockers.add('TRACE_RECOGNITION_REFERENCE_MISMATCH');
 if(ref(t,'LEDGER_EVENT').digest!==e.digest)blockers.add('TRACE_LEDGER_EVENT_REFERENCE_MISMATCH');
 if(ref(t,'REVENUE_RECOGNITION').observed_at!==r.recognizedAt)blockers.add('TRACE_RECOGNITION_TIME_MISMATCH');
 if(ref(t,'LEDGER_EVENT').observed_at!==e.effectiveAt)blockers.add('TRACE_LEDGER_TIME_MISMATCH');
 if(c.subjectId!==t.cycleId)blockers.add('COMMITMENT_TRACE_SUBJECT_MISMATCH');
 const list=Object.freeze(Array.from(blockers).sort());
 return Object.freeze({status:list.length?'READ_ONLY_BLOCKED':'READ_ONLY_VERIFIED',blockers:list,projectId:t.projectId,cycleId:t.cycleId,recognizedReportingAmount:r.recognizedReportingAmount,reportingCurrency:r.reportingCurrency,recognitionDigest:r.digest,ledgerEventDigest:e.digest,traceDigest:t.digest,commitmentDigest:c.commitmentDigest,displayAuthority:'READ_ONLY',accountingAuthority:'NONE',postingAuthority:'NONE',executionAuthority:'NONE'});
}
module.exports={verifyReadOnlyAccountingTrustBundleV4};
