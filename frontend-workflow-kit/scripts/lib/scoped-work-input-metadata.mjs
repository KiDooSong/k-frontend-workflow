// Private metadata preparation for a CLI-owned input collection. This shares
// neither input records/body caches nor validation results or file observations.
import { types } from 'node:util';

const prepared = new WeakSet();
const stats = { prepared: 0, fallbacks: 0, cloned: 0, reused: 0 };

// Read-only process diagnostics. Preparation clones are counted separately from
// the legacy per-source-resolver clones that remain for ordinary caller values.
export function scopedInputMetadataStats() {
  return { ...stats };
}

// Inspect descriptors without consuming getters. Only ordinary JSON data can
// become a shared immutable value; unusual YAML/caller values keep their old
// structuredClone path. The explicit stack preserves DAG aliases, rejects
// cycles, and does not add a recursive depth limit ahead of that original path.
function plainDataGraph(root) {
  const active = new Set(), seen = new Set();
  const pending = [{ value: root, exit: false }];
  while (pending.length) {
    const { value, exit } = pending.pop();
    if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))) continue;
    if (typeof value !== 'object' || types.isProxy(value)) return false;
    if (exit) { active.delete(value); seen.add(value); continue; }
    if (active.has(value)) return false;
    if (seen.has(value)) continue;
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) return false;
    const length = array ? descriptors.length.value : 0;
    if (array && keys.length !== length + 1) return false;
    const children = [];
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return false;
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)) return false;
      children.push(descriptor.value);
    }
    active.add(value);
    pending.push({ value, exit: true });
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push({ value: children[index], exit: false });
  }
  return true;
}

function freezeData(root) {
  const seen = new Set(), pending = [root];
  while (pending.length) {
    const value = pending.pop();
    if (value === null || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) pending.push(child);
  }
  return root;
}

export function prepareScopedInputMetadata(value) {
  // Preparation is optional. A value that cannot be prepared must still reach
  // its original constructor-time clone/validation, not fail while collecting
  // an unused input or an ownerless report. Never freeze the caller's object.
  try {
    if (value !== null && typeof value === 'object' && plainDataGraph(value)) {
      const copy = freezeData(structuredClone(value));
      prepared.add(copy);
      stats.prepared += 1;
      return copy;
    }
  } catch { /* Preserve the original source-resolver path and its error timing. */ }
  stats.fallbacks += 1;
  return value;
}

export function cloneScopedSourceMetadata(value) {
  // A caller-frozen object is not proof: only our own detached, deeply frozen
  // data is shared. Capture the argument once, as structuredClone did before.
  if (prepared.has(value)) {
    stats.reused += 1;
    return value;
  }
  stats.cloned += 1;
  return structuredClone(value);
}
