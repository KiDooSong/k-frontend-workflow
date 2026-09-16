// Inactive D syntax substrate. Public execution still uses normalizeWorkRequest
// (current only). Never route a request to authority from this parser's success.
import {
  CurrentWorkError, own, byteCompare, canonicalJson,
  normalizeWorkOrigins, normalizeWorkTargets, normalizeWorkRequest,
} from './current-work-request.mjs';
import { ownerParts } from './current-work-request.mjs';
import { requireGitRepositoryPath } from './visual-refresh-git-objects.mjs';

export class ScopedWorkContractError extends CurrentWorkError {
  constructor(message) { super(message); this.name = 'ScopedWorkContractError'; }
}
export function workObject(value, required, optional, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new ScopedWorkContractError(`${label}: object required`);
  }
  for (const key of Object.keys(value)) {
    if (![...required, ...optional].includes(key)) throw new ScopedWorkContractError(`${label}: unknown field ${key}`);
    if (value[key] === null || value[key] === undefined) throw new ScopedWorkContractError(`${label}: null/undefined ${key}`);
  }
  for (const key of required) if (!own(value, key)) throw new ScopedWorkContractError(`${label}: missing ${key}`);
}
export function workText(value, label) {
  if (typeof value !== 'string' || !value || value.trim() !== value ||
      /[\x00-\x1f\x7f]/.test(value) || Buffer.from(value).toString('utf8') !== value) {
    throw new ScopedWorkContractError(`${label}: nonempty canonical UTF-8 string required`);
  }
  return value;
}
export function workUnitId(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new ScopedWorkContractError('unit: expected [a-z][a-z0-9-]*');
  }
  return value;
}
export function workSet(value, parse, label, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && !value.length)) {
    throw new ScopedWorkContractError(`${label}: ${nonempty ? 'nonempty ' : ''}array required`);
  }
  const entries = Array.from(value, (entry) => parse(entry));
  const keys = entries.map(canonicalJson);
  if (new Set(keys).size !== entries.length) throw new ScopedWorkContractError(`${label}: duplicate selector`);
  return entries.sort((a, b) => byteCompare(canonicalJson(a), canonicalJson(b)));
}
export function workPath(value, label = 'work path') {
  workText(value, label);
  return requireGitRepositoryPath(value, label);
}
export function workVersion(value, label) {
  if (value !== 1) throw new ScopedWorkContractError(`${label}: version must be integer 1`);
}

// An owner can have several distinct scoped units. Keep every responsibility for
// shared paths; do not union them into one owner's permission or drop origins.
// This is not used by preflight, packet, run, report, or the Git backstop yet.
export function normalizeScopedWorkRequestSyntax(value) {
  workObject(value, ['version', 'origin_inputs', 'requests'], [], 'work request');
  workVersion(value.version, 'work request');
  const origins = normalizeWorkOrigins(value.origin_inputs);
  const requests = workSet(value.requests, (request) => {
    if (request?.authority === 'current') {
      return normalizeWorkRequest({ version: 1, origin_inputs: [], requests: [request] }).requests[0];
    }
    workObject(request, ['owner', 'authority', 'unit', 'targets'], ['coverage_reports'], 'scoped request');
    if (request.authority !== 'scoped') throw new ScopedWorkContractError('request: unknown authority');
    ownerParts(request.owner);
    const unit = workUnitId(request.unit);
    const targets = normalizeWorkTargets(request.targets);
    if (targets.some((target) => !['A', 'M'].includes(target.change))) {
      throw new ScopedWorkContractError('scoped target.change: regular file A/M only; actual Git validation is still required');
    }
    const reports = own(request, 'coverage_reports')
      ? workSet(request.coverage_reports, (p) => workPath(p, 'coverage report'), 'coverage_reports') : [];
    return { owner: request.owner, authority: 'scoped', unit, coverage_reports: reports, targets };
  }, 'requests', true);
  const identities = new Set();
  const authorities = new Map();
  const changes = new Map();
  for (const request of requests) {
    const key = canonicalJson([request.owner, request.authority, request.unit ?? null]);
    if (identities.has(key)) throw new ScopedWorkContractError('requests: duplicate owner/unit selector');
    identities.add(key);
    if (authorities.has(request.owner) && authorities.get(request.owner) !== request.authority) {
      throw new ScopedWorkContractError('requests: current and scoped cannot select the same owner');
    }
    authorities.set(request.owner, request.authority);
    for (const target of request.targets) {
      if (changes.has(target.path) && changes.get(target.path) !== target.change) {
        throw new ScopedWorkContractError('shared target: conflicting planned changes');
      }
      changes.set(target.path, target.change);
    }
  }
  // Preserve C's existing request order when the entire document is current.
  requests.sort((a, b) => byteCompare(a.owner, b.owner) || byteCompare(a.unit ?? '', b.unit ?? ''));
  return { version: 1, origin_inputs: origins, requests };
}
