// Private syntax retention, never a cache of file validity or authority. Source
// length alone does not bound a dense Markdown AST: each short bullet/cell owns
// several nodes, positions and derived indexes. Bound all three dimensions.
// These are structural budgets, not an estimate of V8 heap or a process limit.
export function createSyntaxCache({ maxSourceChars = 8 * 1024 * 1024,
  maxNodes = 262144, maxEntries = 512 } = {}) {
  if (![maxSourceChars, maxNodes, maxEntries].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError('syntax cache limits must be positive safe integers');
  }
  const entries = new Map();
  let sourceChars = 0, nodes = 0, evictions = 0, oversized = 0;
  const remove = (key) => {
    const entry = entries.get(key);
    sourceChars -= entry.sourceChars; nodes -= entry.nodes; entries.delete(key);
  };
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key); entries.set(key, entry);
      return entry.value;
    },
    set(key, value, { sourceChars: chars = key.length, nodes: count = 0 } = {}) {
      if (typeof key !== 'string' || ![chars, count].every((number) => Number.isSafeInteger(number) && number >= 0) || chars < key.length) {
        throw new TypeError('syntax cache requires a string key and nonnegative source/node counts');
      }
      if (entries.has(key)) remove(key);
      // Do not keep a single oversized tree or flush useful smaller entries for
      // it. Its caller can use the fresh result without extending its lifetime.
      if (chars > maxSourceChars || count > maxNodes) { oversized += 1; return; }
      while (entries.size >= maxEntries || sourceChars + chars > maxSourceChars || nodes + count > maxNodes) {
        remove(entries.keys().next().value); evictions += 1;
      }
      entries.set(key, { value, sourceChars: chars, nodes: count });
      sourceChars += chars; nodes += count;
    },
    stats() {
      return { entries: entries.size, source_chars: sourceChars, nodes, evictions, oversized,
        max_source_chars: maxSourceChars, max_nodes: maxNodes, max_entries: maxEntries };
    },
  };
}
