import crypto from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function commitment(domain, value) {
  return crypto.createHash('sha256').update(`${domain}|`).update(canonical(value)).digest('hex');
}

export class AutopilotPolicy {
  constructor({ policyId, ownerAccount, capabilities, maxValuePerAction, validFrom, validUntil, allowedTargets = [] }) {
    if (!policyId || !ownerAccount) throw new Error('policy identity required');
    if (!Array.isArray(capabilities) || capabilities.length === 0) throw new Error('capabilities required');
    this.policyId = policyId;
    this.ownerAccount = ownerAccount;
    this.capabilities = new Set(capabilities);
    this.maxValuePerAction = BigInt(maxValuePerAction);
    this.validFrom = Number(validFrom);
    this.validUntil = Number(validUntil);
    this.allowedTargets = new Set(allowedTargets.map(x => String(x).toLowerCase()));
  }

  allows({ capability, target, value, now }) {
    const amount = BigInt(value);
    if (!this.capabilities.has(capability)) return false;
    if (Number(now) < this.validFrom || Number(now) > this.validUntil) return false;
    if (amount < 0n || amount > this.maxValuePerAction) return false;
    if (this.allowedTargets.size && !this.allowedTargets.has(String(target).toLowerCase())) return false;
    return true;
  }

  root() {
    return commitment('SYNERGY_AUTOPILOT_POLICY_V1', {
      policyId: this.policyId,
      ownerAccount: this.ownerAccount,
      capabilities: [...this.capabilities].sort(),
      maxValuePerAction: this.maxValuePerAction.toString(),
      validFrom: this.validFrom,
      validUntil: this.validUntil,
      allowedTargets: [...this.allowedTargets].sort(),
    });
  }
}

export function buildProposal({ policy, capability, target, value, calldata, modelRoot, evidence, simulationState, risk, now, expiresAt }) {
  if (!(policy instanceof AutopilotPolicy)) throw new Error('AutopilotPolicy required');
  if (!policy.allows({ capability, target, value, now })) throw new Error('policy denied proposal');
  if (Number(expiresAt) <= Number(now) || Number(expiresAt) > policy.validUntil) throw new Error('invalid proposal expiry');
  if (!modelRoot) throw new Error('model root required');

  const proposal = {
    protocol: 'SYNERGY-AUTOPILOT-PROPOSAL/1',
    policyId: policy.policyId,
    policyRoot: policy.root(),
    ownerAccount: policy.ownerAccount,
    capability,
    target: String(target).toLowerCase(),
    value: BigInt(value).toString(),
    calldataCommitment: commitment('SYNERGY_CALLDATA_V1', calldata),
    modelRoot,
    evidenceRoot: commitment('SYNERGY_AUTOPILOT_EVIDENCE_V1', evidence),
    simulationStateRoot: commitment('SYNERGY_AUTOPILOT_SIMULATION_V1', simulationState),
    riskRoot: commitment('SYNERGY_AUTOPILOT_RISK_V1', risk),
    createdAt: Number(now),
    expiresAt: Number(expiresAt),
  };
  return Object.freeze({ ...proposal, proposalId: commitment('SYNERGY_AUTOPILOT_PROPOSAL_V1', proposal) });
}

/**
 * Intentionally returns an unsigned execution intent. A wallet/HSM/MPC/PQ
 * account must independently verify the committed fields and sign/execute it.
 */
export function executionIntent(proposal) {
  return Object.freeze({
    protocol: 'SYNERGY-AUTOPILOT-EXECUTION-INTENT/1',
    proposalId: proposal.proposalId,
    policyId: proposal.policyId,
    target: proposal.target,
    value: proposal.value,
    calldataCommitment: proposal.calldataCommitment,
    expiresAt: proposal.expiresAt,
    requiresExternalCryptographicAuthorization: true,
  });
}
