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
    if (!parentPolicy.allowedTargets.size && !targets.size) {
      // Empty parent targets means parent is unrestricted; child may also remain unrestricted.
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

/** Reference accounting ledger. Production uses canonical double-entry state. */
export class DelegatedBudgetLedger {
  constructor() {
    this.spent = new Map();
    this.seen = new Set();
  }

  reserve({ grant, epoch, reservationId, value }) {
    if (!(grant instanceof DelegationGrant)) throw new Error('DelegationGrant required');
    if (!reservationId) throw new Error('reservationId required');
    if (this.seen.has(reservationId)) throw new Error('duplicate reservation');
    const amount = BigInt(value);
    if (amount < 0n || amount > grant.maxValuePerAction) throw new Error('action budget exceeded');
    const key = `${grant.root()}|${Number(epoch)}`;
    const previous = this.spent.get(key) || 0n;
    const next = previous + amount;
    if (next > grant.maxValuePerEpoch) throw new Error('epoch budget exceeded');
    this.spent.set(key, next);
    this.seen.add(reservationId);
    return Object.freeze({
      protocol: 'SYNERGY-AUTOPILOT-BUDGET-RESERVATION/1',
      reservationId,
      grantRoot: grant.root(),
      epoch: Number(epoch),
      value: amount.toString(),
      spentAfter: next.toString(),
      budgetRemaining: (grant.maxValuePerEpoch - next).toString(),
      reservationRoot: commitment('SYNERGY_AUTOPILOT_BUDGET_RESERVATION_V1', {
        reservationId,
        grantRoot: grant.root(),
        epoch: Number(epoch),
        value: amount.toString(),
        spentAfter: next.toString(),
      }),
    });
  }
}

export function companyGraphRoot({ companyId, departments, delegations, edges }) {
  if (!companyId) throw new Error('companyId required');
  const deptIds = new Set((departments || []).map(x => x.departmentId));
  if (!deptIds.size) throw new Error('departments required');
  for (const edge of edges || []) {
    if (!deptIds.has(edge.from) || !deptIds.has(edge.to)) throw new Error('company graph edge references unknown department');
  }
  return commitment('SYNERGY_AUTOPILOT_COMPANY_GRAPH_V1', {
    companyId,
    departments: [...departments].sort((a, b) => String(a.departmentId).localeCompare(String(b.departmentId))),
    delegationRoots: [...delegations].map(g => g.root()).sort(),
    edges: [...(edges || [])].map(e => ({ from: e.from, to: e.to, type: e.type || 'workflow' }))
      .sort((a, b) => `${a.from}|${a.to}|${a.type}`.localeCompare(`${b.from}|${b.to}|${b.type}`)),
  });
}
