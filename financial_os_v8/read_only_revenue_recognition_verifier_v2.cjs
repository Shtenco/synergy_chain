'use strict';
const {sha256Canonical}=require('./canonical_json_v1.cjs');
const HEX=/^[a-fA-F0-9]{64}$/;const DEC=/^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;
class RevenueRecognitionV2VerificationError extends Error{}
function verifyRevenueRecognitionV2(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||p.schema!=='revenue.recognition/v2')throw new RevenueRecognitionV2VerificationError('invalid recognition object');
 if(p.accounting_authority!=='Shtenco/synergy_financial_os'||p.ledger_posting_authority!=='SEPARATE_REPORTING_LEDGER_POST'||p.ai_authority!=='NONE')throw new RevenueRecognitionV2VerificationError('recognition authority boundary violated');
 for(const f of ['settlement_receipt_digest','capital_authorization_digest','project_evidence_digest','counterparty_evidence_digest','contract_digest','invoice_digest','delivery_evidence_digest','accounting_policy_digest','digest'])if(typeof p[f]!=='string'||!HEX.test(p[f]))throw new RevenueRecognitionV2VerificationError(`${f} must be hex64`);
 for(const f of ['invoice_reporting_amount','settlement_amount','fx_rate_to_reporting','gross_reporting_amount','tax_reporting_amount','refund_reserve_reporting_amount','recognized_reporting_amount'])if(typeof p[f]!=='string'||!DEC.test(p[f]))throw new RevenueRecognitionV2VerificationError(`${f} must be canonical decimal`);
 if(p.decision==='RECOGNIZED'){
  if(p.ledger_posting_allowed!==true||!Array.isArray(p.blockers)||p.blockers.length)throw new RevenueRecognitionV2VerificationError('recognized decision blockers/posting mismatch');
 }else if(!['DEFERRED','REJECTED'].includes(p.decision)||p.ledger_posting_allowed!==false||p.recognized_reporting_amount!=='0'||!Array.isArray(p.blockers)||!p.blockers.length)throw new RevenueRecognitionV2VerificationError('non-recognized decision shape mismatch');
 const body={...p};delete body.digest;if(sha256Canonical(body)!==p.digest.toLowerCase())throw new RevenueRecognitionV2VerificationError('recognition digest mismatch');
 return Object.freeze({schema:p.schema,recognitionId:p.recognition_id,projectId:p.project_id,decision:p.decision,digest:p.digest.toLowerCase(),settlementReceiptDigest:p.settlement_receipt_digest.toLowerCase(),authorizationDigest:p.capital_authorization_digest.toLowerCase(),projectEvidenceDigest:p.project_evidence_digest.toLowerCase(),recognizedReportingAmount:p.recognized_reporting_amount,reportingCurrency:p.reporting_currency,recognizedAt:p.recognized_at,displayAuthority:'READ_ONLY',accountingAuthority:'NONE',postingAuthority:'NONE',executionAuthority:'NONE'});
}
module.exports={RevenueRecognitionV2VerificationError,verifyRevenueRecognitionV2};
