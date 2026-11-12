// Reuse YAML decoding only. Callers still read current bytes and validate the
// returned metadata; no path, document body, or validation result is cached.
import { serialize, deserialize } from 'node:v8';
import { parse as yamlParse, parseDocument, isAlias, isMap, isScalar, isSeq } from 'yaml';

const primitive = (value) => value === null || ['string', 'boolean', 'number'].includes(typeof value);

function plainSyntax(document) {
  // Unusual YAML stays on the original public parser path, including its
  // diagnostics. In particular toJS() can warn about collection-valued keys
  // even when document.warnings is empty.
  if (document.errors.length || document.warnings.length || document.directives?.docStart ||
      document.directives?.yaml.explicit || document.directives?.yaml.version !== '1.2') return false;
  const pending = [document.contents];
  while (pending.length) {
    const node = pending.pop();
    if (node == null) continue;
    if (node.tag !== undefined || node.anchor !== undefined || isAlias(node)) return false;
    if (isScalar(node)) {
      if (!primitive(node.value)) return false;
    } else if (isMap(node)) {
      for (const pair of node.items) {
        if (pair.key !== null && (!isScalar(pair.key) || !primitive(pair.key.value))) return false;
        pending.push(pair.key, pair.value);
      }
    } else if (isSeq(node)) {
      for (const item of node.items) pending.push(item);
    } else return false;
  }
  return true;
}

export function createFrontmatterParser({ maxBytes = 4 * 1024 * 1024, maxEntries = 2048 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 0) {
    throw new RangeError('frontmatter cache limits must be non-negative safe integers');
  }
  const entries = new Map();
  let bytes = 0;
  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return;
    bytes -= entry.bytes;
    entries.delete(key);
  }
  return function parseFrontmatter(source) {
    if (typeof source !== 'string' || !maxBytes || !maxEntries || source.length > maxBytes / 2) return yamlParse(source);
    const cached = entries.get(source);
    if (cached) {
      // Keep the detached stored key, not the lookup substring, on an LRU hit.
      entries.delete(source);
      entries.set(cached.key, cached);
      if (cached.reparse) return yamlParse(source);
      try { return deserialize(cached.value); }
      catch { remove(cached.key); }
    }
    const document = parseDocument(source);
    const reparse = !plainSyntax(document);
    let value, encoded;
    if (!reparse) {
      value = document.toJS();
      try { encoded = serialize(value); }
      catch { return value; }
    }
    // Bound retained UTF-16 key bytes and encoded payload, not total RSS or
    // transient parser allocations/Map bookkeeping (entry count is bounded too).
    // A fallback marker retains only the key, never a parsed value/diagnostic.
    const size = source.length * 2 + (reparse ? 0 : encoded.length);
    // A large result does not displace already useful entries.
    if (size > maxBytes) return value;
    // A regex capture can keep an entire Markdown source alive. Copy only the
    // YAML UTF-16 code units, including lone surrogates, before retaining a key.
    const key = Buffer.from(source, 'utf16le').toString('utf16le');
    while (entries.size >= maxEntries || bytes + size > maxBytes) remove(entries.keys().next().value);
    entries.set(key, reparse ? { key, reparse: true, bytes: size } : { key, value: encoded, bytes: size });
    bytes += size;
    // Remember the parser route before calling it, so repeated warnings/errors
    // still come from yamlParse without repeating the eligibility parse too.
    return reparse ? yamlParse(source) : value;
  };
}
