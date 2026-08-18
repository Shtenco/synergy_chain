import test from 'node:test';
import assert from 'node:assert/strict';

import { AutopilotPolicy, commitment } from './reference.mjs';
import {
  CompanyBudgetEnvelope,
  DelegationGrant,
  DelegatedBudgetLedger,
} from './delegation.mjs';
import {
  bindExecutionToReservation,
  executionReceiptRootForBudgetCommit,
} from './budget_execution_gate.mjs';

function parent() {
  return new AutopilotPolicy({
    policyId: 'company-master-policy',
    ownerAccount: 'pq-company-account',
    capabilities: ['prepare_payment'],
    maxValuePerAction: '10000',
    validFrom: 10,
    validUntil: 1000,
    allowedTargets: ['supplier-1'],
  });
}

function grant() {
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
  });
}

function envelope() {
  return new CompanyBudgetEnvelope({
    companyId: 'company-1',
    parentPolicy: parent(),
    maxValuePerEpoch: '3000',
    validFrom: 20,
    validUntil: 900,
  });
}

function unsignedIntent(value = '725') {
  return {
    protocol: 'SYNERGY-AUTOPILOT-UNSIGNED-EXECUTION/1',
    target: 'supplier-1',
    value,
    calldata: '0xdeadbeef',
    expiresAt: 150,
    requiresExternalCryptographicAuthorization: true,
  };
}

test('value-bearing signer envelope must be bound to an active reservation root', () => {
  const ledger = new DelegatedBudgetLedger({ companyEnvelope: envelope() });
  const g = grant();
  const reservation = ledger.reserve({ grant: g, epoch: 100, reservationId: 'pay-1', value: 800n });
  const policyRoot = g.parentPolicy.root();
  const proposalRoot = commitment('TEST_PROPOSAL', { id: 'proposal-1' });
  const signer = bindExecutionToReservation({
    unsignedExecutionIntent: unsignedIntent('725'),
    reservation,
    policyRoot,
    proposalRoot,
    companyGraphRoot: 'company-graph-root',
  });

  assert.equal(signer.reservationId, 'pay-1');
  assert.equal(signer.reservationRoot, reservation.reservationRoot);
  assert.equal(signer.value, '725');
  assert.equal(signer.requiresExternalCryptographicAuthorization, true);
  assert.ok(signer.budgetBoundExecutionRoot);
  assert.equal('signature' in signer, false);
  assert.equal('privateKey' in signer, false);
});

test('execution cannot exceed reserved value even if AI proposal asks for more', () => {
  const ledger = new DelegatedBudgetLedger({ companyEnvelope: envelope() });
  const g = grant();
  const reservation = ledger.reserve({ grant: g, epoch: 100, reservationId: 'pay-2', value: 500n });
  assert.throws(() => bindExecutionToReservation({
    unsignedExecutionIntent: unsignedIntent('501'),
    reservation,
    policyRoot: g.parentPolicy.root(),
    proposalRoot: 'proposal-root',
  }), /exceeds budget reservation/);
});

test('AI intent containing secret/signature material is rejected before signer handoff', () => {
  const ledger = new DelegatedBudgetLedger({ companyEnvelope: envelope() });
  const g = grant();
  const reservation = ledger.reserve({ grant: g, epoch: 100, reservationId: 'pay-3', value: 100n });
  assert.throws(() => bindExecutionToReservation({
    unsignedExecutionIntent: { ...unsignedIntent('100'), privateKey: 'forbidden' },
    reservation,
    policyRoot: g.parentPolicy.root(),
    proposalRoot: 'proposal-root',
  }), /secret-free/);
});

test('realized receipt root and ledger commit remain bounded by signed envelope', () => {
  const ledger = new DelegatedBudgetLedger({ companyEnvelope: envelope() });
  const g = grant();
  const reservation = ledger.reserve({ grant: g, epoch: 100, reservationId: 'pay-4', value: 800n });
  const signer = bindExecutionToReservation({
    unsignedExecutionIntent: unsignedIntent('725'),
    reservation,
    policyRoot: g.parentPolicy.root(),
    proposalRoot: 'proposal-root',
  });
  const executionReceiptRoot = executionReceiptRootForBudgetCommit({
    signerEnvelope: signer,
    txHash: '0xabc',
    status: 'SETTLED',
    realizedValue: 700n,
  });
  const committed = ledger.commit({
    reservationId: 'pay-4',
    actualValue: 700n,
    executionReceiptRoot,
  });
  assert.equal(committed.actualValue, '700');
  assert.equal(committed.releasedDifference, '100');
  assert.throws(() => executionReceiptRootForBudgetCommit({
    signerEnvelope: signer,
    txHash: '0xdef',
    status: 'SETTLED',
    realizedValue: 726n,
  }), /exceeds signed envelope/);
});
