'use strict';
const {sha256Canonical}=require('./canonical_json_v1.cjs');
const HEX=/^[a-f0-9]{64}$/;
class CommitmentEnvelopeV4VerificationError extends Error{}
function verifyCommitmentEnvelopeV4(envelope,{payload=null}={}){
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw new CommitmentEnvelopeV4VerificationError('envelope must be object');
 if(envelope.schema_version!=='commitment.envelope/v4'||envelope.canonical_profile!=='sinergy.canonical-json/v1'||envelope.policy_profile!=='sinergy.commitment-schema-policy/v4')throw new CommitmentEnvelopeV4VerificationError('unsupported commitment profile');
 if(envelope.domain!=='SINERGY:ECONOMIC_CYCLE_TRACE'||envelope.payload_schema!=='economic.cycle-trace/v5')throw new CommitmentEnvelopeV4VerificationError('expected Trace v5 commitment domain');
 if(typeof envelope.payload_digest!=='string'||!HEX.test(envelope.payload_digest))throw new CommitmentEnvelopeV4VerificationError('payload_digest must be hex64');
 if(!Number.isSafeInteger(envelope.sequence)||envelope.sequence<0)throw new CommitmentEnvelopeV4VerificationError('sequence must be safe integer');
 if(typeof envelope.as_of!=='string'||!envelope.as_of.endsWith('Z')||!Number.isFinite(Date.parse(envelope.as_of)))throw new CommitmentEnvelopeV4VerificationError('as_of must be canonical UTC');
 if(payload!==null){if(payload.schema!=='economic.cycle-trace/v5'||payload.trust_finalization!=='EXTERNAL_COMMITMENT_REQUIRED')throw new CommitmentEnvelopeV4VerificationError('payload is not externally finalizable Trace v5');if(payload.cycle_id!==envelope.subject_id)throw new CommitmentEnvelopeV4VerificationError('subject_id/cycle mismatch');if(sha256Canonical(payload)!==envelope.payload_digest)throw new CommitmentEnvelopeV4VerificationError('payload digest mismatch');}
 return Object.freeze({schemaVersion:envelope.schema_version,policyProfile:envelope.policy_profile,subjectId:envelope.subject_id,payloadSchema:envelope.payload_schema,payloadDigest:envelope.payload_digest,commitmentDigest:sha256Canonical(envelope),asOf:envelope.as_of,displayAuthority:'READ_ONLY',financialAuthority:'NONE',executionAuthority:'NONE'});
}
module.exports={CommitmentEnvelopeV4VerificationError,verifyCommitmentEnvelopeV4};
