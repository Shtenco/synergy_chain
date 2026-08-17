'use strict';

const assert = require('assert');
const { sha256Canonical } = require('./read_only_snapshot_verifier.cjs');
const {
  ProjectScreeningVerificationError,
  verifyProjectScreeningV1,
} = require('./read_only_project_screening_verifier.cjs');

function unsignedReviewable() {
  return {
    schema: 'project.screening/v1',
    project_id: 'project-1',
    proposal_digest: '11'.repeat(32),
    evidence_bundle_digest: null,
    policy_id: 'productive-screen-v1',
    policy_digest: '22'.repeat(32),
    translation_set_digest: '33'.repeat(32),
    reporting_currency: 'KZT',
    requested_funding: '70000000',
    private_capital: '30000000',
    first_loss_capital: '7000000',
    private_to_requested_ratio: '0.4285714285714285714285714286',
    first_loss_to_requested_ratio: '0.1',
    evidence_status: 'MODEL_ESTIMATE',
    risk_score: '0.25',
    maturity_weeks: 156,
    status: 'REVIEWABLE',
    blockers: [],
  };
}

function sign(payload) {
  return { ...payload, digest: sha256Canonical(payload) };
}

function resign(result) {
  const payload = { ...result };
  delete payload.digest;
  result.digest = sha256Canonical(payload);
  return result;
}

(function acceptsIntegrityValidReviewableResult() {
  const result = sign(unsignedReviewable());
  const verified = verifyProjectScreeningV1(result);
  assert.strictEqual(verified.status, 'REVIEWABLE');
  assert.deepStrictEqual(verified.blockers, []);
})();

(function tamperingWithoutResigningIsRejected() {
  const result = sign(unsignedReviewable());
  result.risk_score = '0.99';
  assert.throws(() => verifyProjectScreeningV1(result), /digest mismatch/);
})();

(function authorizingStatusIsRejectedEvenWithFreshDigest() {
  const result = sign(unsignedReviewable());
  result.status = 'APPROVED';
  resign(result);
  assert.throws(
    () => verifyProjectScreeningV1(result),
    /authorizing statuses are forbidden/,
  );
})();

(function fundedStatusIsRejectedEvenWithFreshDigest() {
  const result = sign(unsignedReviewable());
  result.status = 'FUNDED';
  resign(result);
  assert.throws(
    () => verifyProjectScreeningV1(result),
    /authorizing statuses are forbidden/,
  );
})();

(function reviewableCannotContainBlockers() {
  const result = sign(unsignedReviewable());
  result.blockers = ['RISK_SCORE_ABOVE_POLICY'];
  resign(result);
  assert.throws(() => verifyProjectScreeningV1(result), /REVIEWABLE result cannot contain blockers/);
})();

(function noActionRequiresBlockers() {
  const result = sign(unsignedReviewable());
  result.status = 'NO_ACTION';
  result.blockers = [];
  resign(result);
  assert.throws(() => verifyProjectScreeningV1(result), /NO_ACTION result requires/);
})();

(function validNoActionIsDisplayableButNotReviewable() {
  const payload = unsignedReviewable();
  payload.status = 'NO_ACTION';
  payload.blockers = ['RISK_SCORE_ABOVE_POLICY'];
  const verified = verifyProjectScreeningV1(sign(payload));
  assert.strictEqual(verified.status, 'NO_ACTION');
  assert.deepStrictEqual(verified.blockers, ['RISK_SCORE_ABOVE_POLICY']);
})();

(function invalidPolicyDigestIsRejected() {
  const result = sign(unsignedReviewable());
  result.policy_digest = 'bad';
  resign(result);
  assert.throws(() => verifyProjectScreeningV1(result), /policy_digest/);
})();

(function nonCanonicalRiskScoreIsRejected() {
  const result = sign(unsignedReviewable());
  result.risk_score = 'NaN';
  resign(result);
  assert.throws(() => verifyProjectScreeningV1(result), /risk_score/);
})();

(function numericFundingInsteadOfDecimalStringIsRejected() {
  const result = sign(unsignedReviewable());
  result.requested_funding = 70000000;
  resign(result);
  assert.throws(() => verifyProjectScreeningV1(result), /requested_funding/);
})();

(function missingFieldIsRejectedEvenWithFreshDigest() {
  const result = unsignedReviewable();
  delete result.translation_set_digest;
  const signed = sign(result);
  assert.throws(() => verifyProjectScreeningV1(signed), /missing required fields/);
})();

(function verifierExportsNoFundingOrApprovalApi() {
  const moduleApi = require('./read_only_project_screening_verifier.cjs');
  assert.strictEqual(moduleApi.approveProject, undefined);
  assert.strictEqual(moduleApi.authorizeFunding, undefined);
  assert.strictEqual(moduleApi.authorizeQE, undefined);
})();

console.log('read_only_project_screening_verifier: non-authorizing tests completed');
