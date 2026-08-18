'use strict';

const {sha256Canonical}=require('./canonical_json_v1.cjs');
const HEX=/^[a-fA-F0-9]{64}$/;
const PHASES=Object.freeze([
 ['FUNDING_STATE','maturity.snapshot/v1','Shtenco/synergy_matrix_sota'],
 ['PROJECT_PROPOSAL','project.proposal/v2','Shtenco/synergy_eurasian'],
 ['PROJECT_SCREENING','project.screening/v1','Shtenco/synergy_financial_os'],
 ['CAPITAL_AUTHORIZATION','capital.authorization/v2','Shtenco/synergy_financial_os'],
 ['FUNDING_SETTLEMENT','settlement.receipt/v2','Shtenco/synergy_pay_system'],
 ['PROJECT_EVIDENCE','project.evidence/v1','Shtenco/synergy_eurasian'],
 ['REVENUE_SETTLEMENT','settlement.receipt/v2','Shtenco/synergy_pay_system'],
 ['REVENUE_RECOGNITION','revenue.recognition/v2','Shtenco/synergy_financial_os'],
 ['LEDGER_EVENT','ledger.event/v2','Shtenco/synergy_financial_os'],
 ['ACCOUNTING_SNAPSHOT','financial.snapshot/v2','Shtenco/synergy_financial_os'],
 ['ACCOUNTING_CLOSE','accounting.close/v2','Shtenco/synergy_financial_os'],
 ['LEDGER_INCLUSION_PROOF','ledger.inclusion-proof/v2','Shtenco/synergy_financial_os'],
]);
const PROJECT=new Set(['PROJECT_PROPOSAL','PROJECT_SCREENING','CAPITAL_AUTHORIZATION','PROJECT_EVIDENCE','REVENUE_RECOGNITION']);
class EconomicCycleTraceV6VerificationError extends Error{}
function verifyEconomicCycleTraceV6(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||p.schema!=='economic.cycle-trace/v6')throw new EconomicCycleTraceV6VerificationError('invalid trace v6');
 if(p.authority!=='PROVENANCE_ONLY'||p.profit_recognition!=='REFERENCE_ONLY'||p.accounting_close_authority!=='REFERENCE_ONLY'||p.execution_authority!=='NONE'||p.trust_finalization!=='EXTERNAL_COMMITMENT_REQUIRED')throw new EconomicCycleTraceV6VerificationError('trace authority/finalization boundary violated');
 if(!Array.isArray(p.references)||p.references.length<1||p.references.length>PHASES.length)throw new EconomicCycleTraceV6VerificationError('references must contain 1..12 phases');
 let prev=-Infinity;
 p.references.forEach((r,i)=>{const [phase,schema,source]=PHASES[i];if(!r||r.phase!==phase||r.schema_id!==schema||r.source_repository!==source)throw new EconomicCycleTraceV6VerificationError(`phase ${i} mismatch`);if(typeof r.digest!=='string'||!HEX.test(r.digest))throw new EconomicCycleTraceV6VerificationError('reference digest invalid');const t=Date.parse(r.observed_at);if(!Number.isFinite(t)||!r.observed_at.endsWith('Z')||t<prev)throw new EconomicCycleTraceV6VerificationError('trace time invalid');prev=t;if(phase==='FUNDING_STATE'&&r.subject_id!==p.household_or_funding_subject)throw new EconomicCycleTraceV6VerificationError('funding subject mismatch');if(PROJECT.has(phase)&&r.subject_id!==p.project_id)throw new EconomicCycleTraceV6VerificationError(`${phase} project mismatch`);});
 const complete=p.references.length===PHASES.length;const missing=PHASES.slice(p.references.length).map(x=>x[0]);if(p.complete!==complete||p.status!==(complete?'TRACE_COMPLETE':'TRACE_PARTIAL')||JSON.stringify(p.missing_phases)!==JSON.stringify(missing))throw new EconomicCycleTraceV6VerificationError('completion state mismatch');
 const body={...p};delete body.digest;if(sha256Canonical(body)!==String(p.digest).toLowerCase())throw new EconomicCycleTraceV6VerificationError('trace digest mismatch');
 return Object.freeze({schema:p.schema,cycleId:p.cycle_id,projectId:p.project_id,digest:p.digest.toLowerCase(),complete,status:p.status,references:Object.freeze(p.references.map(r=>Object.freeze({...r}))),trustFinalization:p.trust_finalization,displayAuthority:'READ_ONLY',accountingAuthority:'NONE',executionAuthority:'NONE'});
}
module.exports={PHASES,EconomicCycleTraceV6VerificationError,verifyEconomicCycleTraceV6};
