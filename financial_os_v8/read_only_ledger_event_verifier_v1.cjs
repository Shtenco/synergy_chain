'use strict';
const {sha256Canonical}=require('./canonical_json_v1.cjs');
const HEX=/^[a-fA-F0-9]{64}$/;const DEC=/^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;
class LedgerEventV1VerificationError extends Error{}
function verifyLedgerEventV1(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||p.schema!=='ledger.event/v1')throw new LedgerEventV1VerificationError('invalid ledger event');
 if(p.event_type!=='EXTERNAL_REVENUE')throw new LedgerEventV1VerificationError('expected EXTERNAL_REVENUE ledger event');
 if(typeof p.evidence_digest!=='string'||!HEX.test(p.evidence_digest))throw new LedgerEventV1VerificationError('evidence_digest must be hex64');
 if(!Array.isArray(p.lines)||!p.lines.length)throw new LedgerEventV1VerificationError('ledger lines required');
 let debit=0n,credit=0n;const SCALE=1000000n;
 function scaled(v){if(typeof v!=='string'||!DEC.test(v))throw new LedgerEventV1VerificationError('non-canonical ledger decimal');const [a,b='']=v.split('.');return BigInt(a)*SCALE+BigInt((b+'000000').slice(0,6));}
 for(const line of p.lines){debit+=scaled(line.debit);credit+=scaled(line.credit);if(line.currency!=='USDC')throw new LedgerEventV1VerificationError('canonical fixture currency mismatch');}
 if(debit!==credit)throw new LedgerEventV1VerificationError('ledger event is not balanced');
 const digest=sha256Canonical(p);
 return Object.freeze({schema:p.schema,eventId:p.event_id,eventType:p.event_type,digest,evidenceDigest:p.evidence_digest.toLowerCase(),effectiveAt:p.effective_at,externalReference:p.external_reference,metadata:Object.freeze({...p.metadata}),displayAuthority:'READ_ONLY',postingAuthority:'NONE',accountingAuthority:'NONE'});
}
module.exports={LedgerEventV1VerificationError,verifyLedgerEventV1};
