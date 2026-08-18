'use strict';

const { sha256Canonical } = require('./canonical_json_v1.cjs');

const HEX64 = /^[a-fA-F0-9]{64}$/;
const PHASES = Object.freeze([
  ['FUNDING_STATE','maturity.snapshot/v1','Shtenco/synergy_matrix_sota'],
  ['PROJECT_PROPOSAL','project.proposal/v2','Shtenco/synergy_eurasian'],
  ['PROJECT_SCREENING','project.screening/v1','Shtenco/synergy_financial_os'],
  ['CAPITAL_AUTHORIZATION','capital.authorization/v2','Shtenco/synergy_financial_os'],
  ['FUNDING_SETTLEMENT','settlement.receipt/v1','Shtenco/synergy_pay_system'],
  ['PROJECT_EVIDENCE','project.evidence/v1','Shtenco/synergy_eurasian'],
  ['REVENUE_SETTLEMENT','settlement.receipt/v1','Shtenco/synergy_pay_system'],
  ['ACCOUNTING_SNAPSHOT','financial.snapshot/v2','Shtenco/synergy_financial_os'],
  ['TRUST_COMMITMENT','commitment.envelope/v2','Shtenco/synergy_ai_blockchain'],
]);
const PROJECT_PHASES = new Set(['PROJECT_PROPOSAL','PROJECT_SCREENING','CAPITAL_AUTHORIZATION','PROJECT_EVIDENCE']);
const TOP = Object.freeze(['schema','cycle_id','household_or_funding_subject','project_id','status','complete','missing_phases','references','authority','profit_recognition','execution_authority','digest']);
const TOP_SET = new Set(TOP);
const REF = Object.freeze(['phase','schema_id','digest','source_repository','subject_id','observed_at']);
const REF_SET = new Set(REF);

class EconomicCycleTraceV2VerificationError extends Error {}

function reqText(v,n){ if(typeof v!=='string'||!v.trim()) throw new EconomicCycleTraceV2VerificationError(`${n} is required`); return v.trim(); }
function reqHex(v,n){ if(typeof v!=='string'||!HEX64.test(v)) throw new EconomicCycleTraceV2VerificationError(`${n} must be hex64`); return v.toLowerCase(); }
function utc(v,n){ if(typeof v!=='string'||!v.endsWith('Z')||!Number.isFinite(Date.parse(v))) throw new EconomicCycleTraceV2VerificationError(`${n} must be canonical UTC time`); return Date.parse(v); }

function verifyEconomicCycleTraceV2(trace){
  if(!trace||typeof trace!=='object'||Array.isArray(trace)) throw new EconomicCycleTraceV2VerificationError('trace must be object');
  const keys=Object.keys(trace); const missing=TOP.filter(f=>!Object.prototype.hasOwnProperty.call(trace,f)); const unknown=keys.filter(f=>!TOP_SET.has(f));
  if(missing.length||unknown.length) throw new EconomicCycleTraceV2VerificationError('trace shape mismatch');
  if(trace.schema!=='economic.cycle-trace/v2') throw new EconomicCycleTraceV2VerificationError('unsupported trace schema');
  const cycleId=reqText(trace.cycle_id,'cycle_id'); const funding=reqText(trace.household_or_funding_subject,'household_or_funding_subject'); const project=reqText(trace.project_id,'project_id');
  if(trace.authority!=='PROVENANCE_ONLY'||trace.profit_recognition!=='NOT_PERFORMED'||trace.execution_authority!=='NONE') throw new EconomicCycleTraceV2VerificationError('trace authority boundary violated');
  if(!Array.isArray(trace.references)||trace.references.length<1||trace.references.length>PHASES.length) throw new EconomicCycleTraceV2VerificationError('references must contain 1..9 phases');
  let previous=null;
  trace.references.forEach((r,i)=>{
    if(!r||typeof r!=='object'||Array.isArray(r)) throw new EconomicCycleTraceV2VerificationError(`reference ${i} must be object`);
    const rk=Object.keys(r); if(REF.some(f=>!Object.prototype.hasOwnProperty.call(r,f))||rk.some(f=>!REF_SET.has(f))) throw new EconomicCycleTraceV2VerificationError(`reference ${i} shape mismatch`);
    const [phase,schema,source]=PHASES[i];
    if(r.phase!==phase||r.schema_id!==schema||r.source_repository!==source) throw new EconomicCycleTraceV2VerificationError(`reference ${i} phase/schema/source mismatch`);
    reqHex(r.digest,`reference ${i} digest`); reqText(r.subject_id,`reference ${i} subject`); const t=utc(r.observed_at,`reference ${i} observed_at`);
    if(previous!==null&&t<previous) throw new EconomicCycleTraceV2VerificationError('trace time cannot move backwards'); previous=t;
    if(phase==='FUNDING_STATE'&&r.subject_id!==funding) throw new EconomicCycleTraceV2VerificationError('funding subject mismatch');
    if(PROJECT_PHASES.has(phase)&&r.subject_id!==project) throw new EconomicCycleTraceV2VerificationError(`${phase} project mismatch`);
  });
  const missingExpected=PHASES.slice(trace.references.length).map(([p])=>p);
  if(JSON.stringify(trace.missing_phases)!==JSON.stringify(missingExpected)) throw new EconomicCycleTraceV2VerificationError('missing_phases mismatch');
  const complete=trace.references.length===PHASES.length; if(trace.complete!==complete) throw new EconomicCycleTraceV2VerificationError('complete mismatch');
  if(trace.status!==(complete?'TRACE_COMPLETE':'TRACE_PARTIAL')) throw new EconomicCycleTraceV2VerificationError('status mismatch');
  const supplied=reqHex(trace.digest,'digest'); const body={...trace}; delete body.digest; if(supplied!==sha256Canonical(body)) throw new EconomicCycleTraceV2VerificationError('trace digest mismatch');
  return Object.freeze({schema:trace.schema,cycleId,projectId:project,status:trace.status,complete,digest:supplied,displayAuthority:'READ_ONLY',profitRecognition:'NONE',executionAuthority:'NONE'});
}

module.exports={PHASES,EconomicCycleTraceV2VerificationError,verifyEconomicCycleTraceV2};
