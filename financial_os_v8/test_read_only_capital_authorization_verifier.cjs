'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sha256Canonical } = require('./canonical_json_v1.cjs');
const {
  CapitalAuthorizationVerificationError,
  verifyCapitalAuthorizationV1,
} = require('./read_only_capital_authorization_verifier.cjs');

const FIXTURE = path.join(__dirname, 'conformance', 'capital_authorization_v1_canonical.json');

function payload() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
}

function redigest(input) {
  const copy = JSON.parse(JSON.stringify(input));
  delete copy.digest;
  copy.digest = sha256Canonical(copy);
  return copy;
}

const verified = verifyCapitalAuthorizationV1(payload(), { now: '2026-08-18T20:00:00Z' });
assert.strictEqual(verified.digest, '1bf53290d288e2117ce9c339227669673658eed2c95d72dc2657236b11ae2140');
assert.strictEqual(verified.validNow, true);
assert.strictEqual(verified.displayAuthority, 'READ_ONLY');
assert.strictEqual(verified.executionAuthority, 'NONE');

const afterExpiry = verifyCapitalAuthorizationV1(payload(), { now: '2026-08-18T21:00:00Z' });
assert.strictEqual(afterExpiry.validNow, false);

{
  const bad = payload();
  bad.ai_authority = 'APPROVE';
  assert.throws(
    () => verifyCapitalAuthorizationV1(redigest(bad)),
    CapitalAuthorizationVerificationError,
  );
}

{
  const bad = payload();
  bad.approved_amount = '1000.00';
  assert.throws(
    () => verifyCapitalAuthorizationV1(redigest(bad)),
    CapitalAuthorizationVerificationError,
  );
}

{
  const bad = payload();
  bad.decision_authority = 'AI';
  assert.throws(
    () => verifyCapitalAuthorizationV1(redigest(bad)),
    CapitalAuthorizationVerificationError,
  );
}

{
  const bad = payload();
  bad.execution_authority = 'EXECUTE_PAYMENT';
  assert.throws(
    () => verifyCapitalAuthorizationV1(redigest(bad)),
    CapitalAuthorizationVerificationError,
  );
}

{
  const bad = payload();
  bad.financial_snapshot_sequence = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(
    () => verifyCapitalAuthorizationV1(redigest(bad)),
    CapitalAuthorizationVerificationError,
  );
}

{
  const bad = payload();
  bad.extra = 'not allowed';
  assert.throws(
    () => verifyCapitalAuthorizationV1(bad),
    CapitalAuthorizationVerificationError,
  );
}

console.log('read-only CapitalAuthorization verifier: PASS');
