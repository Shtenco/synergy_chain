'use strict';

const {sha256Canonical}=require('./canonical_json_v1.cjs');
const HEX=/^[a-f0-9]{64}$/;
class CommitmentEnvelopeV5VerificationError extends Error{}
function verifyCommitmentEnvelopeV5(envelope,{payload=null}={}){
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw new CommitmentEnvelopeV5VerificationError('envelope must be object');
 if(envelope.schema_version!=='commitment.envelope/v5'||envelope.canonical_profile!=='sinergy.canonical-json/v1'||envelope.policy_profile!=='sinergy.commitment-schema-policy/v5')throw new CommitmentEnvelopeV5VerificationError('unsupported commitment profile');
 if(envelope.domain!=='SINERGY:ECONOMIC_CYCLE_TRACE'||envelope.payload_schema!=='economic.cycle-trace/v6')throw new CommitmentEnvelopeV5VerificationError('expected Trace v6 commitment domain');
 if(typeof envelope.payload_digest!=='string'||!HEX.test(envelope.payload_digest))throw new CommitmentEnvelopeV5VerificationError('payload_digest must be lower-case hex64');
 if(!Number.isSafeInteger(envelope.sequence)||envelope.sequence<0)throw new CommitmentEnvelopeV5VerificationError('sequence must be safe integer');
 if(typeof envelope.as_of!=='string'||!envelope.as_of.endsWith('Z')||!Number.isFinite(Date.parse(envelope.as_of)))throw new CommitmentEnvelopeV5VerificationError('as_of must be canonical UTC');
 if(payload!==null){
  if(payload.schema!=='economic.cycle-trace/v6'||payload.complete!==true||payload.status!=='TRACE_COMPLETE'||payload.trust_finalization!=='EXTERNAL_COMMITMENT_REQUIRED')throw new CommitmentEnvelopeV5VerificationError('payload is not complete externally finalizable Trace v6');
  const phases=new Set(Array.isArray(payload.references)?payload.references.map(x=>x.phase):[]);if(!phases.has('ACCOUNTING_CLOSE')||!phases.has('LEDGER_INCLUSION_PROOF'))throw new CommitmentEnvelopeV5VerificationError('Trace v6 lacks accounting close/proof phases');
  if(payload.cycle_id!==envelope.subject_id)throw new CommitmentEnvelopeV5VerificationError('subject_id/cycle mismatch');
  if(sha256Canonical(payload)!==envelope.payload_digest)throw new CommitmentEnvelopeV5VerificationError('payload digest mismatch');
 }
 return Object.freeze({schemaVersion:envelope.schema_version,policyProfile:envelope.policy_profile,subjectId:envelope.subject_id,payloadSchema:envelope.payload_schema,payloadDigest:envelope.payload_digest,commitmentDigest:sha256Canonical(envelope),asOf:envelope.as_of,displayAuthority:'READ_ONLY',financialAuthority:'NONE',executionAuthority:'NONE'});
}
module.exports={CommitmentEnvelopeV5VerificationError,verifyCommitmentEnvelopeV5};
