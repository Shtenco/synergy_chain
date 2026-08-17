'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  SnapshotVerificationError,
  sha256Canonical,
  verifyFinancialSnapshotV2,
} = require('./read_only_snapshot_verifier.cjs');

const fixturePath = path.join(
  __dirname,
  'conformance',
  'financial_snapshot_v2_canonical.json',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function resign(snapshot) {
  const payload = { ...snapshot };
  delete payload.digest;
  snapshot.digest = sha256Canonical(payload);
  return snapshot;
}

(function mirroredAuthoritativeFixtureVerifiesExactly() {
  const verified = verifyFinancialSnapshotV2(fixture);
  assert.strictEqual(verified.schema, 'financial.snapshot/v2');
  assert.strictEqual(verified.sequence, 10);
  assert.strictEqual(
    verified.digest,
    'f0554b81af1924b9399f7d47a25af1a9d28ebf7373545ba72fea99788648a720',
  );
})();

(function fixtureDigestIsComputedOverPayloadWithoutDigest() {
  const payload = { ...fixture };
  const expected = payload.digest;
  delete payload.digest;
  assert.strictEqual(sha256Canonical(payload), expected);
})();

(function equivalentButNoncanonicalDecimalTextIsRejectedEvenWithFreshDigest() {
  const bad = JSON.parse(JSON.stringify(fixture));
  bad.hard_nav = '100.0';
  resign(bad);
  assert.throws(
    () => verifyFinancialSnapshotV2(bad),
    /hard_nav must be a canonical decimal string/,
  );
})();

(function leadingZeroDecimalTextIsRejectedEvenWithFreshDigest() {
  const bad = JSON.parse(JSON.stringify(fixture));
  bad.hard_external_assets = '0120';
  resign(bad);
  assert.throws(
    () => verifyFinancialSnapshotV2(bad),
    /hard_external_assets must be a canonical non-negative decimal string/,
  );
})();

(function integerWhereDecimalStringIsRequiredIsRejected() {
  const bad = JSON.parse(JSON.stringify(fixture));
  bad.hard_nav = 100;
  resign(bad);
  assert.throws(
    () => verifyFinancialSnapshotV2(bad),
    /hard_nav must be a canonical decimal string/,
  );
})();

(function unsafeSequenceIsRejectedBeforeDigestInterpretation() {
  const bad = JSON.parse(JSON.stringify(fixture));
  bad.sequence = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(
    () => verifyFinancialSnapshotV2(bad),
    SnapshotVerificationError,
  );
})();

(function portalStillExportsNoFinancialRecomputationAuthority() {
  const moduleApi = require('./read_only_snapshot_verifier.cjs');
  assert.strictEqual(moduleApi.computeHardNAV, undefined);
  assert.strictEqual(moduleApi.computePnL, undefined);
  assert.strictEqual(moduleApi.computeLCR, undefined);
})();

console.log('financial_snapshot_v2_conformance: mirrored authoritative fixture verified');
