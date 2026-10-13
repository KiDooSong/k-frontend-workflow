// #257: the one place a consumer declares scoped adoption. `frontend-workflow.config.yaml`
// at the project root names the `work_execution` overlay and the project layout. The
// five execution CLIs and visual-refresh read it as their default; the overlay is
// applied over whichever base policy was selected (bundled or --policy), so the
// bundled policy, its visual-refresh pin and vendored upgrades stay untouched. A base
// policy that declares work_execution, or owner documents that declare it without a
// configured overlay, are refused rather than judged.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { ArtifactPathError, canonicalRepositoryPath } from './artifact-path.mjs';
import { decodeScopedYaml, parseScopedPolicy } from './scoped-work-declarations.mjs';
import { CurrentWorkError } from './current-work-request.mjs';
import { VisualRefreshGitError } from './visual-refresh-git-objects.mjs';

export const WORK_CONFIG_FILE = 'frontend-workflow.config.yaml';
const CONFIG_KEYS = ['version', 'policy_overlay', 'layout'];
const MAX_BYTES = 16 * 1024 * 1024;

export class WorkConfigError extends Error {
  constructor(message) { super(`WORK-CONFIG: ${message}`); this.name = 'WorkConfigError'; }
}
const fail = (message) => { throw new WorkConfigError(message); };
const mapping = (value) => value && typeof value === 'object' && !Array.isArray(value);

// A canonical regular file under root: no symlink segment, no spelling alias.
function readCanonical(root, relative, label, { required }) {
  let file, raw;
  try { file = canonicalRepositoryPath(root, relative, { label, required, type: 'file' }); }
  catch (error) {
    if (error instanceof ArtifactPathError) fail(error.message.replace('required repository path is missing', 'missing'));
    if (error?.code) fail(`${label}: cannot inspect (${error.code})`);
    throw error;
  }
  if (!file.exists) return null;
  try { raw = fs.readFileSync(file.absolute); }
  catch (error) { fail(`${label}: cannot read (${error.code || error.message})`); }
  if (raw.length > MAX_BYTES) fail(`${label}: exceeds 16 MiB input limit`);
  let value;
  try { value = decodeScopedYaml(new TextDecoder('utf-8', { fatal: true }).decode(raw), `${label}: YAML`); }
  catch (error) { fail(error.message); }
  return { file: relative, raw, value };
}

// The overlay document: exactly one work_execution section, validated as policy.
export function parsePolicyOverlay(value, label = 'policy_overlay') {
  if (!mapping(value)) fail(`${label}: mapping required`);
  const extra = Object.keys(value).filter((key) => key !== 'work_execution');
  if (extra.length || !Object.hasOwn(value, 'work_execution')) {
    fail(`${label}: the overlay holds only work_execution${extra.length ? ` (found ${extra.join(', ')})` : ''}`);
  }
  // Its path checks reject a path such as ../src with VisualRefreshGitError.
  try { parseScopedPolicy(value.work_execution); }
  catch (error) {
    if (error instanceof CurrentWorkError || error instanceof VisualRefreshGitError) fail(`${label}: ${error.message}`);
    throw error;
  }
  return value.work_execution;
}

// null when the project has no config. A present config is fully validated, and
// the overlay it names must exist.
export function readWorkConfig(root) {
  const config = readCanonical(root, WORK_CONFIG_FILE, WORK_CONFIG_FILE, { required: false });
  if (!config) return null;
  const value = config.value;
  if (!mapping(value)) fail(`${WORK_CONFIG_FILE}: mapping required`);
  for (const key of Object.keys(value)) if (!CONFIG_KEYS.includes(key)) fail(`${WORK_CONFIG_FILE}: unsupported key ${key}`);
  if (value.version !== 1) fail(`${WORK_CONFIG_FILE}: version 1 required`);
  for (const key of ['policy_overlay', 'layout']) {
    if (Object.hasOwn(value, key) && typeof value[key] !== 'string') fail(`${WORK_CONFIG_FILE}: ${key}: project-relative path required`);
  }
  let overlay = null;
  if (Object.hasOwn(value, 'policy_overlay')) {
    const read = readCanonical(root, value.policy_overlay, `${WORK_CONFIG_FILE} policy_overlay`, { required: true });
    overlay = { file: read.file, raw: read.raw, work_execution: parsePolicyOverlay(read.value, `policy_overlay ${read.file}`) };
  }
  if (Object.hasOwn(value, 'layout')) {
    try { canonicalRepositoryPath(root, value.layout, { label: `${WORK_CONFIG_FILE} layout`, required: true, type: 'file' }); }
    catch (error) {
      if (error instanceof ArtifactPathError) fail(error.message.replace('required repository path is missing', 'missing'));
      if (error?.code) fail(`${WORK_CONFIG_FILE} layout: cannot inspect (${error.code})`);
      throw error;
    }
  }
  return { file: WORK_CONFIG_FILE, raw: config.raw, version: 1, policy_overlay: overlay, layout: value.layout ?? null };
}

// Owners whose ScreenSpec or shared-surface-spec declares work_execution, read
// from the same canonical Markdown domain as the adoption marker (docs except _meta).
// A document counts by its artifact_type, or by the file name workflow:state reads it
// under (domains/**/screen-spec.md, surface-spec.md) when artifact_type is missing; an
// owner without its id is named by its path. What could hide a declaration is refused
// rather than taken as declaring nothing: a directory that cannot be inspected or
// listed, a document that cannot be read, and an owner document by name whose
// frontmatter does not parse or is never closed (whether it declares cannot be known).
// Another document with broken frontmatter has no artifact_type to make it an owner,
// and workflow:state never judges it, so it is left as before.
function ownerMarkdownFiles(docsDir) {
  const out = [];
  let stat;
  try { stat = fs.statSync(docsDir, { throwIfNoEntry: false }); }
  catch (error) { fail(`${docsDir}: cannot inspect (${error.code || error.message}) to check owner declarations`); }
  if (!stat?.isDirectory()) return out;
  const stack = [docsDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (error) {
      fail(`${path.relative(docsDir, dir).split(path.sep).join('/') || '.'}: cannot list (${error.code || error.message}) to check owner declarations`);
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      // As walkFiles: dot directories and node_modules are not docs; _meta holds no owners.
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.') && entry.name !== '_meta') stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
    }
  }
  return out.sort();
}

export function declaredWorkOwners(docsDir) {
  const owners = new Set();
  for (const file of ownerMarkdownFiles(docsDir)) {
    const parts = path.relative(docsDir, file).split(path.sep);
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch (error) { fail(`${parts.join('/')}: cannot read (${error.code || error.message}) to check owner declarations`); }
    const { data, hasFrontmatter, parseError } = splitFrontmatter(raw);
    const byName = parts[0] === 'domains' ? parts.at(-1) : null;
    // Opened but with no closing --- line; an empty block (---, ---) is closed although
    // splitFrontmatter reads no frontmatter from it. Its parse error comes from body text
    // read up to a later --- line, which hides nothing the empty block could declare.
    const text = raw.replace(/^\uFEFF/, '');
    const unclosed = !hasFrontmatter && /^---\r?\n/.test(text) && !/^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.test(text);
    const emptyBlock = /^---\r?\n---[ \t]*(?:\r?\n|$)/.test(text);
    if ((byName === 'screen-spec.md' || byName === 'surface-spec.md') && ((parseError && !emptyBlock) || unclosed)) {
      fail(`${parts.join('/')}: frontmatter does not parse (${parseError || 'not closed'}) to check owner declarations`);
    }
    if (!hasFrontmatter || parseError || !mapping(data) || !Object.hasOwn(data, 'work_execution')) continue;
    const kind = data.artifact_type === 'screen-spec' || byName === 'screen-spec.md' ? 'screen'
      : data.artifact_type === 'shared-surface-spec' || byName === 'surface-spec.md' ? 'surface' : null;
    const id = kind && data[`${kind}_id`];
    if (kind) owners.add(`${kind}:${typeof id === 'string' && id ? id : parts.join('/')}`);
  }
  return [...owners].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

// Owner documents that declare work_execution need the configured overlay; without
// one they would be judged as unadopted. Entries that read no policy check only this.
export function assertAdoptionSource(config, docsDir) {
  if (config?.policy_overlay) return;
  const declared = typeof docsDir === 'string' ? declaredWorkOwners(docsDir) : [];
  if (declared.length) {
    fail(`owner documents declare work_execution (${declared.join(', ')}) but ${WORK_CONFIG_FILE} names no policy_overlay; ` +
      'refusing to judge them as unadopted');
  }
}

// Adoption lives only in the overlay; a base policy (bundled or --policy) never adopts.
export function assertBasePolicy(policy) {
  if (mapping(policy) && Object.hasOwn(policy, 'work_execution')) {
    fail(`the base policy must not declare work_execution; move it to the policy_overlay named by ${WORK_CONFIG_FILE}`);
  }
}

// The policy every judgment reads: the base policy with the configured overlay.
export function adoptionPolicy(policy, config, docsDir) {
  assertBasePolicy(policy);
  assertAdoptionSource(config, docsDir);
  return config?.policy_overlay ? { ...policy, work_execution: config.policy_overlay.work_execution } : policy;
}

// The layout path a run uses: the config's, unless an explicit --layout names
// another file. Without a config layout the explicit value (or the default) stands.
export function configuredLayout(config, explicitRelative) {
  if (!config?.layout) return explicitRelative;
  if (explicitRelative !== undefined && explicitRelative !== config.layout) {
    fail(`--layout ${explicitRelative} differs from ${WORK_CONFIG_FILE} layout ${config.layout}`);
  }
  return config.layout;
}

// The project root of an entry without --root: the directory that holds a
// `<root>/docs/frontend-workflow` docs directory (as workflow:report infers it for its
// monorepo diff prefix), otherwise the working directory. The default docs path gives
// the working directory itself.
export function legacyProjectRoot(docsDir) {
  const docs = path.resolve(docsDir || 'docs/frontend-workflow');
  return path.basename(docs) === 'frontend-workflow' && path.basename(path.dirname(docs)) === 'docs'
    ? path.dirname(path.dirname(docs)) : process.cwd();
}

// A child CLI marks its own configuration refusal with a token its parent passes in
// this variable (util.mjs runCli and the visual CLIs write the line), so text an
// error merely echoes, such as a ref name, is never taken for a refusal.
export const REFUSAL_TOKEN_ENV = 'FRONTEND_WORKFLOW_REFUSAL_TOKEN';
export const newRefusalToken = () => crypto.randomBytes(16).toString('hex');
export function markWorkConfigRefusal(message) {
  const token = process.env[REFUSAL_TOKEN_ENV];
  if (token) process.stderr.write(`${token} ${message}\n`);
}

// The configuration refusal a child CLI marked with `token` on stderr, or null. An
// entry that collects a child's result as evidence must not turn that refusal into a
// success.
export function workConfigRefusal(text, token) {
  if (typeof token !== 'string' || !token) return null;
  const prefix = `${token} `;
  return String(text || '').split('\n').find((line) => line.startsWith(prefix))?.slice(prefix.length).trim() || null;
}

// Entries that read the live tree (legacy readiness/forbidden-paths, packet, report):
// the config sits at --root, or at legacyProjectRoot when the entry has none, and an
// explicit --layout is a path from the working directory. Returns the config and the
// layout file to load (absolute), or the explicit value when no config layout.
export function liveWorkConfig(root, layoutFlag) {
  // A root that does not resolve holds no config; the entry reports its own root errors.
  let realRoot = path.resolve(root || '.');
  try { realRoot = fs.realpathSync(realRoot); } catch {}
  const config = readWorkConfig(realRoot);
  if (!config?.layout) return { config, root: realRoot, layout: layoutFlag };
  let explicit;
  if (typeof layoutFlag === 'string') {
    let physical = path.resolve(layoutFlag);
    try { physical = fs.realpathSync(physical); } catch {}
    explicit = path.relative(realRoot, physical).split(path.sep).join('/');
  }
  return { config, root: realRoot, layout: path.join(realRoot, ...configuredLayout(config, explicit).split('/')) };
}
