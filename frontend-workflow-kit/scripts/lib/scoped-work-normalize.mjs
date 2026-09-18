// R1 serialization primitives, NOT a scope-basis builder or permission evaluator.
// Callers must first validate schemas and resolve the complete B §5.4 graph.
// Only explicit set fields use scopeSet; cell/body order is never guessed away.

const bytes = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const fail = (message) => { throw new TypeError(`SW-NORMALIZE: ${message}`); };

function unicode(value) {
  // A lone surrogate has no unique UTF-8 byte identity. Do not let replacement
  // characters collapse distinct keys when applying the specified byte order.
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('unpaired Unicode surrogate');
    } else if (code >= 0xdc00 && code <= 0xdfff) fail('unpaired Unicode surrogate');
  }
  return value;
}

export function scopeJson(value) {
  const active = new Set();
  function encode(current) {
    if (current === null) return 'null';
    if (typeof current === 'string') return JSON.stringify(unicode(current));
    if (typeof current === 'boolean') return current ? 'true' : 'false';
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) fail('non-finite number');
      return JSON.stringify(current);
    }
    if (typeof current !== 'object') fail('non-JSON value');
    if (active.has(current)) fail('cyclic object; index reference cycles before serialization');
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      fail('plain JSON object or array required');
    }
    if (Object.getOwnPropertySymbols(current).length) fail('symbol key');
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Object.keys(descriptors);
    for (const key of keys) {
      unicode(key);
      const field = descriptors[key];
      if (!Object.hasOwn(field, 'value') || (!field.enumerable && !(array && key === 'length'))) {
        fail('accessors and hidden properties are not JSON data');
      }
    }
    active.add(current);
    try {
      if (array) {
        const length = descriptors.length.value;
        if (keys.length !== length + 1) fail('sparse array or extra array property');
        const parts = [];
        for (let index = 0; index < length; index += 1) {
          if (!Object.hasOwn(descriptors, String(index))) fail('sparse array');
          parts.push(encode(descriptors[index].value));
        }
        return `[${parts.join(',')}]`;
      }
      // Do not build a sorted JS object then JSON.stringify it: integer-index
      // keys would be enumerated numerically again ("2" before "10").
      return `{${keys.sort(bytes).map((key) => `${JSON.stringify(key)}:${encode(descriptors[key].value)}`).join(',')}}`;
    } finally {
      active.delete(current); // Repeated non-cyclic aliases are ordinary JSON.
    }
  }
  return encode(value);
}

export function scopeSet(values, label = 'scope set') {
  if (!Array.isArray(values)) fail(`${label}: array required`);
  scopeJson(values); // Reject holes/accessors/extra properties before mapping.
  const entries = values.map((value) => scopeJson(value));
  if (new Set(entries).size !== entries.length) fail(`${label}: duplicate normalized member`);
  return entries.sort(bytes).map((entry) => JSON.parse(entry));
}

export function scopeLf(value) {
  if (typeof value !== 'string') fail('selected content must be text');
  return unicode(value).replace(/\r\n|\r/g, '\n');
}
