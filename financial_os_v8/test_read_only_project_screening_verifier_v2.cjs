'use strict';

const assert = require('assert');
const {
  ProjectScreeningVerificationError,
  sha256Canonical,
  verifyProjectScreeningV1V2,
} = require('./read_only_project_screening_verifier_v2.cjs');

function unsignedReviewable() {
  return {
    schema: 'project.screening/v1',
    project_id: 'project-1',
    proposal_digest: '11'.repeat(32),
    evidence_bundle_digest: null,
    policy_id: 'policy-v1',
    policy_digest: '22'.repeat(32),
    translation_set_digest: '33'.repeat(32),
    reporting_currency: 'KZT',
    requested_funding: '70',
    private_capital: '30',
    first_loss_capital: '7',
    private_to_requested_ratio: '0.4285714285714285714285714286',
    first_loss_to_requested_ratio: '0.1',
    evidence_status: 'MODEL_ESTIMATE',
    risk_score: '0.2',
    maturity_weeks: 52,
    status: 'REVIEWABLE',
    blockers: [],
  };
}

function signedReviewable() {
  const payload = unsignedReviewable();
  return { ...payload, digest: sha256Canonical(payload) };
}

function resign(payload) {
  const unsigned = { ...payload };
  delete unsigned.digest;
  payload.digest = sha256Canonical(unsigned);
  return payload;
}

(function acceptsCanonicalReviewablePayloadWithoutAuthorizingIt() {
  const payload = signedReviewable();
  const verified = verifyProjectScreeningV1V2(payload);
  assert.strictEqual(verified.status, 'REVIEWABLE');
  assert.strictEqual(verified.reviewable, true);
  assert.strictEqual(verified.projectId, 'project-1');
  assert.strictEqual(verified.digest, payload.digest);
})();

(function acceptsCanonicalNoActionOnlyWithBlockers() {
  const payload = unsignedReviewable();
  payload.status = 'NO_ACTION';
  payload.blockers = ['RISK_SCORE_ABOVE_POLICY'];
  resign(payload);
  const verified = verifyProjectScreeningV1V2(payload);
  assert.strictEqual(verified.status, 'NO_ACTION');
  assert.strictEqual(verified.reviewable, false);
})();

(function freshDigestCannotTurnReviewableIntoApproved() {
  const payload = unsignedReviewable();
  payload.status = 'APPROVED';
  resign(payload);
  assert.throws(
    () => verifyProjectScreeningV1V2(payload),
    /unsupported non-authorizing screening status/,
  );
})();

(function freshDigestCannotLegalizeEquivalentButNoncanonicalFundingText() {
  for (const bad of ['70.0', '070', '70.00']) {
    const payload = unsignedReviewable();
    payload.requested_funding = bad;
    resign(payload);
    assert.throws(
      () => verifyProjectScreeningV1V2(payload),
      /requested_funding must be canonical decimal text/,
    );
  }
})();

(function freshDigestCannotLegalizeEquivalentButNoncanonicalRiskText() {
  for (const bad of ['0.20', '-0', '1.0']) {
    const payload = unsignedReviewable();
    payload.risk_score = bad;
    resign(payload);
    assert.throws(
      () => verifyProjectScreeningV1V2(payload),
      /risk_score must be canonical decimal text/,
    );
  }
})();

(function unsafeMaturityIntegerIsRejectedBySharedCanonicalProfile() {
  const payload = unsignedReviewable();
  payload.maturity_weeks = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(
    () => resign(payload),
    /non-safe-integer number/,
  );
})();

(function reviewableWithBlockersIsRejectedEvenWithFreshDigest() {
  const payload = unsignedReviewable();
  payload.blockers = ['SOME_BLOCKER'];
  resign(payload);
  assert.throws(
    () => verifyProjectScreeningV1V2(payload),
    /REVIEWABLE result cannot contain blockers/,
  );
})();

(function noActionWithoutBlockersIsRejectedEvenWithFreshDigest() {
  const payload = unsignedReviewable();
  payload.status = 'NO_ACTION';
  resign(payload);
  assert.throws(
    () => verifyProjectScreeningV1V2(payload),
    /NO_ACTION result requires at least one blocker/,
  );
})();

(function duplicateBlockersAreRejectedEvenWithFreshDigest() {
  const payload = unsignedReviewable();
  payload.status = 'NO_ACTION';
  payload.blockers = ['RISK_SCORE_ABOVE_POLICY', 'RISK_SCORE_ABOVE_POLICY'];
  resign(payload);
  assert.throws(
    () => verifyProjectScreeningV1V2(payload),
    /blockers must be unique/,
  );
})();

(function malformedEvidenceDigestIsRejected() {
  const payload = unsignedReviewable();
  payload.evidence_bundle_digest = 'not-a-digest';
  resign(payload);
  assert.throws(
    () => verifyProjectScreeningV1V2(payload),
    /evidence_bundle_digest/,
  );
})();

(function verifierExportsNoApprovalFundingOrUnderwritingApi() {
  const api = require('./read_only_project_screening_verifier_v2.cjs');
  assert.strictEqual(api.approveProject, undefined);
  assert.strictEqual(api.fundProject, undefined);
  assert.strictEqual(api.computeRiskScore, undefined);
  assert.strictEqual(api.computePrivateMatch, undefined);
  assert.strictEqual(api.computeFirstLossRatio, undefined);
})();

console.log('read_only_project_screening_verifier_v2: canonical/non-authorizing tests completed');
