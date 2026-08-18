import { commitment } from './reference.mjs';

/**
 * One-time reservation -> signer execution lease registry.
 *
 * A budget reservation can be bound to exactly one budgetBoundExecutionRoot.
 * The wallet/HSM/MPC/PQ signer must require the returned executionLeaseRoot.
 * A failed attempt is terminally CANCELLED; a retry requires a new reservation.
 *
 * Production must persist `lock()` with serializable/CAS semantics. The reference
 * Map mutation is synchronous and deterministic but is not a distributed lock.
 */
export class BudgetExecutionLeaseRegistry {
  constructor() {
    this.leases = new Map();
  }

  lock({ reservation, signerEnvelope }) {
    if (!reservation?.reservationId || !reservation?.reservationRoot) {
      throw new Error('reservation identity/root required');
    }
    if (!signerEnvelope?.budgetBoundExecutionRoot) {
      throw new Error('budget-bound signer envelope required');
    }
    if (signerEnvelope.reservationId !== reservation.reservationId) {
      throw new Error('signer envelope reservation id mismatch');
    }
    if (signerEnvelope.reservationRoot !== reservation.reservationRoot) {
      throw new Error('signer envelope reservation root mismatch');
    }
    if (this.leases.has(reservation.reservationId)) {
      throw new Error('reservation already execution-locked or terminal');
    }

    const executionLeaseRoot = commitment('SYNERGY_AUTOPILOT_EXECUTION_LEASE_V1', {
      reservationId: reservation.reservationId,
      reservationRoot: reservation.reservationRoot,
      budgetBoundExecutionRoot: signerEnvelope.budgetBoundExecutionRoot,
      policyRoot: signerEnvelope.policyRoot,
      proposalRoot: signerEnvelope.proposalRoot,
      companyBudgetRoot: signerEnvelope.companyBudgetRoot ?? null,
      companyGraphRoot: signerEnvelope.companyGraphRoot ?? null,
      target: signerEnvelope.target,
      value: signerEnvelope.value,
      calldata: signerEnvelope.calldata,
      expiresAt: signerEnvelope.expiresAt,
    });

    const lease = {
      protocol: 'SYNERGY-AUTOPILOT-EXECUTION-LEASE/1',
      reservationId: reservation.reservationId,
      reservationRoot: reservation.reservationRoot,
      budgetBoundExecutionRoot: signerEnvelope.budgetBoundExecutionRoot,
      executionLeaseRoot,
      status: 'EXECUTION_LOCKED',
    };
    this.leases.set(reservation.reservationId, lease);
    return Object.freeze({ ...lease });
  }

  signerEnvelopeWithLease({ signerEnvelope, lease }) {
    if (!signerEnvelope?.budgetBoundExecutionRoot || !lease?.executionLeaseRoot) {
      throw new Error('signer envelope and execution lease required');
    }
    if (lease.budgetBoundExecutionRoot !== signerEnvelope.budgetBoundExecutionRoot) {
      throw new Error('execution lease does not bind signer envelope');
    }
    const current = this.leases.get(lease.reservationId);
    if (!current || current.status !== 'EXECUTION_LOCKED') {
      throw new Error('execution lease not active');
    }
    if (current.executionLeaseRoot !== lease.executionLeaseRoot) {
      throw new Error('execution lease root mismatch');
    }
    return Object.freeze({
      ...signerEnvelope,
      executionLeaseRoot: lease.executionLeaseRoot,
      requiresOneTimeExecutionLease: true,
    });
  }

  settle({ reservationId, executionLeaseRoot, executionReceiptRoot }) {
    const current = this.leases.get(reservationId);
    if (!current || current.status !== 'EXECUTION_LOCKED') {
      throw new Error('execution lease not active');
    }
    if (current.executionLeaseRoot !== executionLeaseRoot) {
      throw new Error('execution lease root mismatch');
    }
    if (!executionReceiptRoot) throw new Error('executionReceiptRoot required');
    const terminal = Object.freeze({
      ...current,
      status: 'SETTLED',
      executionReceiptRoot,
      terminalRoot: commitment('SYNERGY_AUTOPILOT_EXECUTION_LEASE_SETTLED_V1', {
        executionLeaseRoot,
        executionReceiptRoot,
      }),
    });
    this.leases.set(reservationId, terminal);
    return terminal;
  }

  cancel({ reservationId, executionLeaseRoot, reasonRoot }) {
    const current = this.leases.get(reservationId);
    if (!current || current.status !== 'EXECUTION_LOCKED') {
      throw new Error('execution lease not active');
    }
    if (current.executionLeaseRoot !== executionLeaseRoot) {
      throw new Error('execution lease root mismatch');
    }
    if (!reasonRoot) throw new Error('reasonRoot required');
    const terminal = Object.freeze({
      ...current,
      status: 'CANCELLED',
      reasonRoot,
      terminalRoot: commitment('SYNERGY_AUTOPILOT_EXECUTION_LEASE_CANCELLED_V1', {
        executionLeaseRoot,
        reasonRoot,
      }),
    });
    this.leases.set(reservationId, terminal);
    return terminal;
  }

  get(reservationId) {
    return this.leases.get(reservationId) ?? null;
  }
}

export function lockBudgetBoundExecution({ leaseRegistry, reservation, signerEnvelope }) {
  if (!(leaseRegistry instanceof BudgetExecutionLeaseRegistry)) {
    throw new Error('BudgetExecutionLeaseRegistry required');
  }
  const lease = leaseRegistry.lock({ reservation, signerEnvelope });
  return Object.freeze({
    lease,
    signerEnvelope: leaseRegistry.signerEnvelopeWithLease({ signerEnvelope, lease }),
  });
}
