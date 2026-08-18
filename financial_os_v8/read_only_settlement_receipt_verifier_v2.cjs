'use strict';

const { sha256Canonical } = require('./canonical_json_v1.cjs');

const HEX64 = /^[a-fA-F0-9]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;
const TOP = Object.freeze([
  'schema','settlement_id','intent_id','payer_id','payee_id','providers','source_asset',
  'source_amount','target_asset','target_amount','fees','status','finality_time',
  'external_evidence_classes','external_references','settlement_evidence_digest','reconciled',
  'route_id','causal_binding','authority','settlement_authority','accounting_authority',
  'profit_recognition','execution_authority','receipt_digest',
]);
const TOP_SET = new Set(TOP);
const CAUSAL = Object.freeze([
  'flow_kind','project_id','payment_purpose','intent_idempotency_key','intent_binding_digest',
  'capital_authorization_schema','capital_authorization_digest','project_evidence_schema',
  'project_evidence_digest',
]);
const CAUSAL_SET = new Set(CAUSAL);
const FLOW_PURPOSE = Object.freeze({
  PRODUCTIVE_CAPITAL_FUNDING: 'productive_capital_funding',
  PROJECT_REVENUE: 'productive_project_revenue',
});

class SettlementReceiptV2VerificationError extends Error {}

function text(v,n){ if(typeof v!=='string'||!v.trim()) throw new SettlementReceiptV2VerificationError(`${n} is required`); return v.trim(); }
function hex64(v,n,nullable=false){ if(nullable&&v===null)return null; if(typeof v!=='string'||!HEX64.test(v)) throw new SettlementReceiptV2VerificationError(`${n} must be hex64`); return v.toLowerCase(); }
function decimal(v,n){ if(typeof v!=='string'||!DECIMAL.test(v)) throw new SettlementReceiptV2VerificationError(`${n} must be canonical non-negative decimal`); return v; }
function utc(v,n){ if(typeof v!=='string'||!v.endsWith('Z')||!Number.isFinite(Date.parse(v))) throw new SettlementReceiptV2VerificationError(`${n} must be canonical UTC time`); return Date.parse(v); }
function uniqueArray(v,n){ if(!Array.isArray(v)||new Set(v).size!==v.length) throw new SettlementReceiptV2VerificationError(`${n} must be unique array`); return v; }

function verifySettlementReceiptV2(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)) throw new SettlementReceiptV2VerificationError('receipt must be object');
  const keys=Object.keys(payload); const missing=TOP.filter(f=>!Object.prototype.hasOwnProperty.call(payload,f)); const unknown=keys.filter(f=>!TOP_SET.has(f));
  if(missing.length||unknown.length) throw new SettlementReceiptV2VerificationError('receipt shape mismatch');
  if(payload.schema!=='settlement.receipt/v2') throw new SettlementReceiptV2VerificationError('unsupported receipt schema');
  for(const f of ['settlement_id','intent_id','payer_id','payee_id','source_asset','target_asset']) text(payload[f],f);
  if(payload.source_asset!==payload.source_asset.toUpperCase()||payload.target_asset!==payload.target_asset.toUpperCase()) throw new SettlementReceiptV2VerificationError('assets must be canonical uppercase');
  decimal(payload.source_amount,'source_amount'); if(payload.target_amount!==null) decimal(payload.target_amount,'target_amount');
  uniqueArray(payload.providers,'providers'); uniqueArray(payload.external_references,'external_references'); uniqueArray(payload.external_evidence_classes,'external_evidence_classes');
  hex64(payload.settlement_evidence_digest,'settlement_evidence_digest');
  if(payload.status!=='SETTLED'||payload.reconciled!==true) throw new SettlementReceiptV2VerificationError('read-only canonical view requires SETTLED reconciled receipt');
  utc(payload.finality_time,'finality_time');
  if(payload.authority!=='SETTLEMENT_EVIDENCE_ONLY') throw new SettlementReceiptV2VerificationError('receipt authority boundary violated');
  if(payload.settlement_authority!=='Shtenco/synergy_pay_system') throw new SettlementReceiptV2VerificationError('unexpected settlement authority');
  if(payload.accounting_authority!=='Shtenco/synergy_financial_os') throw new SettlementReceiptV2VerificationError('unexpected accounting authority');
  if(payload.profit_recognition!=='NOT_PERFORMED'||payload.execution_authority!=='NONE') throw new SettlementReceiptV2VerificationError('receipt cannot recognize profit or execute');
  if(!Array.isArray(payload.fees)) throw new SettlementReceiptV2VerificationError('fees must be array');
  const causal=payload.causal_binding;
  if(!causal||typeof causal!=='object'||Array.isArray(causal)) throw new SettlementReceiptV2VerificationError('causal_binding must be object');
  const ck=Object.keys(causal); if(CAUSAL.some(f=>!Object.prototype.hasOwnProperty.call(causal,f))||ck.some(f=>!CAUSAL_SET.has(f))) throw new SettlementReceiptV2VerificationError('causal_binding shape mismatch');
  const purpose=FLOW_PURPOSE[causal.flow_kind]; if(!purpose||causal.payment_purpose!==purpose) throw new SettlementReceiptV2VerificationError('flow kind/purpose mismatch');
  text(causal.project_id,'project_id'); text(causal.intent_idempotency_key,'intent_idempotency_key'); hex64(causal.intent_binding_digest,'intent_binding_digest');
  if(causal.capital_authorization_schema!=='capital.authorization/v2') throw new SettlementReceiptV2VerificationError('receipt must bind capital.authorization/v2');
  hex64(causal.capital_authorization_digest,'capital_authorization_digest');
  if(causal.flow_kind==='PRODUCTIVE_CAPITAL_FUNDING'){
    if(causal.project_evidence_schema!==null||causal.project_evidence_digest!==null) throw new SettlementReceiptV2VerificationError('funding receipt cannot bind future evidence');
  } else {
    if(causal.project_evidence_schema!=='project.evidence/v1') throw new SettlementReceiptV2VerificationError('revenue receipt requires project.evidence/v1');
    hex64(causal.project_evidence_digest,'project_evidence_digest');
  }
  const supplied=hex64(payload.receipt_digest,'receipt_digest'); const body={...payload}; delete body.receipt_digest;
  if(supplied!==sha256Canonical(body)) throw new SettlementReceiptV2VerificationError('receipt digest mismatch');
  return Object.freeze({
    schema:payload.schema, settlementId:payload.settlement_id, intentId:payload.intent_id,
    flowKind:causal.flow_kind, projectId:causal.project_id,
    payerId:payload.payer_id, payeeId:payload.payee_id,
    sourceAsset:payload.source_asset, sourceAmount:payload.source_amount,
    authorizationDigest:causal.capital_authorization_digest,
    projectEvidenceDigest:causal.project_evidence_digest,
    receiptDigest:supplied, finalityTime:payload.finality_time,
    displayAuthority:'READ_ONLY', accountingAuthority:'NONE', executionAuthority:'NONE', profitRecognition:'NONE',
  });
}

module.exports={SettlementReceiptV2VerificationError,verifySettlementReceiptV2};
