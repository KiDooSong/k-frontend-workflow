// Current work requests are selectors, never caller-supplied authority.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';
import { INPUT_ID_PATTERN } from './input-artifact.mjs';
import { parseInputEvidenceRef } from './provenance.mjs';
import { requireGitRepositoryPath, decodeGitUtf8 } from './visual-refresh-git-objects.mjs';

export class CurrentWorkError extends Error {
  constructor(message) { super(message); this.name = 'CurrentWorkError'; }
}
export const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
export const byteCompare = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export const hashBytes = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export function canonicalJson(value) {
  function sort(v) {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v)
      .filter((key) => v[key] !== undefined).sort(byteCompare).map((key) => [key, sort(v[key])]));
    return v;
  }
  return JSON.stringify(sort(value));
}
export const digest = (value) => hashBytes(canonicalJson(value));
export function strictJson(raw, label = 'JSON') {
  let value;
  try {
    value = JSON.parse(raw); // First require actual JSON, not the YAML superset.
    const doc = parseDocument(raw, { uniqueKeys: true, strict: true });
    if (doc.errors.length) throw new Error(doc.errors.map((e) => e.message).join('; '));
  } catch (error) { throw new CurrentWorkError(`${label}: ${error.message}`); }
  return value;
}
export function readJson(file, label = 'JSON') {
  const size = fs.statSync(file).size;
  if (size > 16 * 1024 * 1024) throw new CurrentWorkError(`${label}: exceeds 16 MiB input limit`);
  const raw = fs.readFileSync(file);
  return { raw, value: strictJson(decodeGitUtf8(raw, label), label) };
}
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CurrentWorkError(`${label}: object required`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new CurrentWorkError(`${label}: unknown field ${key}`);
  for (const key of keys) if (!own(value, key) || value[key] === null) throw new CurrentWorkError(`${label}: missing/null ${key}`);
}
function array(value, label, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && !value.length)) throw new CurrentWorkError(`${label}: ${nonempty ? 'nonempty ' : ''}array required`);
}
function unique(values, label) {
  const keys = values.map((v) => typeof v === 'string' ? v : canonicalJson(v));
  if (new Set(keys).size !== keys.length) throw new CurrentWorkError(`${label}: duplicate selector`);
}
export function ownerParts(owner) {
  if (typeof owner !== 'string' || !/^(screen|surface):[A-Za-z0-9][A-Za-z0-9_-]*$/.test(owner)) {
    throw new CurrentWorkError('owner: canonical screen:<ID> or surface:<ID> required');
  }
  const i = owner.indexOf(':');
  return { kind: owner.slice(0, i), id: owner.slice(i + 1) };
}
export function normalizeWorkRequest(value) {
  object(value, ['version', 'origin_inputs', 'requests'], 'work request');
  if (value.version !== 1) throw new CurrentWorkError('work request: version must be integer 1');
  array(value.origin_inputs, 'origin_inputs');
  array(value.requests, 'requests', true);
  const origins = value.origin_inputs.map((origin) => {
    object(origin, ['input_id', 'source_refs'], 'origin');
    if (typeof origin.input_id !== 'string' || !INPUT_ID_PATTERN.test(origin.input_id)) throw new CurrentWorkError('origin: invalid canonical input_id');
    array(origin.source_refs, 'origin.source_refs');
    const refs = origin.source_refs.map((token) => {
      const ref = typeof token === 'string' && parseInputEvidenceRef(token);
      if (!ref || ref.inputId !== origin.input_id || token.trim() !== token) throw new CurrentWorkError('origin: invalid or other-input source ref');
      // /1 and /01 select the same bullet. Do not let spelling hide a duplicate.
      return `input:${ref.inputId}#${ref.section}${ref.bulletIndex === null ? '' : '/' + String(ref.bulletIndex).padStart(2, '0')}`;
    });
    unique(refs, 'origin.source_refs');
    return { input_id: origin.input_id, source_refs: refs.sort(byteCompare) };
  });
  unique(origins.map((o) => o.input_id), 'origin_inputs');
  const requests = value.requests.map((request) => {
    if (request?.authority !== 'current') throw new CurrentWorkError('C supports authority:current only; scoped is not implemented');
    object(request, ['owner', 'authority', 'requested_mode', 'targets'], 'current request');
    ownerParts(request.owner);
    if (typeof request.requested_mode !== 'string' || !request.requested_mode || request.requested_mode.trim() !== request.requested_mode) {
      throw new CurrentWorkError('requested_mode: nonempty canonical string required');
    }
    array(request.targets, 'targets', true);
    const targets = request.targets.map((target) => {
      object(target, ['path', 'change'], 'target');
      requireGitRepositoryPath(target.path, 'work target');
      if (target.path.trim() !== target.path) throw new CurrentWorkError('work target: surrounding whitespace forbidden');
      if (!['A', 'M', 'D', 'R', 'C', 'T'].includes(target.change)) throw new CurrentWorkError('target.change: expected A/M/D/R/C/T');
      return { path: target.path, change: target.change };
    });
    unique(targets.map((t) => t.path), 'targets');
    return { owner: request.owner, authority: 'current', requested_mode: request.requested_mode,
      targets: targets.sort((a, b) => byteCompare(a.path, b.path)) };
  });
  unique(requests.map((r) => r.owner), 'requests.owner');
  const changes = new Map();
  for (const request of requests) for (const target of request.targets) {
    if (changes.has(target.path) && changes.get(target.path) !== target.change) throw new CurrentWorkError('shared target: conflicting planned changes');
    changes.set(target.path, target.change);
  }
  return { version: 1, origin_inputs: origins.sort((a, b) => byteCompare(a.input_id, b.input_id)),
    requests: requests.sort((a, b) => byteCompare(a.owner, b.owner)) };
}
