// Compose file-backed R1 relation closure with ownership facts. This is NOT a
// binding digest, approval, uncertainty resolution, readiness or path permit.
// Public scoped execution stays unsupported until the complete runtime exists.
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { ScopedWorkContractError } from './scoped-work-request.mjs';
import { resolveScopedBoundaryProjection } from './scoped-work-boundaries.mjs';
import { resolveScopedUncertaintyProjection } from './scoped-work-uncertainty.mjs';
import { scopeJson, scopeSet } from './scoped-work-normalize.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-APPLICABILITY: ${message}`); };

export function resolveScopedApplicabilityProjection(options = {}) {
  const { projectRoot, kitRoot, layoutFile } = options;
  const boundary = resolveScopedBoundaryProjection(options);
  // Ignore caller role functions, as the boundary resolver does. All layers
  // must use the same selected layout/preset bytes and canonical document index.
  const layout = loadLayoutProfile({ kitRoot: kitRoot || projectRoot, flags: { layout: layoutFile } });
  const files = new Map();
  function audit(entries) {
    for (const entry of entries) {
      if (files.has(entry.file) && files.get(entry.file).sha256 !== entry.sha256) fail('snapshot changed between relation passes');
      files.set(entry.file, entry);
    }
  }
  audit(boundary.read_set);
  const { decision_relations: _decisions, ownership, ...unitProjection } = boundary.projection;
  const roots = new Map();
  let current;
  while (true) {
    current = resolveScopedUncertaintyProjection({ ...options, layout }, scopeSet([...roots.values()]));
    audit(current.read_set);
    const { decision_relations: _nextDecisions, uncertainty_relations, ...nextUnits } = current.projection;
    if (scopeJson(nextUnits) !== scopeJson(unitProjection)) fail('unit projection changed between layers');
    const count = roots.size;
    for (const application of uncertainty_relations.applications) {
      const root = { owner: application.owner, unit: application.unit, ref: application.uncertainty };
      roots.set(scopeJson(root), root);
    }
    // Canonical uncertainty refs x selected owner/units form a finite set.
    // Roots only grow; no arbitrary depth cutoff or first-host/first-pass win.
    if (roots.size === count) break;
  }
  for (const entry of files.values()) {
    const file = canonicalRepositoryPath(projectRoot, entry.file, { required: true, type: 'file', label: 'scoped applicability' });
    if (hashBytes(readCurrentBytes(file.absolute, 'scoped applicability')) !== entry.sha256) fail('snapshot changed after relation closure');
  }
  return { projection: { ...current.projection, ownership }, read_set: scopeSet([...files.values()]) };
}
