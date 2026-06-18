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
const OPERATION_ID = /^[A-Za-z][A-Za-z0-9]*$/;
const TS_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PATH_PARAM = /\{([^}]+)\}/g;
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
  if (!OPERATION_ID.test(id)) {
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

function assertTsIdentifier(value, label) {
  if (typeof value !== 'string' || !TS_IDENTIFIER.test(value)) {
    throw new CodegenModelError(`codegen ${label} must be a TypeScript identifier: ${value}`);
  }
  return value;
}

function stringLiteral(value) {
  return JSON.stringify(String(value));
}

function typeName(identifier, suffix = '') {
  return `${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}${suffix}`;
}

function extractPathParams(routePath) {
  const stripped = routePath.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, '');
  if (/[{}]/.test(stripped)) {
    throw new CodegenModelError(
      `unsupported path parameter syntax for ${routePath}: expected {TypeScriptIdentifier}`,
    );
  }
  const params = [];
  for (const match of routePath.matchAll(PATH_PARAM)) {
    const name = assertTsIdentifier(match[1], `path parameter for ${routePath}`);
    if (!params.includes(name)) params.push(name);
  }
  return params;
}

function renderPathExpression(routePath, params) {
  if (!params.length) return stringLiteral(routePath);

  const parts = [];
  let last = 0;
  for (const match of routePath.matchAll(PATH_PARAM)) {
    const raw = match[0];
    const name = match[1];
    const index = match.index ?? 0;
    if (index > last) parts.push(stringLiteral(routePath.slice(last, index)));
    parts.push(`encodePathParam(pathParams.${name})`);
    last = index + raw.length;
  }
  if (last < routePath.length) parts.push(stringLiteral(routePath.slice(last)));
  return parts.join(' + ');
}

function normalizedRenderableOperation(operation) {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    throw new CodegenModelError('codegen render operation must be an object');
  }
  const method = normalizeMethod(operation.method, 'render');
  const routePath = normalizePath(operation.path, 'render');
  const base = { method, path: routePath };
  const label = operationLabel(base);
  const operationId = assertOperationId(operation.operationId, label);
  const domain = assertDomain(operation.domain, label);
  const hookName = assertTsIdentifier(operation.hookName, `hookName for ${label}`);
  const clientOut = normalizeRelativeOut(operation.clientOut);
  const hookOut = normalizeRelativeOut(operation.hookOut);
  const kind = operation.kind || (QUERY_METHODS.has(method) ? 'query' : 'mutation');
  if (kind !== 'query' && kind !== 'mutation') {
    throw new CodegenModelError(`unsupported codegen operation kind '${kind}' for ${label}`);
  }
  return { method, path: routePath, operationId, domain, kind, hookName, clientOut, hookOut };
}

function renderGeneratedHeader(op) {
  return [
    '// GENERATED FILE - DO NOT EDIT',
    `// Operation: ${op.operationId}`,
    `// Method: ${op.method}`,
    `// Path: ${op.path}`,
    `// Domain: ${op.domain}`,
    `// Hook: ${op.hookName}`,
    `// Client Output: ${op.clientOut}`,
    `// Hook Output: ${op.hookOut}`,
    '',
  ];
}

function relativeImport(fromOut, toOut) {
  const fromDir = path.posix.dirname(fromOut);
  let rel = path.posix.relative(fromDir, toOut).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel.replace(/\.(?:[cm]?tsx?)$/, '');
}

export function renderCodegenClientFile(operation) {
  const op = normalizedRenderableOperation(operation);
  const params = extractPathParams(op.path);
  const pascal = typeName(op.operationId);
  const pathParamsType = `${pascal}PathParams`;
  const optionsType = `${pascal}ClientOptions`;
  const pathFn = `${op.operationId}Path`;
  const clientFn = `${op.operationId}Client`;
  const out = renderGeneratedHeader(op);

  if (params.length) {
    out.push(`export type ${pathParamsType} = {`);
    for (const param of params) out.push(`  ${param}: string | number;`);
    out.push('};');
    out.push('');
    out.push('function encodePathParam(value: string | number): string {');
    out.push('  return encodeURIComponent(String(value));');
    out.push('}');
    out.push('');
    out.push(`export function ${pathFn}(pathParams: ${pathParamsType}): string {`);
    out.push(`  return ${renderPathExpression(op.path, params)};`);
    out.push('}');
  } else {
    out.push(`export function ${pathFn}(): string {`);
    out.push(`  return ${stringLiteral(op.path)};`);
    out.push('}');
  }
  out.push('');
  out.push(`export type ${optionsType} = {`);
  if (params.length) out.push(`  pathParams: ${pathParamsType};`);
  out.push('  baseUrl?: string;');
  out.push('  fetch?: typeof fetch;');
  out.push('  init?: RequestInit;');
  out.push('};');
  out.push('');
  const optionsParam = params.length ? `options: ${optionsType}` : `options: ${optionsType} = {}`;
  out.push(`export async function ${clientFn}(${optionsParam}): Promise<unknown> {`);
  out.push('  const fetcher = options.fetch ?? fetch;');
  const pathCall = params.length ? `${pathFn}(options.pathParams)` : `${pathFn}()`;
  out.push(`  const url = (options.baseUrl ?? '') + ${pathCall};`);
  out.push('  const response = await fetcher(url, {');
  out.push('    ...(options.init ?? {}),');
  out.push(`    method: ${stringLiteral(op.method)},`);
  out.push('  });');
  out.push('  if (!response.ok) {');
  out.push(`    throw new Error(${stringLiteral(`${op.method} ${op.path} failed with `)} + response.status);`);
  out.push('  }');
  out.push('  const text = await response.text();');
  out.push('  return text ? JSON.parse(text) : undefined;');
  out.push('}');
  return out.join('\n') + '\n';
}

export function renderCodegenHookFile(operation) {
  const op = normalizedRenderableOperation(operation);
  const params = extractPathParams(op.path);
  const pascal = typeName(op.operationId);
  const clientFn = `${op.operationId}Client`;
  const clientOptionsType = `${pascal}ClientOptions`;
  const hookOptionsType = typeName(op.hookName, 'Options');
  const importPath = relativeImport(op.hookOut, op.clientOut);
  const out = renderGeneratedHeader(op);

  out.push('import {');
  out.push(`  ${clientFn},`);
  out.push(`  type ${clientOptionsType},`);
  out.push(`} from ${stringLiteral(importPath)};`);
  out.push('');
  out.push(`export type ${hookOptionsType} = ${clientOptionsType};`);
  out.push('');
  if (op.kind === 'query') {
    const optionsParam = params.length
      ? `options: ${hookOptionsType}`
      : `options: ${hookOptionsType} = {}`;
    out.push(`export function ${op.hookName}(${optionsParam}) {`);
    out.push('  return {');
    out.push(`    operationId: ${stringLiteral(op.operationId)},`);
    out.push(`    domain: ${stringLiteral(op.domain)},`);
    out.push(`    method: ${stringLiteral(op.method)},`);
    out.push(`    path: ${stringLiteral(op.path)},`);
    out.push(`    clientOut: ${stringLiteral(op.clientOut)},`);
    out.push(`    hookOut: ${stringLiteral(op.hookOut)},`);
    out.push(`    queryKey: [${stringLiteral(op.domain)}, ${stringLiteral(op.operationId)}] as const,`);
    out.push(`    queryFn: () => ${clientFn}(options),`);
    out.push('  } as const;');
    out.push('}');
  } else {
    const callbackParam = params.length
      ? `options: ${hookOptionsType}`
      : `options: ${hookOptionsType} = {}`;
    out.push(`export function ${op.hookName}() {`);
    out.push('  return {');
    out.push(`    operationId: ${stringLiteral(op.operationId)},`);
    out.push(`    domain: ${stringLiteral(op.domain)},`);
    out.push(`    method: ${stringLiteral(op.method)},`);
    out.push(`    path: ${stringLiteral(op.path)},`);
    out.push(`    clientOut: ${stringLiteral(op.clientOut)},`);
    out.push(`    hookOut: ${stringLiteral(op.hookOut)},`);
    out.push(`    mutationKey: [${stringLiteral(op.domain)}, ${stringLiteral(op.operationId)}] as const,`);
    out.push(`    mutationFn: (${callbackParam}) => ${clientFn}(options),`);
    out.push('  } as const;');
    out.push('}');
  }
  return out.join('\n') + '\n';
}

function checkFilePathCollision(files) {
  const seen = new Map();
  for (const file of files) {
    const previous = seen.get(file.path);
    if (previous) {
      throw new CodegenModelError(
        `generated output path collision '${file.path}' between ${previous} and ${file.kind}:${file.operationId}`,
      );
    }
    seen.set(file.path, `${file.kind}:${file.operationId}`);
  }
}

export function renderCodegenFiles(model, opts = {}) {
  const normalized = normalizeCodegenModel(model, opts);
  const files = [];
  for (const op of normalized.operations) {
    files.push({
      kind: 'client',
      operationId: op.operationId,
      path: op.clientOut,
      content: renderCodegenClientFile(op),
    });
    files.push({
      kind: 'hook',
      operationId: op.operationId,
      path: op.hookOut,
      content: renderCodegenHookFile(op),
    });
  }
  files.sort((a, b) => compareText(a.path, b.path));
  checkFilePathCollision(files);
  return files;
}

function outputPathUnderBase(baseDir, outputPath) {
  const base = path.resolve(baseDir || process.cwd());
  const resolved = path.resolve(base, normalizeRelativeOut(outputPath));
  const rel = path.relative(base, resolved).replace(/\\/g, '/');
  if (!rel || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) {
    throw new CodegenModelError(`codegen filesystem output escaped baseDir: ${outputPath}`);
  }
  return resolved;
}

export function checkCodegenFiles(model, opts = {}) {
  const files = renderCodegenFiles(model, opts);
  const changes = [];
  for (const file of files) {
    const target = outputPathUnderBase(opts.baseDir, file.path);
    let current = null;
    try {
      current = fs.readFileSync(target, 'utf8');
    } catch {
      changes.push({ path: file.path, status: 'missing' });
      continue;
    }
    if (current !== file.content) changes.push({ path: file.path, status: 'different' });
  }
  return {
    ok: changes.length === 0,
    files: files.map((file) => file.path),
    changes,
  };
}

export function writeCodegenFiles(model, opts = {}) {
  const files = renderCodegenFiles(model, opts);
  for (const file of files) {
    const target = outputPathUnderBase(opts.baseDir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, 'utf8');
  }
  return files.map((file) => file.path);
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
