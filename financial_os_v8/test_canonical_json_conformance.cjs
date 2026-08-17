'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  CanonicalJsonError,
  assertCanonicalJsonProfile,
  canonicalStringify,
  sha256Canonical,
} = require('./canonical_json_v1.cjs');
const snapshotApi = require('./read_only_snapshot_verifier.cjs');

const vectorPath = path.join(
  __dirname,
  'conformance',
  'canonical_json_v1_unicode_safe_integer.json',
);
const vector = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));

(function fixedVectorMatchesExactCanonicalString() {
  assert.strictEqual(vector.profile, 'sinergy.canonical-json/v1');
  assert.strictEqual(
    canonicalStringify(vector.payload),
    vector.canonical_json,
  );
})();

(function actualSnapshotVerifierUsesEquivalentCanonicalSerializer() {
  assert.strictEqual(
    snapshotApi.canonicalStringify(vector.payload),
    vector.canonical_json,
  );
  assert.strictEqual(
    snapshotApi.sha256Canonical(vector.payload),
    sha256Canonical(vector.payload),
  );
})();

(function reorderedObjectKeysProduceIdenticalCanonicalBytes() {
  const reordered = {
    bool: true,
    s: '1.23',
    n: 7,
    a: [3, { a: 'x', b: null }],
    z: 'Привет',
  };
  assert.strictEqual(canonicalStringify(reordered), vector.canonical_json);
  assert.strictEqual(sha256Canonical(reordered), sha256Canonical(vector.payload));
})();

(function floatsAreForbiddenEvenWhenFinite() {
  assert.throws(
    () => assertCanonicalJsonProfile({ value: 0.1 }),
    CanonicalJsonError,
  );
  assert.throws(
    () => canonicalStringify({ value: -0 }),
    /non-safe-integer number/,
  );
})();

(function unsafeIntegersAreForbidden() {
  assert.throws(
    () => canonicalStringify({ value: Number.MAX_SAFE_INTEGER + 1 }),
    /non-safe-integer number/,
  );
})();

(function decimalTextRemainsOpaqueExactTextAtJsonLayer() {
  assert.notStrictEqual(
    sha256Canonical({ value: '0.2' }),
    sha256Canonical({ value: '0.20' }),
  );
  // Decimal semantic normalization belongs to the domain producer/schema layer,
  // not to generic JSON serialization.
})();

console.log('canonical_json_v1: cross-language conformance vector completed');
