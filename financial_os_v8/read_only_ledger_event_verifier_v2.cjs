'use strict';

const {sha256Canonical}=require('./canonical_json_v1.cjs');
const HEX=/^[a-fA-F0-9]{64}$/;
const DECIMAL=/^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;
const FLOW_TYPES=new Set(['INTERNAL','EXTERNAL_CAPITAL','EXTERNAL_REVENUE','EXTERNAL_EXPENSE','LIABILITY_ISSUANCE','LIABILITY_REDEMPTION','CREDIT_ORIGINATION','CREDIT_REPAYMENT','CREDIT_LOSS','SETTLEMENT']);
class LedgerEventV2VerificationError extends Error{}
function text(v,n){if(typeof v!=='string'||!v.trim())throw new LedgerEventV2VerificationError(`${n} is required`);return v.trim();}
function hex(v,n){if(typeof v!=='string'||!HEX.test(v))throw new LedgerEventV2VerificationError(`${n} must be hex64`);return v.toLowerCase();}
function decimal(v,n){if(typeof v!=='string'||!DECIMAL.test(v))throw new LedgerEventV2VerificationError(`${n} must be canonical decimal`);return v;}
function reconstructedEntry(p){
 if(!Number.isSafeInteger(p.sequence)||p.sequence<1)throw new LedgerEventV2VerificationError('sequence must be safe positive integer');
 const currency=text(p.reporting_currency,'reporting_currency').toUpperCase();
 if(!FLOW_TYPES.has(p.event_type))throw new LedgerEventV2VerificationError('unsupported event_type');
 if(!Array.isArray(p.lines)||p.lines.length<2)throw new LedgerEventV2VerificationError('at least two lines required');
 let d=0n,c=0n;let scale=0;const lines=[];
 // Balance with exact decimal-string arithmetic by normalizing all line amounts to a shared decimal scale.
 const parsed=p.lines.map((line,i)=>{if(!line||typeof line!=='object'||Array.isArray(line))throw new LedgerEventV2VerificationError(`line ${i} invalid`);if(line.currency!==currency)throw new LedgerEventV2VerificationError('line currency mismatch');const debit=decimal(line.debit,`line ${i} debit`),credit=decimal(line.credit,`line ${i} credit`);if((debit!=='0')===(credit!=='0'))throw new LedgerEventV2VerificationError('each line requires exactly one positive side');scale=Math.max(scale,(debit.split('.')[1]||'').length,(credit.split('.')[1]||'').length);return {account:text(line.account,`line ${i} account`),debit,credit};});
 function units(v){const [a,b='']=v.split('.');return BigInt(a+b.padEnd(scale,'0'));}
 parsed.forEach(x=>{d+=units(x.debit);c+=units(x.credit);lines.push({account_id:x.account,debit:x.debit,credit:x.credit});});
 if(d<=0n||d!==c)throw new LedgerEventV2VerificationError('unbalanced ledger event');
 if(!p.metadata||typeof p.metadata!=='object'||Array.isArray(p.metadata)||Object.values(p.metadata).some(v=>typeof v!=='string'))throw new LedgerEventV2VerificationError('metadata must be string map');
 return {sequence:p.sequence,event_id:text(p.event_id,'event_id'),reference:text(p.external_reference,'external_reference'),flow_type:p.event_type,lines,previous_entry_digest:hex(p.previous_reporting_entry_digest,'previous_reporting_entry_digest'),evidence_digest:hex(p.evidence_digest,'evidence_digest'),metadata:Object.fromEntries(Object.entries(p.metadata).sort(([a],[b])=>a.localeCompare(b)))};
}
function verifyLedgerEventV2(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||p.schema!=='ledger.event/v2')throw new LedgerEventV2VerificationError('invalid ledger.event/v2');
 if(typeof p.effective_at!=='string'||!p.effective_at.endsWith('Z')||!Number.isFinite(Date.parse(p.effective_at)))throw new LedgerEventV2VerificationError('effective_at must be UTC');
 const entry=reconstructedEntry(p);const expected=sha256Canonical(entry);const supplied=hex(p.reporting_entry_digest,'reporting_entry_digest');if(expected!==supplied)throw new LedgerEventV2VerificationError('ReportingEntry digest mismatch');
 return Object.freeze({schema:p.schema,eventId:p.event_id,sequence:p.sequence,eventType:p.event_type,effectiveAt:p.effective_at,reportingCurrency:p.reporting_currency,evidenceDigest:p.evidence_digest.toLowerCase(),externalReference:p.external_reference,previousReportingEntryDigest:p.previous_reporting_entry_digest.toLowerCase(),reportingEntryDigest:supplied,metadata:Object.freeze({...p.metadata}),digest:sha256Canonical(p),displayAuthority:'READ_ONLY',postingAuthority:'NONE',executionAuthority:'NONE'});
}
module.exports={LedgerEventV2VerificationError,verifyLedgerEventV2};
