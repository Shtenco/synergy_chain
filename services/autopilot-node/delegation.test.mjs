import test from 'node:test';
import assert from 'node:assert/strict';

import { AutopilotPolicy } from './reference.mjs';
import { DelegationGrant, DelegatedBudgetLedger, companyGraphRoot } from './delegation.mjs';

function parent() {
  return new AutopilotPolicy({
    policyId: 'company-master-policy',
    ownerAccount: 'pq-company-account',
    capabilities: ['prepare_payment', 'prepare_storage', 'request_cognitive_work'],
    maxValuePerAction: '10000',
    validFrom: 10,
    validUntil: 1000,
    allowedTargets: ['supplier-1', 'storage-market', 'cognitive-market'],
  });
}

function financeGrant() {
  return new DelegationGrant({
    parentPolicy: parent(),
    grantId: 'finance-v1',
    delegateNodeId: 'autopilot-finance',
    capabilities: ['prepare_payment'],
    allowedTargets: ['supplier-1'],
    maxValuePerAction: '1000',
    maxValuePerEpoch: '2500',
    validFrom: 20,
    validUntil: 900,
    requireHumanAbove: '750',
  });
}

test('department cannot escalate parent capability', () => {
  assert.throws(() => new DelegationGrant({
    parentPolicy: parent(),
    grantId: 'bad',
    delegateNodeId: 'bad-node',
    capabilities: ['transfer_private_key'],
    allowedTargets: ['supplier-1'],
    maxValuePerAction: '1',
    maxValuePerEpoch: '1',
    validFrom: 20,
    validUntil: 30,
  }), /capability escalation denied/);
});

test('department cannot expand target or per-action budget', () => {
  assert.throws(() => new DelegationGrant({
    parentPolicy: parent(),
    grantId: 'bad-target',
    delegateNodeId: 'bad-node',
    capabilities: ['prepare_payment'],
    allowedTargets: ['unknown-supplier'],
    maxValuePerAction: '100',
    maxValuePerEpoch: '100',
    validFrom: 20,
    validUntil: 30,
  }), /target escalation denied/);

  assert.throws(() => new DelegationGrant({
    parentPolicy: parent(),
    grantId: 'bad-value',
    delegateNodeId: 'bad-node',
    capabilities: ['prepare_payment'],
    allowedTargets: ['supplier-1'],
    maxValuePerAction: '10001',
    maxValuePerEpoch: '20000',
    validFrom: 20,
    validUntil: 30,
  }), /per-action budget escalation denied/);
});

test('epoch budget is cumulative and idempotency is fail closed', () => {
  const ledger = new DelegatedBudgetLedger();
  const grant = financeGrant();
  const first = ledger.reserve({ grant, epoch: 7, reservationId: 'r1', value: 1000n });
  const second = ledger.reserve({ grant, epoch: 7, reservationId: 'r2', value: 1000n });
  assert.equal(first.budgetRemaining, '1500');
  assert.equal(second.budgetRemaining, '500');
  assert.throws(() => ledger.reserve({ grant, epoch: 7, reservationId: 'r3', value: 600n }), /epoch budget exceeded/);
  assert.throws(() => ledger.reserve({ grant, epoch: 7, reservationId: 'r2', value: 1n }), /duplicate reservation/);
});

test('human threshold and company graph commitment are deterministic', () => {
  const grant = financeGrant();
  assert.equal(grant.requiresHumanApproval(750n), false);
  assert.equal(grant.requiresHumanApproval(751n), true);
  const args = {
    companyId: 'company-1',
    departments: [{ departmentId: 'finance' }, { departmentId: 'storage' }],
    delegations: [grant],
    edges: [{ from: 'finance', to: 'storage', type: 'invoice-archive' }],
  };
  assert.equal(companyGraphRoot(args), companyGraphRoot(args));
});
