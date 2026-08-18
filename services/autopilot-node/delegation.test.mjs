import test from 'node:test';
import assert from 'node:assert/strict';

import { AutopilotPolicy } from './reference.mjs';
import {
  CompanyBudgetEnvelope,
  DelegationGrant,
  DelegatedBudgetLedger,
  companyGraphRoot,
} from './delegation.mjs';

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

function storageGrant() {
  return new DelegationGrant({
    parentPolicy: parent(),
    grantId: 'storage-v1',
    delegateNodeId: 'autopilot-storage',
    capabilities: ['prepare_storage'],
    allowedTargets: ['storage-market'],
    maxValuePerAction: '1000',
    maxValuePerEpoch: '2500',
    validFrom: 20,
    validUntil: 900,
  });
}

function companyEnvelope(maxValuePerEpoch = '3000') {
  return new CompanyBudgetEnvelope({
    companyId: 'company-1',
    parentPolicy: parent(),
    maxValuePerEpoch,
    validFrom: 20,
    validUntil: 900,
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

test('grant epoch budget is cumulative and idempotency is fail closed', () => {
  const ledger = new DelegatedBudgetLedger();
  const grant = financeGrant();
  const first = ledger.reserve({ grant, epoch: 100, reservationId: 'r1', value: 1000n });
  const second = ledger.reserve({ grant, epoch: 100, reservationId: 'r2', value: 1000n });
  assert.equal(first.grantBudgetRemaining, '1500');
  assert.equal(second.grantBudgetRemaining, '500');
  assert.throws(
    () => ledger.reserve({ grant, epoch: 100, reservationId: 'r3', value: 600n }),
    /epoch budget exceeded/,
  );
  assert.throws(
    () => ledger.reserve({ grant, epoch: 100, reservationId: 'r2', value: 1n }),
    /duplicate reservation/,
  );
  assert.throws(
    () => ledger.reserve({ grant, epoch: 7, reservationId: 'too-early', value: 1n }),
    /grant not valid in epoch/,
  );
});

test('company-wide epoch ceiling binds several independently legal department grants', () => {
  const ledger = new DelegatedBudgetLedger({ companyEnvelope: companyEnvelope('2500') });
  const finance = financeGrant();
  const storage = storageGrant();
  ledger.reserve({ grant: finance, epoch: 100, reservationId: 'f1', value: 1000n });
  ledger.reserve({ grant: storage, epoch: 100, reservationId: 's1', value: 1000n });
  assert.throws(
    () => ledger.reserve({ grant: finance, epoch: 100, reservationId: 'f2', value: 600n }),
    /company epoch budget exceeded/,
  );
  const snapshot = ledger.snapshot({ grant: finance, epoch: 100 });
  assert.equal(snapshot.companyReserved, '2000');
  assert.equal(snapshot.companyCommitted, '0');
});

test('release frees reservation but reservation id remains single use', () => {
  const ledger = new DelegatedBudgetLedger({ companyEnvelope: companyEnvelope('2500') });
  const grant = financeGrant();
  ledger.reserve({ grant, epoch: 100, reservationId: 'release-me', value: 1000n });
  const released = ledger.release({ reservationId: 'release-me', reasonRoot: 'simulation-failed-root' });
  assert.equal(released.releasedValue, '1000');
  const snapshot = ledger.snapshot({ grant, epoch: 100 });
  assert.equal(snapshot.grantReserved, '0');
  assert.equal(snapshot.grantCommitted, '0');
  assert.equal(snapshot.companyReserved, '0');
  assert.throws(
    () => ledger.reserve({ grant, epoch: 100, reservationId: 'release-me', value: 1n }),
    /duplicate reservation/,
  );
});

test('commit settles no more than reservation and releases the unused difference', () => {
  const ledger = new DelegatedBudgetLedger({ companyEnvelope: companyEnvelope('2500') });
  const grant = financeGrant();
  ledger.reserve({ grant, epoch: 100, reservationId: 'commit-me', value: 1000n });
  const committed = ledger.commit({
    reservationId: 'commit-me',
    actualValue: 725n,
    executionReceiptRoot: 'pq-execution-receipt-root',
  });
  assert.equal(committed.actualValue, '725');
  assert.equal(committed.releasedDifference, '275');
  const snapshot = ledger.snapshot({ grant, epoch: 100 });
  assert.equal(snapshot.grantReserved, '0');
  assert.equal(snapshot.grantCommitted, '725');
  assert.equal(snapshot.companyReserved, '0');
  assert.equal(snapshot.companyCommitted, '725');
  assert.throws(
    () => ledger.commit({ reservationId: 'commit-me', actualValue: 1n, executionReceiptRoot: 'x' }),
    /reservation not active/,
  );
});

test('human threshold and company graph commitment include company budget envelope', () => {
  const grant = financeGrant();
  const envelope = companyEnvelope();
  assert.equal(grant.requiresHumanApproval(750n), false);
  assert.equal(grant.requiresHumanApproval(751n), true);
  const args = {
    companyId: 'company-1',
    departments: [{ departmentId: 'finance' }, { departmentId: 'storage' }],
    delegations: [grant],
    companyBudgetEnvelope: envelope,
    edges: [{ from: 'finance', to: 'storage', type: 'invoice-archive' }],
  };
  assert.equal(companyGraphRoot(args), companyGraphRoot(args));
});
