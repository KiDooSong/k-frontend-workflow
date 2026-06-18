// scripts/adapters/codegens/openapi-client.mjs - OpenAPI discovery adapter.
//
// The adapter reads OpenAPI documents and returns endpoint candidates only.
// Sorting, hook naming, output path naming, rendering, and writes are owned by codegen-core.
import fs from 'node:fs';
import path from 'node:path';
import { parse as yamlParse } from 'yaml';

export const name = 'openapi-client';
export const version = 1;

export const conventions = {
  hookPrefix: 'use',
  querySuffix: 'Query',
  mutationSuffix: 'Mutation',
  clientOut: '{roles.api_client}',
  hookOut: '{roles.hook}',
};

const HTTP_METHODS = new Set(['get', 'head', 'options', 'post', 'put', 'patch', 'delete']);

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isOpenApiCandidateFile(fileName) {
  return /(^|[.-])openapi\.(json|ya?ml)$/i.test(fileName);
}

function collectOpenApiFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        stack.push(full);
      } else if (entry.isFile() && isOpenApiCandidateFile(entry.name)) {
        out.push(full);
      }
    }
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function parseOpenApiFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  try {
    if (/\.json$/i.test(file)) return JSON.parse(raw);
    return yamlParse(raw);
  } catch (e) {
    throw new Error(`openapi-client: failed to parse ${file}: ${e.message}`);
  }
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function relativePath(baseDir, file) {
  return path.relative(baseDir, file).replace(/\\/g, '/');
}

function deriveDomain(pathKey, operation) {
  const explicit = operation && operation['x-workflow-domain'];
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const firstLiteral = String(pathKey)
    .split('/')
    .filter(Boolean)
    .find((segment) => !segment.startsWith('{') && !segment.startsWith(':'));
  if (!firstLiteral) {
    throw new Error(`openapi-client: cannot derive domain for path ${pathKey}; add x-workflow-domain`);
  }
  return firstLiteral;
}

function collectOperations(doc, sourceFile) {
  if (!isObject(doc) || !isObject(doc.paths)) {
    throw new Error(`openapi-client: malformed OpenAPI document (missing paths): ${sourceFile}`);
  }
  const operations = [];
  for (const pathKey of Object.keys(doc.paths)) {
    const pathItem = doc.paths[pathKey];
    if (!isObject(pathItem)) {
      throw new Error(`openapi-client: path item must be an object: ${pathKey}`);
    }
    for (const methodKey of Object.keys(pathItem)) {
      const lower = methodKey.toLowerCase();
      if (!HTTP_METHODS.has(lower)) continue;
      const operation = pathItem[methodKey];
      if (!isObject(operation)) {
        throw new Error(`openapi-client: operation must be an object: ${methodKey.toUpperCase()} ${pathKey}`);
      }
      if (typeof operation.operationId !== 'string' || !operation.operationId.trim()) {
        throw new Error(`openapi-client: operationId is missing: ${methodKey.toUpperCase()} ${pathKey}`);
      }
      operations.push({
        method: lower.toUpperCase(),
        path: pathKey,
        operationId: operation.operationId.trim(),
        domain: deriveDomain(pathKey, operation),
        sourceFile,
      });
    }
  }
  return operations;
}

export function discover(ctx = {}) {
  const schemaDir = ctx.apiSchemaDir || ctx.schemaDir;
  if (!schemaDir || !isDir(schemaDir)) {
    throw new Error(`openapi-client: api_schema directory not found: ${schemaDir || '(missing)'}`);
  }

  const baseDir = ctx.baseDir || process.cwd();
  const files = collectOpenApiFiles(schemaDir);
  if (!files.length) {
    throw new Error(`openapi-client: no OpenAPI files found under ${schemaDir}`);
  }

  const operations = [];
  const sourceFiles = [];
  for (const file of files) {
    const sourceFile = relativePath(baseDir, file);
    const doc = parseOpenApiFile(file);
    sourceFiles.push(sourceFile);
    operations.push(...collectOperations(doc, sourceFile));
  }
  if (!operations.length) {
    throw new Error(`openapi-client: no operations discovered under ${schemaDir}`);
  }

  return {
    adapter: name,
    version,
    source: ctx.source || 'src/api/schemas/**',
    sourceFiles,
    conventions,
    operations,
  };
}

export default { name, version, conventions, discover };
