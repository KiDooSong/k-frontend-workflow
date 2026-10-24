// Item-backed source admission only. A supported state still needs the existing
// source/effect connections and, where required, a current complete-for-unit
// receipt. This does not judge semantics, origins, human approval or readiness.
export function scopedSourceState(summary) {
  const supported = summary.reconcileStatus === 'reconciled'
    ? ['accepted', 'pending', 'pending-user-decision', 'mixed'].includes(summary.result)
    : summary.reconcileStatus === 'partially-reconciled' && ['accepted', 'pending'].includes(summary.result);
  return { supported, receipt_required: supported && !(summary.reconcileStatus === 'reconciled' && summary.result === 'accepted') };
}
