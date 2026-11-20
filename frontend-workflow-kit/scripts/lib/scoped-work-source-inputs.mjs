// Input metadata/index preparation for a CLI-owned immutable Git collection.
// Share only the fixed inventory, never loaded bodies, section caches, file
// observations, register validation or source/authority decisions.
import { validateInputArtifacts } from './input-artifact.mjs';
import { buildInputArtifactIndex, copyInputEvidenceObservation, observeInputEvidenceReads } from './provenance.mjs';
import { prepareScopedInputMetadata, isPreparedScopedInputMetadata,
  cloneScopedSourceMetadata } from './scoped-work-input-metadata.mjs';
import { scopedProjectionProgress } from './workflow-progress.mjs';

const collections = new WeakMap();
const stats = { catalogs: 0, records: 0, selected: 0, catalogReuses: 0 };
const fields = new Set(['file', 'fm', 'hasFrontmatter', 'parseError', 'body']);

export function scopedSourceInputStats() {
  return { ...stats };
}

function immutableRecord(entry) {
  // The caller's spread has already detached ordinary record fields. Accept
  // only the collector's primitive fields plus privately prepared metadata;
  // extra mutable data and unsupported YAML keep the existing eager path.
  return Object.getPrototypeOf(entry) === Object.prototype &&
    Reflect.ownKeys(entry).every((key) => fields.has(key)) &&
    typeof entry.file === 'string' && typeof entry.hasFrontmatter === 'boolean' &&
    (entry.parseError === null || entry.parseError === undefined || typeof entry.parseError === 'string') &&
    (entry.body === undefined || typeof entry.body === 'string') && isPreparedScopedInputMetadata(entry.fm);
}

export function prepareScopedSourceInputs(inputArtifacts) {
  // Preserve the previous CLI metadata preparation and its unusual-data
  // fallback. Do not validate an unused inventory or freeze caller objects.
  const inputs = inputArtifacts.map((entry) => copyInputEvidenceObservation(entry,
    { ...entry, fm: prepareScopedInputMetadata(entry.fm) }));
  if (Object.getPrototypeOf(inputs) !== Array.prototype) return inputs;
  for (let i = 0; i < inputs.length; i += 1) {
    if (!Object.hasOwn(inputs, i) || !immutableRecord(inputs[i])) return inputs;
  }
  inputs.forEach(Object.freeze);
  Object.freeze(inputs);
  collections.set(inputs, { catalog: { value: null }, seeds: null });
  return inputs;
}

export function observeScopedSourceInputReads(inputArtifacts) {
  const observed = observeInputEvidenceReads(inputArtifacts);
  const state = collections.get(inputArtifacts);
  if (state) {
    // The observer owns fresh copies and its own private callback. Only their
    // metadata/inventory calculation is the same as the frozen source list.
    observed.artifacts.forEach(Object.freeze);
    Object.freeze(observed.artifacts);
    collections.set(observed.artifacts, { catalog: state.catalog, seeds: null });
  }
  return observed;
}

function preparedRecord(entry) {
  const record = copyInputEvidenceObservation(entry,
    { ...entry, fm: cloneScopedSourceMetadata(entry.fm), body: undefined });
  scopedProjectionProgress('input-metadata');
  return record;
}

function catalog(seeds) {
  // Use the canonical duplicate-preserving index, but retain positions instead
  // of records: each observation scope/resolver must use its own record bodies.
  const positions = new Map(seeds.map((entry, i) => [entry, i]));
  const byId = new Map([...buildInputArtifactIndex(seeds).byId].map(([id, entries]) =>
    [id, Object.freeze(entries.map((entry) => positions.get(entry)))]));
  const validation = validateInputArtifacts(seeds);
  for (const entries of [validation.errors, validation.warnings]) {
    entries.forEach(Object.freeze);
    Object.freeze(entries);
  }
  Object.freeze(validation);
  stats.catalogs += 1;
  return { byId, validation };
}

export function createScopedSourceInputs(inputArtifacts) {
  const state = collections.get(inputArtifacts);
  if (!state) {
    // Standalone callers retain constructor-time cloning/getters/errors, fresh
    // validation and mutable inventory semantics, including unused records.
    const inputs = inputArtifacts.map(preparedRecord);
    return { inputs, index: buildInputArtifactIndex(inputs), validation: validateInputArtifacts(inputs) };
  }
  if (!state.seeds) {
    state.seeds = Object.freeze(inputArtifacts.map((entry) => {
      const record = Object.freeze(preparedRecord(entry));
      stats.records += 1;
      return record;
    }));
  }
  // The first source constructor keeps the previous validation error boundary.
  // Later constructors may reuse it only because the entire list is immutable.
  if (!state.catalog.value) state.catalog.value = catalog(state.seeds);
  else stats.catalogReuses += 1;
  const shared = state.catalog.value;
  const inputs = state.seeds.slice(), selected = new Map();
  const byId = { get(id) {
    if (!shared.byId.has(id)) return undefined;
    if (!selected.has(id)) selected.set(id, shared.byId.get(id).map((position) => {
      const seed = state.seeds[position];
      const copy = copyInputEvidenceObservation(seed, { ...seed });
      inputs[position] = copy;
      stats.selected += 1;
      scopedProjectionProgress('input-metadata');
      return copy;
    }));
    return selected.get(id);
  } };
  // Register validation receives the selected local body copies and immutable
  // unread seeds. Its own index/section caches and actual file reads stay fresh.
  return { inputs, index: { byId, sectionCache: new Map(), sectionDetailsCache: new Map() },
    validation: shared.validation };
}
