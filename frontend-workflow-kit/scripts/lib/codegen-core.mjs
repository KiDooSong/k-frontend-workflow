// scripts/lib/codegen-core.mjs - deterministic core for Tier2 codegen adapters.
//
// Boundary:
//   adapter = discovery/input normalization only.
//   core    = validation, sorting, output path naming, hook naming, rendering.
// No timestamps, no absolute machine-local paths, no adapter-owned writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CORE_CODEGEN_ADAPTER_VERSION = 1;

export const DEFAULT_CODEGEN_ROLES = {
  api_schema: 'src/api/schemas/**',
  api_client: 'src/api/**',
  hook: 'src/features/{domain}/hooks/**',
};

export const DEFAULT_CODEGEN_CONVENTIONS = {
  hookPrefix: 'use',
  querySuffix: 'Query',
  mutationSuffix: 'Mutation',
  clientOut: '{roles.api_client}',
  hookOut: '{roles.hook}',
  clientSubdir: 'generated',
  clientFileSuffix: '.client.ts',
  hookFileSuffix: '.ts',
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ADAPTERS_DIR = path.resolve(HERE, '..', 'adapters', 'codegens');
const QUERY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const METHOD_ORDER = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'];
const METHOD_RANK = new Map(METHOD_ORDER.map((m, i) => [m, i]));
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:/;
const UNC_ROOT = /^\/\//;
const OUTPUT_GLOB_META = /[*?\[\]{}]/;
const REQUIRED_CONVENTION_STRINGS = [
  'hookPrefix',
  'querySuffix',
  'mutationSuffix',
  'clientOut',
  'hookOut',
  'clientFileSuffix',
  'hookFileSuffix',
];

export class CodegenAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CodegenAdapterError';
  }
}

export class CodegenModelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CodegenModelError';
  }
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function readAdapterManifest(adaptersDir) {
  const p = path.join(adaptersDir, 'manifest.json');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    throw new CodegenAdapterError(`codegen adapter manifest not readable: ${p}`);
  }
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('manifest root must be an object');
    }
    return obj;
  } catch (e) {
    throw new CodegenAdapterError(`codegen adapter manifest JSON parse failed(${p}): ${e.message}`);
  }
}

function checkManifestEntry(id, entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.module !== 'string') {
    throw new CodegenAdapterError(`codegen adapter manifest entry is invalid: ${id}`);
  }
  if (entry.id !== id) {
    throw new CodegenAdapterError(`codegen adapter manifest id mismatch: key=${id}, id=${entry.id}`);
  }
  if (entry.version !== CORE_CODEGEN_ADAPTER_VERSION) {
    throw new CodegenAdapterError(
      `codegen adapter manifest version=${entry.version} is incompatible with core version ${CORE_CODEGEN_ADAPTER_VERSION}`,
    );
  }
  const compatible = entry.core && entry.core.compatibleVersion;
  if (compatible !== CORE_CODEGEN_ADAPTER_VERSION) {
    throw new CodegenAdapterError(
      `codegen adapter manifest core.compatibleVersion=${compatible} is incompatible with core version ${CORE_CODEGEN_ADAPTER_VERSION}`,
    );
  }
}

export async function loadCodegenAdapter(spec, opts = {}) {
  const adaptersDir = opts.adaptersDir || DEFAULT_ADAPTERS_DIR;
  let adapter;

  if (spec && typeof spec === 'object' && typeof spec.discover === 'function') {
    adapter = spec;
  } else {
    let modulePath;
    if (typeof spec === 'string') {
      const manifest = readAdapterManifest(adaptersDir);
      const entry = manifest[spec];
      if (entry) {
        checkManifestEntry(spec, entry);
        modulePath = path.resolve(adaptersDir, entry.module);
      } else {
        const candidate = path.isAbsolute(spec)
          ? spec
          : path.resolve(opts.baseDir || process.cwd(), spec);
        if (fs.existsSync(candidate)) {
          modulePath = candidate;
        } else {
          const known = Object.keys(manifest).sort(compareText).join(', ') || '(none)';
          throw new CodegenAdapterError(
            `unknown codegen adapter: '${spec}' (registered: ${known}; module file not found: ${candidate})`,
          );
        }
      }
    } else if (spec && typeof spec === 'object' && typeof spec.module === 'string') {
      modulePath = path.isAbsolute(spec.module)
        ? spec.module
        : path.resolve(opts.baseDir || process.cwd(), spec.module);
    } else {
      throw new CodegenAdapterError(
        `invalid codegen adapter spec: ${JSON.stringify(spec)} (expected name string | {module} | adapter object)`,
      );
    }

    if (!fs.existsSync(modulePath)) {
      throw new CodegenAdapterError(`codegen adapter module not found: ${modulePath}`);
    }
    let mod;
    try {
      mod = await import(pathToFileURL(modulePath).href);
    } catch (e) {
      throw new CodegenAdapterError(`codegen adapter load failed(${modulePath}): ${e.message}`);
    }
    adapter = mod.default || mod.adapter || mod;
  }

  if (!adapter || typeof adapter.discover !== 'function') {
    throw new CodegenAdapterError('codegen adapter must expose discover(ctx)');
  }
  if (adapter.version !== CORE_CODEGEN_ADAPTER_VERSION) {
    throw new CodegenAdapterError(
      `codegen adapter version=${adapter.version} is incompatible with core version ${CORE_CODEGEN_ADAPTER_VERSION}`,
    );
  }
  return adapter;
}

function normalizeSourceFiles(files) {
  if (!Array.isArray(files)) return [];
  return [...new Set(files.map((f) => {
    const sourceFile = normalizeRelativePath(String(f).replace(/\\/g, '/'), 'codegen source file');
    return sourceFile;
  }))].sort(compareText);
}

function mergeConfig(model, opts) {
  return {
    roles: { ...DEFAULT_CODEGEN_ROLES, ...(model.roles || {}), ...(opts.roles || {}) },
    conventions: {
      ...DEFAULT_CODEGEN_CONVENTIONS,
      ...(model.conventions || {}),
      ...(opts.conventions || {}),
    },
  };
}

function validateConventions(conventions) {
  for (const key of REQUIRED_CONVENTION_STRINGS) {
    const value = conventions[key];
    if (typeof value !== 'string' || !value) {
      throw new CodegenModelError(`codegen convention '${key}' must be a non-empty string`);
    }
    if (CONTROL_CHARS.test(value)) {
      throw new CodegenModelError(`codegen convention '${key}' must not contain control characters`);
    }
  }
  if (typeof conventions.clientSubdir !== 'string') {
    throw new CodegenModelError("codegen convention 'clientSubdir' must be a string");
  }
  if (CONTROL_CHARS.test(conventions.clientSubdir)) {
    throw new CodegenModelError("codegen convention 'clientSubdir' must not contain control characters");
  }
  if (hasDotDotSegment(conventions.clientSubdir) || isRootedPath(conventions.clientSubdir)) {
    throw new CodegenModelError("codegen convention 'clientSubdir' must be a relative subpath without '..'");
  }
  for (const key of ['clientFileSuffix', 'hookFileSuffix']) {
    if (/[\\/]/.test(conventions[key]) || hasDotDotSegment(conventions[key])) {
      throw new CodegenModelError(`codegen convention '${key}' must be a filename suffix, not a path`);
    }
  }
}

function operationLabel(op) {
  return `${op.method || '(missing method)'} ${op.path || '(missing path)'}`;
}

function normalizeMethod(method, index) {
  if (typeof method !== 'string' || !method.trim()) {
    throw new CodegenModelError(`operation[${index}] is missing method`);
  }
  const upper = method.trim().toUpperCase();
  if (!METHOD_RANK.has(upper)) {
    throw new CodegenModelError(`unsupported HTTP method '${method}' in operation[${index}]`);
  }
  return upper;
}

function normalizePath(routePath, index) {
  if (typeof routePath !== 'string' || !routePath.trim()) {
    throw new CodegenModelError(`operation[${index}] is missing path`);
  }
  const p = routePath.trim();
  if (!p.startsWith('/')) {
    throw new CodegenModelError(`operation[${index}] path must start with '/': ${p}`);
  }
  if (CONTROL_CHARS.test(p)) {
    throw new CodegenModelError(`operation[${index}] path must not contain control characters`);
  }
  return p;
}

function assertOperationId(operationId, label) {
  if (typeof operationId !== 'string' || !operationId.trim()) {
    throw new CodegenModelError(`operationId is missing for ${label}`);
  }
  const id = operationId.trim();
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(id)) {
    throw new CodegenModelError(
      `unsupported operationId '${operationId}' for ${label}: expected /^[A-Za-z][A-Za-z0-9]*$/`,
    );
  }
  return id;
}

function assertDomain(domain, label) {
  if (typeof domain !== 'string' || !domain.trim()) {
    throw new CodegenModelError(`domain is missing for ${label}`);
  }
  const d = domain.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(d)) {
    throw new CodegenModelError(
      `unsupported domain '${domain}' for ${label}: expected a relative path-safe segment`,
    );
  }
  return d;
}

function pascalCaseOperationId(operationId) {
  return operationId.charAt(0).toUpperCase() + operationId.slice(1);
}

export function buildHookName(operation, conventions = DEFAULT_CODEGEN_CONVENTIONS) {
  const kind = operation.kind || (QUERY_METHODS.has(operation.method) ? 'query' : 'mutation');
  const suffixKey = kind === 'query' ? 'querySuffix' : 'mutationSuffix';
  if (typeof conventions.hookPrefix !== 'string' || !conventions.hookPrefix) {
    throw new CodegenModelError("codegen convention 'hookPrefix' must be a non-empty string");
  }
  if (typeof conventions[suffixKey] !== 'string' || !conventions[suffixKey]) {
    throw new CodegenModelError(`codegen convention '${suffixKey}' must be a non-empty string`);
  }
  if (CONTROL_CHARS.test(conventions.hookPrefix) || CONTROL_CHARS.test(conventions[suffixKey])) {
    throw new CodegenModelError('codegen hook naming conventions must not contain control characters');
  }
  return `${conventions.hookPrefix}${pascalCaseOperationId(operation.operationId)}${conventions[suffixKey]}`;
}

function rolePattern(roles, role) {
  const value = roles[role];
  if (Array.isArray(value)) {
    if (value.length === 1 && typeof value[0] === 'string' && value[0]) {
      return value[0];
    }
    throw new CodegenModelError(`multi-glob output role unsupported: ${role}`);
  }
  if (typeof value !== 'string' || !value) {
    throw new CodegenModelError(`unknown role reference in codegen output pattern: ${role}`);
  }
  return value;
}

function resolveRoleRef(pattern, roles) {
  return String(pattern).replace(/\{roles\.([A-Za-z0-9_]+)\}/g, (_, role) => {
    return rolePattern(roles, role);
  });
}

function isRootedPath(p) {
  const raw = String(p).replace(/\\/g, '/');
  return path.posix.isAbsolute(raw) || WINDOWS_ABSOLUTE.test(raw) || UNC_ROOT.test(raw);
}

function hasDotDotSegment(p) {
  return String(p).replace(/\\/g, '/').split('/').includes('..');
}

function normalizeRelativePath(p, label) {
  const raw = String(p).replace(/\\/g, '/');
  if (CONTROL_CHARS.test(raw)) {
    throw new CodegenModelError(`${label} must not contain control characters: ${p}`);
  }
  if (WINDOWS_ABSOLUTE.test(raw) || UNC_ROOT.test(raw)) {
    throw new CodegenModelError(`${label} must stay relative and in-repo: ${p}`);
  }
  const normalized = path.posix.normalize(raw);
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new CodegenModelError(`${label} must stay relative and in-repo: ${p}`);
  }
  return normalized.replace(/^\.\//, '');
}

function normalizeRelativeOut(p) {
  return normalizeRelativePath(p, 'codegen output path');
}

function outputRootFromPattern(pattern) {
  const p = String(pattern).replace(/\\/g, '/');
  let root;
  const globIndex = p.indexOf('**');
  if (globIndex !== -1) {
    root = p.slice(0, globIndex);
  } else if (p.endsWith('/')) {
    root = p;
  } else if (!path.posix.extname(p)) {
    root = p;
  } else {
    root = path.posix.dirname(p);
  }
  root = root.replace(/\/+$/, '');
  if (!root || root === '.') return '';
  return normalizeRelativeOut(root);
}

function assertSupportedOutputPattern(pattern) {
  const parts = String(pattern).replace(/\\/g, '/').split('/');
  let globstarCount = 0;
  for (const [index, part] of parts.entries()) {
    if (part === '**') {
      globstarCount += 1;
      if (index !== parts.length - 1) {
        throw new CodegenModelError(
          `codegen output pattern supports only one terminal '**' segment: ${pattern}`,
        );
      }
      continue;
    }
    if (OUTPUT_GLOB_META.test(part)) {
      throw new CodegenModelError(
        `codegen output pattern must not contain unsupported glob metacharacters: ${pattern}`,
      );
    }
  }
  if (globstarCount > 1) {
    throw new CodegenModelError(
      `codegen output pattern supports only one terminal '**' segment: ${pattern}`,
    );
  }
}

function assertConcreteOutputPath(out) {
  if (OUTPUT_GLOB_META.test(out)) {
    throw new CodegenModelError(
      `codegen output path must be a concrete file path without glob metacharacters: ${out}`,
    );
  }
}

function assertUnderOutputRoot(out, root) {
  if (!root) return;
  if (out !== root && !out.startsWith(root + '/')) {
    throw new CodegenModelError(`codegen output path escaped role root '${root}': ${out}`);
  }
}

function expandOutPattern(pattern, roles, domain, leaf) {
  const resolvedPattern = resolveRoleRef(pattern, roles).replace(/\{domain\}/g, domain).replace(/\\/g, '/');
  if (hasDotDotSegment(resolvedPattern) || isRootedPath(resolvedPattern)) {
    throw new CodegenModelError(
      `codegen output path must stay relative and in-repo; output pattern must not contain '..': ${resolvedPattern}`,
    );
  }
  assertSupportedOutputPattern(resolvedPattern);
  const root = outputRootFromPattern(resolvedPattern);
  let p = resolvedPattern;
  if (p.includes('**')) {
    p = p.replace('**', leaf);
  } else if (p.endsWith('/')) {
    p = p + leaf;
  } else if (!path.posix.extname(p)) {
    p = path.posix.join(p, leaf);
  }
  const out = normalizeRelativeOut(p);
  assertConcreteOutputPath(out);
  assertUnderOutputRoot(out, root);
  return out;
}

function makeClientLeaf(operationId, conventions) {
  const parts = [];
  if (conventions.clientSubdir) parts.push(conventions.clientSubdir);
  parts.push(`${operationId}${conventions.clientFileSuffix}`);
  return path.posix.join(...parts);
}

function compareOperations(a, b) {
  const byPath = compareText(a.path, b.path);
  if (byPath) return byPath;
  const byMethod = (METHOD_RANK.get(a.method) ?? 99) - (METHOD_RANK.get(b.method) ?? 99);
  if (byMethod) return byMethod;
  return compareText(a.operationId, b.operationId);
}

function checkUnique(map, key, label, op) {
  const prev = map.get(key);
  if (prev) {
    throw new CodegenModelError(`${label} collision '${key}' between ${prev} and ${operationLabel(op)}`);
  }
  map.set(key, operationLabel(op));
}

function normalizeHeaderField(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CodegenModelError(`codegen ${label} header must be a non-empty string`);
  }
  const text = value.trim();
  if (CONTROL_CHARS.test(text)) {
    throw new CodegenModelError(`codegen ${label} header must not contain control characters`);
  }
  if (label === 'source') {
    return normalizeRelativePath(text, 'codegen source header');
  }
  if (isRootedPath(text)) {
    throw new CodegenModelError(`codegen ${label} header must stay relative and in-repo: ${value}`);
  }
  return text;
}

export function normalizeCodegenModel(model, opts = {}) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    throw new CodegenModelError('CodegenModel must be an object');
  }
  if (!Array.isArray(model.operations)) {
    throw new CodegenModelError('CodegenModel.operations must be an array');
  }

  const { roles, conventions } = mergeConfig(model, opts);
  validateConventions(conventions);
  const operations = model.operations.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new CodegenModelError(`operation[${index}] must be an object`);
    }
    const method = normalizeMethod(raw.method, index);
    const routePath = normalizePath(raw.path, index);
    const base = { method, path: routePath };
    const label = operationLabel(base);
    const operationId = assertOperationId(raw.operationId, label);
    const domain = assertDomain(raw.domain, label);
    const kind = QUERY_METHODS.has(method) ? 'query' : 'mutation';
    const hookName = buildHookName({ method, operationId, kind }, conventions);
    const clientOut = expandOutPattern(
      conventions.clientOut,
      roles,
      domain,
      makeClientLeaf(operationId, conventions),
    );
    const hookOut = expandOutPattern(
      conventions.hookOut,
      roles,
      domain,
      `${hookName}${conventions.hookFileSuffix}`,
    );

    return {
      method,
      path: routePath,
      operationId,
      domain,
      kind,
      clientOut,
      hookName,
      hookOut,
    };
  }).sort(compareOperations);

  const endpointKeys = new Map();
  const hookNames = new Map();
  const hookOuts = new Map();
  const clientOuts = new Map();
  for (const op of operations) {
    checkUnique(endpointKeys, `${op.method} ${op.path}`, 'endpoint', op);
    checkUnique(hookNames, op.hookName, 'hook name', op);
    checkUnique(hookOuts, op.hookOut, 'hook output path', op);
    checkUnique(clientOuts, op.clientOut, 'client output path', op);
  }

  return {
    adapter: normalizeHeaderField(model.adapter || model.name || 'unknown', 'adapter'),
    version: model.version ?? null,
    source: normalizeHeaderField(opts.source || model.source || rolePattern(roles, 'api_schema'), 'source'),
    sourceFiles: normalizeSourceFiles(model.sourceFiles),
    roles,
    conventions,
    operations,
  };
}

export function renderCodegenManifest(model, opts = {}) {
  const normalized = normalizeCodegenModel(model, opts);
  const out = [];
  out.push('# GENERATED FILE - DO NOT EDIT');
  out.push('# Source: ' + normalized.source);
  out.push('# Adapter: ' + normalized.adapter);
  out.push('# Core: codegen-core@' + CORE_CODEGEN_ADAPTER_VERSION);
  if (normalized.sourceFiles.length) {
    out.push('# Source Files: ' + normalized.sourceFiles.join(', '));
  }
  out.push('');
  out.push('operations:');
  for (const op of normalized.operations) {
    out.push(`- ${op.method} ${op.path}`);
    out.push(`  operationId: ${op.operationId}`);
    out.push(`  domain: ${op.domain}`);
    out.push(`  kind: ${op.kind}`);
    out.push(`  clientOut: ${op.clientOut}`);
    out.push(`  hookName: ${op.hookName}`);
    out.push(`  hookOut: ${op.hookOut}`);
  }
  return out.join('\n') + '\n';
}
