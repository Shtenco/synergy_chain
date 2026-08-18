import { commitment } from './reference.mjs';

function bigint(value, name) {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${name} must be an integer amount`);
  }
}

/**
 * Immutable budget commitment that must exist before a value-bearing Autopilot
 * execution can be handed to a wallet/HSM/MPC/PQ signer.
 *
 * This object intentionally contains no secret and no signature capability.
 */
export class BudgetBoundExecution {
  constructor({
    unsignedExecutionIntent,
    reservation,
    policyRoot,
    proposalRoot,
    companyGraphRoot = null,
  }) {
    if (!unsignedExecutionIntent || typeof unsignedExecutionIntent !== 'object') {
      throw new Error('unsignedExecutionIntent required');
    }
    if (!reservation || typeof reservation !== 'object') throw new Error('budget reservation required');
    if (!policyRoot || !proposalRoot) throw new Error('policyRoot and proposalRoot required');

    if (unsignedExecutionIntent.signature || unsignedExecutionIntent.privateKey || unsignedExecutionIntent.seed) {
      throw new Error('AI execution intent must remain unsigned and secret-free');
    }
    if (unsignedExecutionIntent.requiresExternalCryptographicAuthorization !== true) {
      throw new Error('external cryptographic authorization marker required');
    }

    const executionValue = bigint(unsignedExecutionIntent.value ?? 0, 'execution value');
    const reservedValue = bigint(reservation.value ?? reservation.reservedValue, 'reserved value');
    if (executionValue < 0n || reservedValue < 0n) throw new Error('negative value denied');
    if (executionValue > reservedValue) throw new Error('execution value exceeds budget reservation');
    if (!reservation.reservationId || !reservation.reservationRoot) {
      throw new Error('reservation identity/root required');
    }
    if (!reservation.grantRoot) throw new Error('grantRoot required');

    this.unsignedExecutionIntent = Object.freeze({ ...unsignedExecutionIntent });
    this.reservationId = reservation.reservationId;
    this.reservationRoot = reservation.reservationRoot;
    this.grantRoot = reservation.grantRoot;
    this.companyBudgetRoot = reservation.companyBudgetRoot ?? null;
    this.policyRoot = policyRoot;
    this.proposalRoot = proposalRoot;
    this.companyGraphRoot = companyGraphRoot;
    this.executionValue = executionValue;
    this.reservedValue = reservedValue;
  }

  root() {
    return commitment('SYNERGY_AUTOPILOT_BUDGET_BOUND_EXECUTION_V1', {
      unsignedExecutionIntent: this.unsignedExecutionIntent,
      reservationId: this.reservationId,
      reservationRoot: this.reservationRoot,
      grantRoot: this.grantRoot,
      companyBudgetRoot: this.companyBudgetRoot,
      policyRoot: this.policyRoot,
      proposalRoot: this.proposalRoot,
      companyGraphRoot: this.companyGraphRoot,
      executionValue: this.executionValue.toString(),
      reservedValue: this.reservedValue.toString(),
      requiresExternalCryptographicAuthorization: true,
    });
  }

  signerEnvelope() {
    return Object.freeze({
      protocol: 'SYNERGY-AUTOPILOT-SIGNER-ENVELOPE/1',
      budgetBoundExecutionRoot: this.root(),
      reservationId: this.reservationId,
      reservationRoot: this.reservationRoot,
      grantRoot: this.grantRoot,
      companyBudgetRoot: this.companyBudgetRoot,
      policyRoot: this.policyRoot,
      proposalRoot: this.proposalRoot,
      companyGraphRoot: this.companyGraphRoot,
      target: this.unsignedExecutionIntent.target,
      value: this.executionValue.toString(),
      calldata: this.unsignedExecutionIntent.calldata,
      expiresAt: this.unsignedExecutionIntent.expiresAt,
      requiresExternalCryptographicAuthorization: true,
    });
  }
}

/**
 * Final pre-signature gate. Wallet/HSM/MPC/PQ account code should receive only
 * this envelope and independently verify its committed roots against canonical
 * policy/budget state before signing.
 */
export function bindExecutionToReservation(args) {
  return new BudgetBoundExecution(args).signerEnvelope();
}

/**
 * Verify that an execution receipt commits the same budget-bound envelope before
 * the budget ledger is allowed to `commit()` the reservation.
 */
export function executionReceiptRootForBudgetCommit({ signerEnvelope, txHash, status, realizedValue }) {
  if (!signerEnvelope?.budgetBoundExecutionRoot) throw new Error('budget-bound signer envelope required');
  if (!txHash) throw new Error('txHash required');
  const value = bigint(realizedValue, 'realized value');
  if (value < 0n || value > bigint(signerEnvelope.value ?? 0, 'envelope value')) {
    throw new Error('realized value exceeds signed envelope');
  }
  return commitment('SYNERGY_AUTOPILOT_EXECUTION_RECEIPT_V2', {
    budgetBoundExecutionRoot: signerEnvelope.budgetBoundExecutionRoot,
    reservationId: signerEnvelope.reservationId,
    reservationRoot: signerEnvelope.reservationRoot,
    txHash,
    status,
    realizedValue: value.toString(),
  });
}
