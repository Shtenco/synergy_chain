import { commitment, AutopilotPolicy } from './reference.mjs';

function lowerSet(values) {
  return new Set((values || []).map(x => String(x).toLowerCase()));
}

function subset(child, parent) {
  for (const value of child) if (!parent.has(value)) return false;
  return true;
}

/**
 * A department/agent grant can only narrow a parent AutopilotPolicy.
 * It cannot add capabilities, targets, time or per-action value authority.
 */
export class DelegationGrant {
  constructor({
    parentPolicy,
    grantId,
    delegateNodeId,
    capabilities,
    allowedTargets = [],
    maxValuePerAction,
    maxValuePerEpoch,
    validFrom,
    validUntil,
    requireHumanAbove = null,
  }) {
    if (!(parentPolicy instanceof AutopilotPolicy)) throw new Error('parent AutopilotPolicy required');
    if (!grantId || !delegateNodeId) throw new Error('grant identity required');
    const caps = new Set(capabilities || []);
    if (!caps.size || !subset(caps, parentPolicy.capabilities)) throw new Error('capability escalation denied');

    const targets = lowerSet(allowedTargets);
    if (parentPolicy.allowedTargets.size && !subset(targets, parentPolicy.allowedTargets)) {
      throw new Error('target escalation denied');
    }

    const perAction = BigInt(maxValuePerAction);
    const perEpoch = BigInt(maxValuePerEpoch);
    if (perAction < 0n || perAction > parentPolicy.maxValuePerAction) throw new Error('per-action budget escalation denied');
    if (perEpoch < perAction) throw new Error('epoch budget must cover at least one allowed action');
    const from = Number(validFrom);
    const until = Number(validUntil);
    if (from < parentPolicy.validFrom || until > parentPolicy.validUntil || until < from) {
      throw new Error('delegation time escalation denied');
    }
    const human = requireHumanAbove === null ? null : BigInt(requireHumanAbove);
    if (human !== null && (human < 0n || human > perAction)) throw new Error('invalid human approval threshold');

    this.parentPolicy = parentPolicy;
    this.grantId = grantId;
    this.delegateNodeId = delegateNodeId;
    this.capabilities = caps;
    this.allowedTargets = targets;
    this.maxValuePerAction = perAction;
    this.maxValuePerEpoch = perEpoch;
    this.validFrom = from;
    this.validUntil = until;
    this.requireHumanAbove = human;
  }

  root() {
    return commitment('SYNERGY_AUTOPILOT_DELEGATION_V1', {
      parentPolicyRoot: this.parentPolicy.root(),
      grantId: this.grantId,
      delegateNodeId: this.delegateNodeId,
      capabilities: [...this.capabilities].sort(),
      allowedTargets: [...this.allowedTargets].sort(),
      maxValuePerAction: this.maxValuePerAction.toString(),
      maxValuePerEpoch: this.maxValuePerEpoch.toString(),
      validFrom: this.validFrom,
      validUntil: this.validUntil,
      requireHumanAbove: this.requireHumanAbove === null ? null : this.requireHumanAbove.toString(),
    });
  }

  allows({ capability, target, value, now }) {
    const amount = BigInt(value);
    if (!this.capabilities.has(capability)) return false;
    if (Number(now) < this.validFrom || Number(now) > this.validUntil) return false;
    if (amount < 0n || amount > this.maxValuePerAction) return false;
    if (this.allowedTargets.size && !this.allowedTargets.has(String(target).toLowerCase())) return false;
    return this.parentPolicy.allows({ capability, target, value: amount, now });
  }

  requiresHumanApproval(value) {
    return this.requireHumanAbove !== null && BigInt(value) > this.requireHumanAbove;
  }
}

/**
 * Aggregate company-wide ceiling above all departmental grants.
 * Individual grants may sum to more than this amount; the shared ledger ensures
 * their simultaneous/committed epoch spend cannot exceed this company envelope.
 */
export class CompanyBudgetEnvelope {
  constructor({ companyId, parentPolicy, maxValuePerEpoch, validFrom, validUntil }) {
    if (!companyId) throw new Error('companyId required');
    if (!(parentPolicy instanceof AutopilotPolicy)) throw new Error('parent AutopilotPolicy required');
    const cap = BigInt(maxValuePerEpoch);
    if (cap < 0n) throw new Error('company epoch budget must be non-negative');
    const from = Number(validFrom);
    const until = Number(validUntil);
    if (from < parentPolicy.validFrom || until > parentPolicy.validUntil || until < from) {
      throw new Error('company budget time escalation denied');
    }
    this.companyId = companyId;
    this.parentPolicy = parentPolicy;
    this.maxValuePerEpoch = cap;
    this.validFrom = from;
    this.validUntil = until;
  }

  root() {
    return commitment('SYNERGY_AUTOPILOT_COMPANY_BUDGET_V1', {
      companyId: this.companyId,
      parentPolicyRoot: this.parentPolicy.root(),
      maxValuePerEpoch: this.maxValuePerEpoch.toString(),
      validFrom: this.validFrom,
      validUntil: this.validUntil,
    });
  }
}

function stateKey(root, epoch) {
  return `${root}|${Number(epoch)}`;
}

function getAmount(map, key) {
  return map.get(key) || 0n;
}

/**
 * Reference reservation lifecycle. Production maps the same invariants into the
 * canonical double-entry ledger.
 *
 * reserve -> COMMIT or RELEASE
 * - reserve counts against both grant and company ceilings immediately;
 * - commit moves reserved value to committed spend and may settle for <= reserve;
 * - release frees the reservation after failed/cancelled execution;
 * - reservation ids are single-use even after release.
 */
export class DelegatedBudgetLedger {
  constructor({ companyEnvelope = null } = {}) {
    if (companyEnvelope !== null && !(companyEnvelope instanceof CompanyBudgetEnvelope)) {
      throw new Error('CompanyBudgetEnvelope required');
    }
    this.companyEnvelope = companyEnvelope;
    this.grantReserved = new Map();
    this.grantCommitted = new Map();
    this.companyReserved = new Map();
    this.companyCommitted = new Map();
    this.reservations = new Map();
    this.seen = new Set();
  }

  _companyKey(epoch) {
    return this.companyEnvelope ? stateKey(this.companyEnvelope.root(), epoch) : null;
  }

  reserve({ grant, epoch, reservationId, value }) {
    if (!(grant instanceof DelegationGrant)) throw new Error('DelegationGrant required');
    if (!reservationId) throw new Error('reservationId required');
    if (this.seen.has(reservationId)) throw new Error('duplicate reservation');
    const amount = BigInt(value);
    const numericEpoch = Number(epoch);
    if (amount < 0n || amount > grant.maxValuePerAction) throw new Error('action budget exceeded');
    if (numericEpoch < grant.validFrom || numericEpoch > grant.validUntil) throw new Error('grant not valid in epoch');

    const grantKey = stateKey(grant.root(), numericEpoch);
    const grantReserved = getAmount(this.grantReserved, grantKey);
    const grantCommitted = getAmount(this.grantCommitted, grantKey);
    if (grantReserved + grantCommitted + amount > grant.maxValuePerEpoch) {
      throw new Error('epoch budget exceeded');
    }

    const companyKey = this._companyKey(numericEpoch);
    if (this.companyEnvelope) {
      if (grant.parentPolicy.root() !== this.companyEnvelope.parentPolicy.root()) {
        throw new Error('grant parent policy differs from company envelope');
      }
      if (numericEpoch < this.companyEnvelope.validFrom || numericEpoch > this.companyEnvelope.validUntil) {
        throw new Error('company budget not valid in epoch');
      }
      const companyReserved = getAmount(this.companyReserved, companyKey);
      const companyCommitted = getAmount(this.companyCommitted, companyKey);
      if (companyReserved + companyCommitted + amount > this.companyEnvelope.maxValuePerEpoch) {
        throw new Error('company epoch budget exceeded');
      }
    }

    this.grantReserved.set(grantKey, grantReserved + amount);
    if (this.companyEnvelope) {
      this.companyReserved.set(companyKey, getAmount(this.companyReserved, companyKey) + amount);
    }
    this.seen.add(reservationId);
    this.reservations.set(reservationId, {
      reservationId,
      grant,
      grantRoot: grant.root(),
      grantKey,
      companyKey,
      epoch: numericEpoch,
      reservedValue: amount,
      status: 'RESERVED',
    });

    return Object.freeze({
      protocol: 'SYNERGY-AUTOPILOT-BUDGET-RESERVATION/2',
      reservationId,
      grantRoot: grant.root(),
      companyBudgetRoot: this.companyEnvelope ? this.companyEnvelope.root() : null,
      epoch: numericEpoch,
      value: amount.toString(),
      grantReservedAfter: (grantReserved + amount).toString(),
      grantCommitted: grantCommitted.toString(),
      grantBudgetRemaining: (grant.maxValuePerEpoch - grantReserved - grantCommitted - amount).toString(),
      companyBudgetRemaining: this.companyEnvelope
        ? (this.companyEnvelope.maxValuePerEpoch
          - getAmount(this.companyReserved, companyKey)
          - getAmount(this.companyCommitted, companyKey)).toString()
        : null,
      reservationRoot: commitment('SYNERGY_AUTOPILOT_BUDGET_RESERVATION_V2', {
        reservationId,
        grantRoot: grant.root(),
        companyBudgetRoot: this.companyEnvelope ? this.companyEnvelope.root() : null,
        epoch: numericEpoch,
        value: amount.toString(),
      }),
    });
  }

  commit({ reservationId, actualValue = null, executionReceiptRoot }) {
    const entry = this.reservations.get(reservationId);
    if (!entry) throw new Error('unknown reservation');
    if (entry.status !== 'RESERVED') throw new Error('reservation not active');
    if (!executionReceiptRoot) throw new Error('executionReceiptRoot required');
    const actual = actualValue === null ? entry.reservedValue : BigInt(actualValue);
    if (actual < 0n || actual > entry.reservedValue) throw new Error('actual value exceeds reservation');

    this.grantReserved.set(
      entry.grantKey,
      getAmount(this.grantReserved, entry.grantKey) - entry.reservedValue,
    );
    this.grantCommitted.set(
      entry.grantKey,
      getAmount(this.grantCommitted, entry.grantKey) + actual,
    );
    if (this.companyEnvelope) {
      this.companyReserved.set(
        entry.companyKey,
        getAmount(this.companyReserved, entry.companyKey) - entry.reservedValue,
      );
      this.companyCommitted.set(
        entry.companyKey,
        getAmount(this.companyCommitted, entry.companyKey) + actual,
      );
    }
    entry.status = 'COMMITTED';
    entry.actualValue = actual;
    entry.executionReceiptRoot = executionReceiptRoot;

    return Object.freeze({
      protocol: 'SYNERGY-AUTOPILOT-BUDGET-COMMIT/1',
      reservationId,
      status: entry.status,
      reservedValue: entry.reservedValue.toString(),
      actualValue: actual.toString(),
      releasedDifference: (entry.reservedValue - actual).toString(),
      executionReceiptRoot,
      grantCommittedAfter: getAmount(this.grantCommitted, entry.grantKey).toString(),
      companyCommittedAfter: this.companyEnvelope
        ? getAmount(this.companyCommitted, entry.companyKey).toString()
        : null,
      commitRoot: commitment('SYNERGY_AUTOPILOT_BUDGET_COMMIT_V1', {
        reservationId,
        reservedValue: entry.reservedValue.toString(),
        actualValue: actual.toString(),
        executionReceiptRoot,
      }),
    });
  }

  release({ reservationId, reasonRoot }) {
    const entry = this.reservations.get(reservationId);
    if (!entry) throw new Error('unknown reservation');
    if (entry.status !== 'RESERVED') throw new Error('reservation not active');
    if (!reasonRoot) throw new Error('reasonRoot required');

    this.grantReserved.set(
      entry.grantKey,
      getAmount(this.grantReserved, entry.grantKey) - entry.reservedValue,
    );
    if (this.companyEnvelope) {
      this.companyReserved.set(
        entry.companyKey,
        getAmount(this.companyReserved, entry.companyKey) - entry.reservedValue,
      );
    }
    entry.status = 'RELEASED';
    entry.reasonRoot = reasonRoot;

    return Object.freeze({
      protocol: 'SYNERGY-AUTOPILOT-BUDGET-RELEASE/1',
      reservationId,
      status: entry.status,
      releasedValue: entry.reservedValue.toString(),
      reasonRoot,
      releaseRoot: commitment('SYNERGY_AUTOPILOT_BUDGET_RELEASE_V1', {
        reservationId,
        releasedValue: entry.reservedValue.toString(),
        reasonRoot,
      }),
    });
  }

  snapshot({ grant, epoch }) {
    if (!(grant instanceof DelegationGrant)) throw new Error('DelegationGrant required');
    const numericEpoch = Number(epoch);
    const grantKey = stateKey(grant.root(), numericEpoch);
    const companyKey = this._companyKey(numericEpoch);
    return Object.freeze({
      grantReserved: getAmount(this.grantReserved, grantKey).toString(),
      grantCommitted: getAmount(this.grantCommitted, grantKey).toString(),
      companyReserved: this.companyEnvelope ? getAmount(this.companyReserved, companyKey).toString() : null,
      companyCommitted: this.companyEnvelope ? getAmount(this.companyCommitted, companyKey).toString() : null,
    });
  }
}

export function companyGraphRoot({ companyId, departments, delegations, edges, companyBudgetEnvelope = null }) {
  if (!companyId) throw new Error('companyId required');
  const deptIds = new Set((departments || []).map(x => x.departmentId));
  if (!deptIds.size) throw new Error('departments required');
  for (const edge of edges || []) {
    if (!deptIds.has(edge.from) || !deptIds.has(edge.to)) throw new Error('company graph edge references unknown department');
  }
  if (companyBudgetEnvelope !== null && !(companyBudgetEnvelope instanceof CompanyBudgetEnvelope)) {
    throw new Error('CompanyBudgetEnvelope required');
  }
  return commitment('SYNERGY_AUTOPILOT_COMPANY_GRAPH_V2', {
    companyId,
    departments: [...departments].sort((a, b) => String(a.departmentId).localeCompare(String(b.departmentId))),
    delegationRoots: [...delegations].map(g => g.root()).sort(),
    companyBudgetRoot: companyBudgetEnvelope ? companyBudgetEnvelope.root() : null,
    edges: [...(edges || [])].map(e => ({ from: e.from, to: e.to, type: e.type || 'workflow' }))
      .sort((a, b) => `${a.from}|${a.to}|${a.type}`.localeCompare(`${b.from}|${b.to}|${b.type}`)),
  });
}
