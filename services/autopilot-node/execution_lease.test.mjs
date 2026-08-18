import test from 'node:test';
import assert from 'node:assert/strict';

import { AutopilotPolicy } from './reference.mjs';
import { DelegationGrant, DelegatedBudgetLedger } from './delegation.mjs';
import { bindExecutionToReservation } from './budget_execution_gate.mjs';
import { BudgetExecutionLeaseRegistry, lockBudgetBoundExecution } from './execution_lease.mjs';

function grant() {
  const parentPolicy = new AutopilotPolicy({
    policyId: 'parent',
    ownerAccount: 'pq-account',
    capabilities: ['prepare_payment'],
    maxValuePerAction: '1000',
    validFrom: 1,
    validUntil: 1000,
    allowedTargets: ['supplier-1'],
  });
  return new DelegationGrant({
    parentPolicy,
    grantId: 'finance-v1',
    delegateNodeId: 'finance-node',
    capabilities: ['prepare_payment'],
    allowedTargets: ['supplier-1'],
    maxValuePerAction: '1000',
    maxValuePerEpoch: '2000',
    validFrom: 1,
    validUntil: 1000,
  });
}

function signerEnvelope(reservation, g, proposalRoot = 'proposal-a') {
  return bindExecutionToReservation({
    unsignedExecutionIntent: {
      target: 'supplier-1',
      value: '500',
      calldata: '0x1234',
      expiresAt: 200,
      requiresExternalCryptographicAuthorization: true,
    },
    reservation,
    policyRoot: g.parentPolicy.root(),
    proposalRoot,
  });
}

test('one reservation can be execution-locked only once', () => {
  const g = grant();
  const budget = new DelegatedBudgetLedger();
  const reservation = budget.reserve({ grant: g, epoch: 100, reservationId: 'r-lease-1', value: 600n });
  const signer = signerEnvelope(reservation, g);
  const leases = new BudgetExecutionLeaseRegistry();
  const locked = lockBudgetBoundExecution({ leaseRegistry: leases, reservation, signerEnvelope: signer });
  assert.equal(locked.signerEnvelope.requiresOneTimeExecutionLease, true);
  assert.ok(locked.signerEnvelope.executionLeaseRoot);
  assert.throws(
    () => lockBudgetBoundExecution({ leaseRegistry: leases, reservation, signerEnvelope: signer }),
    /already execution-locked or terminal/,
  );
});

test('same reservation cannot be rebound to a second proposal', () => {
  const g = grant();
  const budget = new DelegatedBudgetLedger();
  const reservation = budget.reserve({ grant: g, epoch: 100, reservationId: 'r-lease-2', value: 600n });
  const leases = new BudgetExecutionLeaseRegistry();
  lockBudgetBoundExecution({ leaseRegistry: leases, reservation, signerEnvelope: signerEnvelope(reservation, g, 'proposal-a') });
  assert.throws(
    () => lockBudgetBoundExecution({ leaseRegistry: leases, reservation, signerEnvelope: signerEnvelope(reservation, g, 'proposal-b') }),
    /already execution-locked or terminal/,
  );
});

test('settled or cancelled lease is terminal and cannot return to signer', () => {
  const g = grant();
  const budget = new DelegatedBudgetLedger();
  const reservation = budget.reserve({ grant: g, epoch: 100, reservationId: 'r-lease-3', value: 600n });
  const leases = new BudgetExecutionLeaseRegistry();
  const { lease, signerEnvelope: leasedSigner } = lockBudgetBoundExecution({
    leaseRegistry: leases,
    reservation,
    signerEnvelope: signerEnvelope(reservation, g),
  });
  const settled = leases.settle({
    reservationId: reservation.reservationId,
    executionLeaseRoot: lease.executionLeaseRoot,
    executionReceiptRoot: 'execution-receipt-root',
  });
  assert.equal(settled.status, 'SETTLED');
  assert.throws(
    () => leases.signerEnvelopeWithLease({ signerEnvelope: leasedSigner, lease }),
    /not active/,
  );
  assert.throws(
    () => leases.cancel({ reservationId: reservation.reservationId, executionLeaseRoot: lease.executionLeaseRoot, reasonRoot: 'x' }),
    /not active/,
  );
});

test('cancel is terminal; retry requires a new reservation id', () => {
  const g = grant();
  const budget = new DelegatedBudgetLedger();
  const reservation = budget.reserve({ grant: g, epoch: 100, reservationId: 'r-lease-4', value: 600n });
  const leases = new BudgetExecutionLeaseRegistry();
  const { lease } = lockBudgetBoundExecution({
    leaseRegistry: leases,
    reservation,
    signerEnvelope: signerEnvelope(reservation, g),
  });
  const cancelled = leases.cancel({
    reservationId: reservation.reservationId,
    executionLeaseRoot: lease.executionLeaseRoot,
    reasonRoot: 'provider-failed',
  });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.throws(
    () => lockBudgetBoundExecution({ leaseRegistry: leases, reservation, signerEnvelope: signerEnvelope(reservation, g) }),
    /already execution-locked or terminal/,
  );
});
