'use strict';

const { verifyCapitalAuthorizationV2 } = require('./read_only_capital_authorization_verifier_v2.cjs');
const { verifySettlementReceiptV2 } = require('./read_only_settlement_receipt_verifier_v2.cjs');
const { verifyEconomicCycleTraceV3 } = require('./read_only_economic_cycle_trace_verifier_v3.cjs');

class EconomicCycleBundleV3VerificationError extends Error {}

function ref(traceView, phase) {
  const found = traceView.references.find((r) => r.phase === phase);
  if (!found) throw new EconomicCycleBundleV3VerificationError(`missing ${phase} reference`);
  return found;
}

function verifyReadOnlyEconomicCycleBundleV3({
  authorization,
  fundingReceipt,
  revenueReceipt,
  trace,
  projectEvidenceDigest,
  now = null,
}) {
  const auth = verifyCapitalAuthorizationV2(authorization, { now });
  const funding = verifySettlementReceiptV2(fundingReceipt);
  const revenue = verifySettlementReceiptV2(revenueReceipt);
  const cycle = verifyEconomicCycleTraceV3(trace);
  const blockers = new Set();

  if (cycle.projectId !== auth.projectId) blockers.add('TRACE_AUTHORIZATION_PROJECT_MISMATCH');
  if (funding.flowKind !== 'PRODUCTIVE_CAPITAL_FUNDING') blockers.add('FUNDING_FLOW_KIND_MISMATCH');
  if (revenue.flowKind !== 'PROJECT_REVENUE') blockers.add('REVENUE_FLOW_KIND_MISMATCH');
  if (funding.projectId !== auth.projectId) blockers.add('FUNDING_PROJECT_MISMATCH');
  if (revenue.projectId !== auth.projectId) blockers.add('REVENUE_PROJECT_MISMATCH');
  if (funding.authorizationDigest !== auth.digest) blockers.add('FUNDING_AUTHORIZATION_MISMATCH');
  if (revenue.authorizationDigest !== auth.digest) blockers.add('REVENUE_AUTHORIZATION_MISMATCH');
  if (funding.payerId !== auth.fundingSourceId) blockers.add('FUNDING_SOURCE_MISMATCH');
  if (funding.payeeId !== auth.fundingDestinationId) blockers.add('FUNDING_DESTINATION_MISMATCH');
  if (funding.sourceAsset !== auth.fundingAsset) blockers.add('FUNDING_ASSET_MISMATCH');
  if (funding.sourceAmount !== auth.approvedAmount) blockers.add('FUNDING_AMOUNT_MISMATCH');
  if (revenue.projectEvidenceDigest !== projectEvidenceDigest) blockers.add('REVENUE_PROJECT_EVIDENCE_MISMATCH');

  const screeningRef = ref(cycle, 'PROJECT_SCREENING');
  const authorizationRef = ref(cycle, 'CAPITAL_AUTHORIZATION');
  const fundingRef = ref(cycle, 'FUNDING_SETTLEMENT');
  const evidenceRef = ref(cycle, 'PROJECT_EVIDENCE');
  const revenueRef = ref(cycle, 'REVENUE_SETTLEMENT');
  if (screeningRef.digest !== authorization.screening_digest) blockers.add('SCREENING_AUTHORIZATION_LINK_MISMATCH');
  if (authorizationRef.digest !== auth.digest) blockers.add('AUTHORIZATION_REFERENCE_MISMATCH');
  if (fundingRef.digest !== funding.receiptDigest) blockers.add('FUNDING_RECEIPT_REFERENCE_MISMATCH');
  if (evidenceRef.digest !== projectEvidenceDigest) blockers.add('PROJECT_EVIDENCE_REFERENCE_MISMATCH');
  if (revenueRef.digest !== revenue.receiptDigest) blockers.add('REVENUE_RECEIPT_REFERENCE_MISMATCH');
  if (fundingRef.observed_at !== funding.finalityTime) blockers.add('FUNDING_FINALITY_TIME_MISMATCH');
  if (revenueRef.observed_at !== revenue.finalityTime) blockers.add('REVENUE_FINALITY_TIME_MISMATCH');

  const blockerList = Object.freeze(Array.from(blockers).sort());
  return Object.freeze({
    status: blockerList.length ? 'READ_ONLY_BLOCKED' : 'READ_ONLY_VERIFIED',
    blockers: blockerList,
    cycleId: cycle.cycleId,
    projectId: cycle.projectId,
    traceDigest: cycle.digest,
    fundingReceiptDigest: funding.receiptDigest,
    revenueReceiptDigest: revenue.receiptDigest,
    displayAuthority: 'READ_ONLY',
    accountingAuthority: 'NONE',
    authorizationAuthority: 'NONE',
    executionAuthority: 'NONE',
    profitRecognition: 'NONE',
  });
}

module.exports = { EconomicCycleBundleV3VerificationError, verifyReadOnlyEconomicCycleBundleV3 };
