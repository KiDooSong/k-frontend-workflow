// The evidence selected by one normalized unit, shared by relation discovery
// and binding-closure pruning. API links were resolved against the original
// checked document, including its reference definitions; raw row DTOs alone
// cannot reconstruct that context.
import { ScopedWorkContractError } from './scoped-work-request.mjs';

const apiReferences = new WeakMap();

// Attach after unit normalization. Later Decision, boundary, uncertainty and
// applicability projections retain these same unit objects through their
// shallow spreads, including the frozen snapshot-composition path.
export function rememberScopedUnitApiOrdinaryRefs(unit, refs) {
  apiReferences.set(unit, Object.freeze([...refs]));
  return unit;
}

export function scopedUnitEvidenceSeeds(unit) {
  const ordinaryRefs = apiReferences.get(unit);
  // A serialized/caller-supplied API projection has lost its resolved links.
  // Do not turn that loss into a smaller closure and a seemingly current digest.
  if (unit.api_rows.length && ordinaryRefs === undefined) {
    throw new ScopedWorkContractError('SW-UNIT-EVIDENCE: selected API rows require their original resolved unit context');
  }
  const refs = [...unit.declaration.contracts, ...(unit.declaration.isolation?.decisions || [])];
  for (const source of unit.sources) {
    refs.push(...source.anchors.map((anchor) => anchor.ref));
    for (const group of source.groups) for (const effect of group.effects) refs.push(effect.target, effect.evidence.ref);
  }
  refs.push(...(ordinaryRefs || []), ...unit.api_rows.map((row) => row.tracking).filter(Boolean));
  return [...new Set(refs)];
}
