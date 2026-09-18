// Selected host mapping evidence. Not a surface membership/path/AND evaluator.
import { col } from './spec.mjs';
import { parseTargetRef } from './reconciliation-items.mjs';
import { ownerParts } from './current-work-request.mjs';
import { resolveEffectiveSourceRef, inspectFigmaSourcePrecision, isRfc3339 } from './provenance.mjs';
import { workText, workSet, ScopedWorkContractError } from './scoped-work-request.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
import { createScopedSourceResolver } from './scoped-work-sources.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-MAPPING: ${message}`); };
const rowValues = (selection) => Object.fromEntries(selection.headers.map((key, index) => [key, selection.cells[index]]));

export function resolveScopedMappingEvidence({ hostRef, mappingRef, mKeys, inputArtifacts, targetIndex, projectRoot } = {}) {
  workText(hostRef, 'host reference'); workText(mappingRef, 'mapping reference');
  const hostToken = parseTargetRef(hostRef);
  const mappingToken = parseTargetRef(mappingRef);
  if (hostToken?.kind !== 'artifact' || hostToken.section ||
      mappingToken?.kind !== 'artifact' || mappingToken.section !== 'component-mapping' || mappingToken.rowKey !== null) {
    fail('whole host artifact and #component-mapping section required');
  }
  const refs = createScopedReferenceResolver({ targetIndex, projectRoot, inputArtifacts });
  const host = refs.contract(hostRef);
  const mapping = refs.contract(mappingRef);
  if (host.metadata.artifact_type !== 'screen-spec' || mapping.metadata.artifact_type !== 'figma-component-mapping') {
    fail('canonical ScreenSpec and Figma mapping required');
  }
  const screenId = workText(host.metadata.screen_id, 'host screen_id');
  const domain = workText(host.metadata.domain, 'host domain');
  ownerParts(`screen:${screenId}`);
  if (mapping.metadata.screen_id !== screenId || mapping.metadata.domain !== domain) fail('mapping belongs to a different host or domain');
  const evidence = createScopedSourceResolver({ inputArtifacts, targetIndex, projectRoot });
  const keys = workSet(mKeys, (key) => workText(key, 'Mapping Key'), 'm_keys', true);
  const rows = keys.map((key) => {
    const component = refs.contract(`${mappingRef}/${key}`).selection;
    const provenance = refs.contract(`artifact:${mapping.artifact_id}#mapping-provenance/${key}`).selection;
    const values = rowValues(provenance);
    const selected = evidence.evidence(col(values, 'Evidence'));
    const sourceRef = resolveEffectiveSourceRef(col(values, 'Source Ref'), { fm: selected.input.metadata });
    const sourceUnit = col(values, 'Source Unit');
    if (!inspectFigmaSourcePrecision({ sourceRef, sourceUnit }).ok) fail(`selected ${key} lacks precise Figma evidence`);
    const authoredTime = col(values, 'Captured At');
    const capturedAt = authoredTime === 'inherit' ? selected.input.metadata.captured_at : authoredTime;
    if (!isRfc3339(capturedAt)) fail(`selected ${key} timestamp cannot be resolved`);
    return { m_key: key, component, provenance, ...selected,
      effective_source_ref: sourceRef, source_unit: sourceUnit, effective_captured_at: capturedAt };
  });
  // Different hosts may legitimately have different Figma nodes. This resolver
  // records them; it neither picks a winner nor infers component ownership/permit.
  return { host: { artifact_id: host.artifact_id, file: host.file, screen_id: screenId, domain },
    mapping: { artifact_id: mapping.artifact_id, file: mapping.file, metadata: mapping.metadata }, rows };
}
