import test from 'node:test';
import assert from 'node:assert/strict';
import { AutopilotPolicy, buildProposal, executionIntent } from './reference.mjs';

function policy() {
  return new AutopilotPolicy({
    policyId: 'policy-1',
    ownerAccount: 'pq-account-1',
    capabilities: ['prepare_payment'],
    maxValuePerAction: '1000',
    validFrom: 10,
    validUntil: 100,
    allowedTargets: ['merchant-1'],
  });
}

test('denies capability escalation and overspend', () => {
  const p = policy();
  assert.equal(p.allows({ capability: 'prepare_swap', target: 'merchant-1', value: 1n, now: 20 }), false);
  assert.equal(p.allows({ capability: 'prepare_payment', target: 'merchant-1', value: 1001n, now: 20 }), false);
  assert.equal(p.allows({ capability: 'prepare_payment', target: 'merchant-2', value: 1n, now: 20 }), false);
});

test('proposal is commitment-bound but remains unsigned', () => {
  const proposal = buildProposal({
    policy: policy(),
    capability: 'prepare_payment',
    target: 'merchant-1',
    value: 100n,
    calldata: { invoice: 'A-1' },
    modelRoot: 'nexus-r75-root',
    evidence: [{ invoice: 'A-1', verified: true }],
    simulationState: { balanceBefore: 1000, balanceAfter: 900 },
    risk: { score: 0.02 },
    now: 20,
    expiresAt: 30,
  });
  const intent = executionIntent(proposal);
  assert.ok(proposal.proposalId.length === 64);
  assert.equal(intent.requiresExternalCryptographicAuthorization, true);
  assert.equal(Object.hasOwn(intent, 'signature'), false);
  assert.equal(Object.hasOwn(intent, 'privateKey'), false);
});
